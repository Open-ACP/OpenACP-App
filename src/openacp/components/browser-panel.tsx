import React, { useCallback, useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  ArrowSquareOut,
  X,
  ArrowsInSimple,
  PictureInPicture,
  AppWindow,
  Warning,
  Globe,
} from "@phosphor-icons/react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Button } from "./ui/button"
import { ResizeHandle } from "./ui/resize-handle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { useBrowserPanel, type BrowserMode } from "../context/browser-panel"

const DEFAULT_WIDTH = 480
const MIN_WIDTH = 320
const MAX_WIDTH = 900

function useBoundsSyncDocked(
  containerRef: React.RefObject<HTMLDivElement | null>,
  mode: BrowserMode,
  active: boolean,
) {
  const sync = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width < 10) return
    invoke("browser_set_mode", {
      mode: "docked",
      bounds: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    }).catch(() => {})
  }, [containerRef])

  // On mount / activation, the AnimatePresence slide-in animation is running,
  // so the container's left/width may still be at their animated intermediate
  // values. A single useLayoutEffect fire would miss the final position.
  // Instead, poll on every RAF for the animation duration (~300ms budget) and
  // re-sync whenever the rect changes. Stops early once the rect stabilizes
  // for two consecutive frames.
  useEffect(() => {
    if (!active || mode !== "docked") return
    const el = containerRef.current
    if (!el) return

    let rafId: number | null = null
    let elapsed = 0
    let lastKey = ""
    let stableFrames = 0
    const startTime = performance.now()

    const tick = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const key = `${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}`
      if (rect.width >= 10) {
        if (key !== lastKey) {
          sync()
          lastKey = key
          stableFrames = 0
        } else {
          stableFrames++
        }
      }
      elapsed = performance.now() - startTime
      // Stop after 400ms OR after the rect has been stable for 3 frames
      if (elapsed < 400 && stableFrames < 3) {
        rafId = requestAnimationFrame(tick)
      }
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [active, mode, sync, containerRef])

  // Window resize — debounced trailing via RAF
  useEffect(() => {
    if (!active || mode !== "docked") return
    let rafId: number | null = null
    function onResize() {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        sync()
        rafId = null
      })
    }
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [active, mode, sync])

  return sync
}

