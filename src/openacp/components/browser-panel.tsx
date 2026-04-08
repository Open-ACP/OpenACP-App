import React, { useState, useRef, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ArrowLeft, ArrowRight, ArrowClockwise, ArrowSquareOut, X, ArrowsOutSimple, ArrowsInSimple } from "@phosphor-icons/react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Button } from "./ui/button"
import { ResizeHandle } from "./ui/resize-handle"

interface BrowserPanelProps {
  url: string | null
  onClose: () => void
  onUrlChange?: (url: string) => void
}

const DEFAULT_WIDTH = 480
const MIN_WIDTH = 320
const MAX_WIDTH = 900

export function BrowserPanel({ url, onClose, onUrlChange }: BrowserPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentUrl, setCurrentUrl] = useState(url || "")
  const [inputUrl, setInputUrl] = useState(url || "")
  const [webviewReady, setWebviewReady] = useState(false)
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)
  const [floating, setFloating] = useState(false)
  const rafRef = useRef<number>()

  const syncBounds = useCallback(async () => {
    const el = containerRef.current
    if (!el || floating) return
    const rect = el.getBoundingClientRect()
    if (rect.width < 10) return
    try {
      await invoke("browser_set_bounds", {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      })
    } catch {
      // webview may not exist yet
    }
  }, [floating])

  // Open webview when URL changes — delay to let AnimatePresence finish sliding
  useEffect(() => {
    if (!url) return
    setCurrentUrl(url)
    setInputUrl(url)

    const el = containerRef.current
    if (!el) return

    const timer = setTimeout(() => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 10) return
      invoke("browser_open", {
        url,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      })
        .then(() => setWebviewReady(true))
        .catch((e) => console.error("[browser-panel] open failed:", e))
    }, 250)

    return () => {
      clearTimeout(timer)
      invoke("browser_close").catch(() => {})
      setWebviewReady(false)
    }
  }, [url])

  // Sync bounds on resize
  useEffect(() => {
    if (!webviewReady || floating) return

    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => syncBounds())
    })
    observer.observe(el)

    window.addEventListener("resize", syncBounds)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", syncBounds)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [webviewReady, floating, syncBounds])

  // Sync after panel resize
  useEffect(() => {
    if (webviewReady && !floating) syncBounds()
  }, [panelWidth, webviewReady, floating, syncBounds])

  const handleNavigate = useCallback(
    (targetUrl: string) => {
      const trimmed = targetUrl.trim()
      if (!trimmed) return
      const finalUrl = trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`
      setCurrentUrl(finalUrl)
      setInputUrl(finalUrl)
      onUrlChange?.(finalUrl)
      if (webviewReady) {
        invoke("browser_navigate", { url: finalUrl }).catch(console.error)
      }
    },
    [webviewReady, onUrlChange],
  )

  const handleBack = () => invoke("browser_eval", { js: "history.back()" }).catch(console.error)
  const handleForward = () => invoke("browser_eval", { js: "history.forward()" }).catch(console.error)
  const handleReload = () => invoke("browser_eval", { js: "location.reload()" }).catch(console.error)
  const handleOpenExternal = () => { if (currentUrl) openUrl(currentUrl).catch(console.error) }

  const handleClose = () => {
    invoke("browser_close").catch(() => {})
    onClose()
  }

  const toggleFloating = useCallback(async () => {
    if (!webviewReady) return
    if (floating) {
      // Dock back — close floating window, recreate as child webview
      setFloating(false)
      const el = containerRef.current
      if (!el) return
      // Small delay for React to re-render
      setTimeout(async () => {
        const rect = el.getBoundingClientRect()
        try {
          await invoke("browser_dock", {
            url: currentUrl,
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          })
        } catch (e) {
          console.error("[browser-panel] dock failed:", e)
        }
      }, 50)
    } else {
      // Float — close child webview, open as standalone PiP window
      setFloating(true)
      try {
        await invoke("browser_float", { url: currentUrl })
      } catch (e) {
        console.error("[browser-panel] float failed:", e)
      }
    }
  }, [floating, webviewReady, currentUrl])

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
      />

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border-weak">
        <Button variant="ghost" size="icon-sm" onClick={handleBack} title="Back">
          <ArrowLeft size={14} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleForward} title="Forward">
          <ArrowRight size={14} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleReload} title="Reload">
          <ArrowClockwise size={14} />
        </Button>

        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault()
            handleNavigate(inputUrl)
          }}
        >
          <input
            className="w-full h-7 px-2 text-xs rounded-md border border-border bg-background text-foreground outline-none focus:border-primary font-mono truncate"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Enter URL..."
            spellCheck={false}
          />
        </form>

        <Button variant="ghost" size="icon-sm" onClick={toggleFloating} title={floating ? "Dock panel" : "Float panel"}>
          {floating ? <ArrowsInSimple size={14} /> : <ArrowsOutSimple size={14} />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleOpenExternal} title="Open in browser">
          <ArrowSquareOut size={14} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleClose} title="Close">
          <X size={14} />
        </Button>
      </div>

      {/* Webview container — Tauri webview overlays this area */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {!webviewReady && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}
        {floating && webviewReady && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-background/50">
            Browser is floating — click dock to return
          </div>
        )}
      </div>
    </div>
  )
}
