import React, { useRef, useEffect, useCallback, useState } from "react"
import { createPortal } from "react-dom"
import type { PtyBackend } from "../lib/pty-backend"
import { MagnifyingGlass, X } from "@phosphor-icons/react"

type GhosttyMod = typeof import("ghostty-web")

// Matches `path/to/file.ext:line` or `path/to/file.ext:line:col`, including
// leading `./`, `../` and `~/` paths. Kept intentionally conservative to
// avoid false positives in free-form log output.
const FILE_REF_RE = /(?:\.{1,2}\/|~\/|\/)?[\w./\-]+?\.[\w]+:\d+(?::\d+)?/g

/** Shared loader — only loads WASM once */
let loadPromise: Promise<{ mod: GhosttyMod; ghostty: InstanceType<GhosttyMod["Ghostty"]> }> | undefined

function loadGhosttyWeb() {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const mod = await import("ghostty-web")
    // Ghostty.load() fetches + compiles the WASM module
    const ghostty = await mod.Ghostty.load()
    return { mod, ghostty }
  })()
  loadPromise.catch(() => { loadPromise = undefined })
  return loadPromise
}

interface TerminalRendererProps {
  sessionId: string
  backend: PtyBackend
  className?: string
  onReady?: () => void
}

/**
 * Renders a single terminal session using ghostty-web.
 * Isolated component for performance — avoids re-renders from parent.
 */
