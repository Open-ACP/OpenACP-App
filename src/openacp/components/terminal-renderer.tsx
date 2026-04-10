import React, { useRef, useEffect, useCallback } from "react"
import type { PtyBackend } from "../lib/pty-backend"

type GhosttyMod = typeof import("ghostty-web")

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

      const term = new mod.Terminal({
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

      const fit = new mod.FitAddon()
      term.loadAddon(fit)

      term.open(container)

      // Fit after a frame to ensure container has dimensions
      requestAnimationFrame(() => {
        if (cancelled) return
        handleResize(fit, term)
        onReady?.()
      })

      // Stream PTY output -> terminal
      const unData = await backend.onData(sessionId, (data) => {
        term.write(data)
      })
      cleanups.push(unData)

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

  return (
    <div
      ref={containerRef}
      className={`h-full w-full overflow-hidden ${className ?? ""}`}
      style={{ backgroundColor: "#0a0a0a" }}
    />
  )
})