export function BrowserPanel() {
  const browser = useBrowserPanel()
  const containerRef = useRef<HTMLDivElement>(null)
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const [inputUrl, setInputUrl] = useState(browser.url ?? "")

  // Keep address bar in sync with authoritative URL
  useEffect(() => {
    if (browser.url) setInputUrl(browser.url)
  }, [browser.url])

  useBoundsSyncDocked(
    containerRef,
    browser.mode,
    browser.kind === "ready" && !isDragging,
  )

  const handleResizeStart = useCallback(() => {
    setIsDragging(true)
    if (browser.mode === "docked") {
      invoke("browser_suppress").catch(() => {})
    }
  }, [browser.mode])

  const handleResizeEnd = useCallback(() => {
    setIsDragging(false)
    if (browser.mode === "docked") {
      // Sync final bounds then unsuppress
      const el = containerRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        invoke("browser_set_mode", {
          mode: "docked",
          bounds: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },
        })
          .catch(() => {})
          .finally(() => {
            invoke("browser_unsuppress").catch(() => {})
          })
      } else {
        invoke("browser_unsuppress").catch(() => {})
      }
    }
  }, [browser.mode])

  const handleSubmitUrl = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = inputUrl.trim()
      if (!trimmed) return
      let finalUrl = trimmed
      const looksLikeUrl = /^https?:\/\//i.test(trimmed)
      const looksLikeDomain = /^[^\s]+\.[^\s]+$/.test(trimmed)
      if (!looksLikeUrl) {
        if (looksLikeDomain) {
          finalUrl = `https://${trimmed}`
        } else {
          finalUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
        }
      }
      // Use open() — it handles both create-webview (idle state) and navigate-existing.
      // Rust browser_show command internally checks if webview exists and routes accordingly.
      void browser.open(finalUrl)
    },
    [inputUrl, browser],
  )

  const handleSetMode = useCallback(
    (mode: BrowserMode) => {
      if (mode === "docked") {
        const el = containerRef.current
        if (!el) {
          void browser.setMode("docked")
          return
        }
        const rect = el.getBoundingClientRect()
        void browser.setMode("docked", {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        })
      } else {
        void browser.setMode(mode)
      }
    },
    [browser],
  )

  const handleOpenExternal = useCallback(() => {
    if (browser.url) openUrl(browser.url).catch(console.error)
  }, [browser.url])

  const handleRetry = useCallback(() => {
    if (browser.url) void browser.navigate(browser.url)
  }, [browser])

  const isLoading = browser.kind === "opening" || browser.kind === "navigating"
  const showError = browser.kind === "error" && browser.error
  const isEmpty = browser.kind === "idle" && !isLoading && !showError

  return (
    <div
      className="relative flex flex-col h-full border-l border-border-weak bg-background"
      style={{ width: panelWidth }}
    >
      <ResizeHandle
        direction="horizontal"
        edge="start"
        size={panelWidth}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        onResize={setPanelWidth}
        onResizeStart={handleResizeStart}
        onResizeEnd={handleResizeEnd}
      />

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-1 px-2 h-9 border-b border-border-weak">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void browser.back()}
          disabled={!browser.canGoBack}
          title="Back"
        >
          <ArrowLeft size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void browser.forward()}
          disabled={!browser.canGoForward}
          title="Forward"
        >
          <ArrowRight size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void browser.reload()}
          title="Reload"
        >
          <ArrowClockwise size={14} />
        </Button>

        <form className="flex-1 min-w-0" onSubmit={handleSubmitUrl}>
          <input
            className="w-full h-7 px-2 text-xs rounded-md border border-border bg-background text-foreground outline-none focus:border-primary font-mono truncate"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Enter URL or search..."
            spellCheck={false}
          />
        </form>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" title="Mode">
              {browser.mode === "docked" && <ArrowsInSimple size={14} />}
              {browser.mode === "floating" && <PictureInPicture size={14} />}
              {browser.mode === "pip" && <AppWindow size={14} />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handleSetMode("docked")}>
              <ArrowsInSimple size={14} className="mr-2" /> Docked
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleSetMode("floating")}>
              <PictureInPicture size={14} className="mr-2" /> Picture in Picture
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleSetMode("pip")}>
              <AppWindow size={14} className="mr-2" /> Pop-out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon-sm" onClick={handleOpenExternal} title="Open in system browser">
          <ArrowSquareOut size={14} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => void browser.close()} title="Close">
          <X size={14} />
        </Button>
      </div>

      {/* Top-bar loading indicator */}
      {isLoading && (
        <div className="absolute top-[38px] left-0 right-0 h-0.5 bg-primary/20 overflow-hidden pointer-events-none">
          <div className="h-full w-1/3 bg-primary animate-[loading_1.2s_ease-in-out_infinite]" />
        </div>
      )}

      {/* Content container — native webview overlays this area */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {isDragging && (
          <div className="absolute inset-0 bg-muted/40 border border-dashed border-border-weak flex items-center justify-center">
            <div className="text-xs text-muted-foreground">Resizing…</div>
          </div>
        )}
        {browser.mode !== "docked" && browser.kind === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80">
            <div className="text-sm text-muted-foreground">
              {browser.mode === "floating"
                ? "Browser is in Picture in Picture"
                : "Browser is popped out"}
            </div>
            <Button variant="outline" size="sm" onClick={() => handleSetMode("docked")}>
              Dock here
            </Button>
          </div>
        )}
        {showError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6">
            <Warning size={32} className="text-destructive" />
            <div className="text-sm font-medium">Failed to load</div>
            <div className="text-xs text-muted-foreground max-w-[260px] text-center font-mono break-all">
              {browser.url}
            </div>
            <div className="text-xs text-muted-foreground max-w-[280px] text-center">
              {browser.error}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Retry
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenExternal}>
                Open externally
              </Button>
            </div>
          </div>
        )}
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background p-6 pointer-events-none">
            <Globe size={32} className="text-muted-foreground/60" />
            <div className="text-sm text-muted-foreground">In-app browser</div>
            <div className="text-xs text-muted-foreground/70 max-w-[260px] text-center">
              Type a URL or search query above, or click a link in chat to begin.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