export const TerminalRenderer = React.memo(function TerminalRenderer({
  sessionId,
  backend,
  className,
  onReady,
}: TerminalRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<InstanceType<GhosttyMod["Terminal"]> | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchStatus, setSearchStatus] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const handleResize = useCallback((fit: any, _term: any) => {
    try {
      fit.fit()
      const dims = fit.proposeDimensions()
      if (dims) {
        backend.resize(sessionId, dims.cols, dims.rows)
      }
    } catch {
      // Ignore resize errors during mount/unmount
    }
  }, [backend, sessionId])

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const cleanups: Array<() => void> = []
    let cancelled = false

    ;(async () => {
      const { mod, ghostty } = await loadGhosttyWeb()
      if (cancelled) return

      const term: InstanceType<GhosttyMod["Terminal"]> = new mod.Terminal({
        ghostty,
        cursorBlink: true,
        cursorStyle: "bar",
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Geist Mono', 'SF Mono', Menlo, monospace",
        allowTransparency: false,
        scrollback: 10_000,
        theme: {
          background: "#0a0a0a",
          foreground: "#d4d4d8",
          cursor: "#d4d4d8",
          selectionBackground: "rgba(212,212,216,0.2)",
          black: "#18181b",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#eab308",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#d4d4d8",
          brightBlack: "#52525b",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#facc15",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#22d3ee",
          brightWhite: "#fafafa",
        },
      })
      cleanups.push(() => term.dispose())
      termRef.current = term
      cleanups.push(() => { if (termRef.current === term) termRef.current = null })

      const fit = new mod.FitAddon()
      term.loadAddon(fit)

      term.open(container)

      // Link detection and key handler must be registered AFTER term.open() —
      // both rely on internal subsystems (link detector, input handler) that
      // are only created during open(). Registering earlier leaves the
      // terminal in a broken state and the canvas never renders.
      term.registerLinkProvider({
        provideLinks(y: number, callback: (links: any[] | undefined) => void) {
          const buffer = term.buffer.active
          const line = buffer.getLine(y)
          if (!line) { callback(undefined); return }
          const text = line.translateToString(true)
          if (!text) { callback(undefined); return }
          const matches = [...text.matchAll(FILE_REF_RE)]
          if (matches.length === 0) { callback(undefined); return }
          const links = matches.map((m) => {
            const start = m.index ?? 0
            const end = start + m[0].length
            return {
              text: m[0],
              range: {
                start: { x: start + 1, y: y + 1 },
                end: { x: end, y: y + 1 },
              },
              activate(_ev: MouseEvent) {
                const [path, lineStr, colStr] = m[0].split(":")
                window.dispatchEvent(new CustomEvent("terminal-link-click", {
                  detail: {
                    path,
                    line: lineStr ? parseInt(lineStr, 10) : undefined,
                    column: colStr ? parseInt(colStr, 10) : undefined,
                  },
                }))
              },
            }
          })
          callback(links)
        },
      })

      // Cmd/Ctrl+F opens the find overlay. The handler contract here is:
      // return `true` to PREVENT default terminal handling, `false` to let
      // the key through to the PTY. Only swallow the find shortcut; every
      // other keystroke must pass through so the user can actually type.
      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.type !== "keydown") return false
        const withMod = event.metaKey || event.ctrlKey
        if (withMod && event.key.toLowerCase() === "f") {
          event.preventDefault()
          setSearchOpen(true)
          requestAnimationFrame(() => searchInputRef.current?.focus())
          return true
        }
        return false
      })

      // Fit after a frame to ensure container has dimensions
      requestAnimationFrame(() => {
        if (cancelled) return
        handleResize(fit, term)
        onReady?.()
      })

      // Stream PTY output -> terminal. Subscribe BEFORE calling startStream
      // so the drain + subsequent live chunks arrive in order.
      const unData = await backend.onData(sessionId, (data) => {
        term.write(data)
      })
      cleanups.push(unData)

      // Drain any output the shell produced before we were subscribed (initial
      // prompt, rc-file echoes). startStream is idempotent; a second tab
      // mounting the same session id after dispose would just get "".
      try {
        const initial = await backend.startStream(sessionId)
        if (initial && !cancelled) term.write(initial)
      } catch (e) {
        // Older backends may not implement startStream — tolerate silently.
        console.warn("[terminal] startStream unavailable:", e)
      }

      // Terminal input -> PTY
      const onDataDisposable = term.onData((data: string) => {
        backend.write(sessionId, data)
      })
      cleanups.push(() => onDataDisposable.dispose())

      // PTY exit -> show message
      const unExit = await backend.onExit(sessionId, () => {
        term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n")
      })
      cleanups.push(unExit)

      // Observe container resize
      const observer = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (!cancelled) handleResize(fit, term)
        })
      })
      observer.observe(container)
      cleanups.push(() => observer.disconnect())
    })()

    return () => {
      cancelled = true
      cleanups.forEach((fn) => fn())
    }
  }, [sessionId, backend, handleResize, onReady])

  // Incremental-search cursor: previous match index so repeated Enter steps forward.
  // Reset whenever the query changes.
  const lastMatchRef = useRef<{ query: string; y: number; x: number } | null>(null)
  useEffect(() => { lastMatchRef.current = null }, [searchQuery])

  const runSearch = useCallback((direction: "next" | "prev") => {
    const term = termRef.current
    const q = searchQuery.trim()
    if (!term || !q) return

    const buffer = term.buffer.active
    const total = buffer.length
    if (total === 0) { setSearchStatus("No matches"); return }

    const cursor = lastMatchRef.current
    const startY = cursor && cursor.query === q
      ? cursor.y
      : direction === "next" ? 0 : total - 1

    const needle = q.toLowerCase()
    const step = direction === "next" ? 1 : -1
    for (let i = 0; i < total; i++) {
      // Skip the current match row on the first iteration so repeated searches advance.
      const y = ((startY + step * (i + (cursor && cursor.query === q ? 1 : 0))) % total + total) % total
      const line = buffer.getLine(y)
      if (!line) continue
      const text = line.translateToString(true)
      if (!text) continue
      const idx = text.toLowerCase().indexOf(needle)
      if (idx >= 0) {
        term.scrollToLine(Math.max(0, y - Math.floor(term.rows / 2)))
        try {
          term.select(idx, y, q.length)
        } catch {
          // Some versions don't support cross-line select — scrolling alone is still useful.
        }
        lastMatchRef.current = { query: q, y, x: idx }
        setSearchStatus(null)
        return
      }
    }
    setSearchStatus("No matches")
  }, [searchQuery])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchStatus(null)
    termRef.current?.focus()
  }, [])

  // Anchor the search overlay to the container's viewport rect via a portal so
  // we never touch the DOM tree that Ghostty's canvas renders into.
  const [overlayPos, setOverlayPos] = useState<{ top: number; right: number } | null>(null)
  useEffect(() => {
    if (!searchOpen) { setOverlayPos(null); return }
    function update() {
      const el = containerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setOverlayPos({ top: r.top + 8, right: Math.max(8, window.innerWidth - r.right + 8) })
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [searchOpen])

  return (
    <>
      <div
        ref={containerRef}
        className={`h-full w-full overflow-hidden ${className ?? ""}`}
        style={{ backgroundColor: "#0a0a0a" }}
      />
      {searchOpen && overlayPos && createPortal(
        <div
          className="fixed z-50 flex items-center gap-1 rounded-md border border-border-weak bg-bg-strong px-2 py-1 shadow-lg"
          style={{ top: overlayPos.top, right: overlayPos.right }}
        >
          <MagnifyingGlass size={12} className="opacity-60" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                runSearch(e.shiftKey ? "prev" : "next")
              } else if (e.key === "Escape") {
                e.preventDefault()
                closeSearch()
              }
            }}
            placeholder="Find in terminal"
            className="h-6 w-48 bg-transparent text-xs outline-none placeholder:opacity-50"
          />
          {searchStatus && <span className="text-2xs opacity-60">{searchStatus}</span>}
          <button
            type="button"
            onClick={closeSearch}
            className="flex h-5 w-5 items-center justify-center rounded opacity-60 hover:bg-accent hover:opacity-100"
            aria-label="Close find"
          >
            <X size={10} />
          </button>
        </div>,
        document.body,
      )}
    </>
  )
})
