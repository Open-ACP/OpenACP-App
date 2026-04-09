import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  ArrowSquareOut,
  X,
  ArrowsOutSimple,
  ArrowsInSimple,
  PictureInPicture,
  Warning,
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

  useLayoutEffect(() => {
    if (!active || mode !== "docked") return
    sync()
  }, [active, mode, sync])

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
      void browser.navigate(finalUrl)
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
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border-weak">
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
              {browser.mode === "floating" && <ArrowsOutSimple size={14} />}
              {browser.mode === "pip" && <PictureInPicture size={14} />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handleSetMode("docked")}>
              <ArrowsInSimple size={14} className="mr-2" /> Docked
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleSetMode("floating")}>
              <ArrowsOutSimple size={14} className="mr-2" /> Floating
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleSetMode("pip")}>
              <PictureInPicture size={14} className="mr-2" /> Picture in Picture
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
              Browser is in {browser.mode} mode
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
      </div>
    </div>
  )
}
