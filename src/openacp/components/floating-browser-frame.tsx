import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ArrowClockwise, ArrowsInSimple, X } from "@phosphor-icons/react"
import { Button } from "./ui/button"
import { useBrowserPanel } from "../context/browser-panel"

/**
 * In-app floating browser — a mini player hosted inside the main window.
 * Starts at the bottom-right corner and is both **draggable** (via the chrome
 * strip) and **resizable** (via the bottom-right corner handle). The native
 * child webview is positioned beneath the HTML chrome strip using bounds
 * computed from `webviewAreaRef` after every layout change.
 *
 * Only rendered when `browser.mode === "floating" && browser.isVisible`.
 */
const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 268 // 28px chrome + 240px webview
const CHROME_HEIGHT = 28
const MIN_WIDTH = 280
const MIN_HEIGHT = 180
const MARGIN = 24

// The floating frame is naturally clamped by the main window it lives in,
// so the "maximum" resize bound is computed at resize time from
// window.innerWidth / innerHeight (minus a small safety margin), not a
// hard constant. Users can drag corners/edges until they hit the window
// border.
function getMaxWidth(): number {
  return Math.max(MIN_WIDTH, window.innerWidth - 16)
}
function getMaxHeight(): number {
  return Math.max(MIN_HEIGHT, window.innerHeight - 16)
}

export function FloatingBrowserFrame() {
  const browser = useBrowserPanel()
  const frameRef = useRef<HTMLDivElement>(null)
  const webviewAreaRef = useRef<HTMLDivElement>(null)

  // null position → pin to bottom-right default. Any drag materializes it
  // into an absolute {x,y} pair.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT })
  const [isInteracting, setIsInteracting] = useState(false)

  const syncBounds = useCallback(() => {
    const el = webviewAreaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width < 10 || rect.height < 10) return
    invoke("browser_set_mode", {
      mode: "floating",
      bounds: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
    }).catch(() => {})
  }, [])

  // Sync bounds whenever layout settles (mode switch, visibility, pos/size
  // change, interaction end). Skipped while interacting so the native webview
  // doesn't chase the HTML frame on every frame (it's suppressed then).
  useLayoutEffect(() => {
    if (browser.mode !== "floating" || !browser.isVisible) return
    if (isInteracting) return
    syncBounds()
  }, [browser.mode, browser.isVisible, isInteracting, pos, size, syncBounds])

  // Window resize: re-sync when the user resizes the main window (default
  // bottom-right positioning shifts with the window size).
  useEffect(() => {
    if (browser.mode !== "floating" || !browser.isVisible) return
    let raf: number | null = null
    function onResize() {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        syncBounds()
        raf = null
      })
    }
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [browser.mode, browser.isVisible, syncBounds])

  const clampPos = useCallback(
    (x: number, y: number, w: number, h: number) => ({
      x: Math.max(0, Math.min(window.innerWidth - w, x)),
      y: Math.max(0, Math.min(window.innerHeight - h, y)),
    }),
    [],
  )

  const beginInteraction = useCallback(async () => {
    setIsInteracting(true)
    try {
      await invoke("browser_suppress")
    } catch {
      // ignore
    }
  }, [])

  const endInteraction = useCallback(async () => {
    // Sync bounds to final position BEFORE unsuppressing so the webview
    // reappears at the new spot rather than flashing at the old one.
    const el = webviewAreaRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      if (rect.width >= 10 && rect.height >= 10) {
        try {
          await invoke("browser_set_mode", {
            mode: "floating",
            bounds: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            },
          })
        } catch {
          // ignore
        }
      }
    }
    try {
      await invoke("browser_unsuppress")
    } catch {
      // ignore
    }
    setIsInteracting(false)
  }, [])

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      // Ignore drags initiated on buttons within the chrome
      if ((e.target as HTMLElement).closest("button")) return
      e.preventDefault()

      const el = frameRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const startX = rect.left
      const startY = rect.top
      const startMouseX = e.clientX
      const startMouseY = e.clientY

      void beginInteraction()
      // Lock pos to current bounding rect so the frame stops following the
      // bottom-right default during the drag.
      setPos({ x: startX, y: startY })

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouseX
        const dy = ev.clientY - startMouseY
        setPos(clampPos(startX + dx, startY + dy, size.w, size.h))
      }
      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        void endInteraction()
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [size.w, size.h, clampPos, beginInteraction, endInteraction],
  )

  type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

  const handleResizeStart = useCallback(
    (edge: Edge) => (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const el = frameRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const startX = rect.left
      const startY = rect.top
      const startW = size.w
      const startH = size.h
      const startMouseX = e.clientX
      const startMouseY = e.clientY

      const affectsTop = edge.includes("n")
      const affectsBottom = edge.includes("s")
      const affectsLeft = edge.includes("w")
      const affectsRight = edge.includes("e")

      // Materialize pos so resizing doesn't fight the bottom-right default.
      setPos({ x: startX, y: startY })
      void beginInteraction()

      const maxW = getMaxWidth()
      const maxH = getMaxHeight()

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouseX
        const dy = ev.clientY - startMouseY

        let newX = startX
        let newY = startY
        let newW = startW
        let newH = startH

        if (affectsRight) {
          // Clamp so the frame doesn't exceed the right edge of the window
          const maxByViewport = window.innerWidth - startX - 8
          newW = Math.max(MIN_WIDTH, Math.min(Math.min(maxW, maxByViewport), startW + dx))
        }
        if (affectsLeft) {
          // Don't let the left edge go past x=0, nor shrink below MIN_WIDTH
          const minXAllowed = 0
          const maxDxLeft = startX - minXAllowed
          const minDxLeft = startW - maxW
          const clampedDx = Math.max(minDxLeft, Math.min(maxDxLeft, dx))
          newW = Math.max(MIN_WIDTH, startW - clampedDx)
          newX = startX + (startW - newW)
        }
        if (affectsBottom) {
          const maxByViewport = window.innerHeight - startY - 8
          newH = Math.max(MIN_HEIGHT, Math.min(Math.min(maxH, maxByViewport), startH + dy))
        }
        if (affectsTop) {
          const minYAllowed = 0
          const maxDyTop = startY - minYAllowed
          const minDyTop = startH - maxH
          const clampedDy = Math.max(minDyTop, Math.min(maxDyTop, dy))
          newH = Math.max(MIN_HEIGHT, startH - clampedDy)
          newY = startY + (startH - newH)
        }

        setSize({ w: newW, h: newH })
        setPos({ x: newX, y: newY })
      }
      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        void endInteraction()
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [size.w, size.h, beginInteraction, endInteraction],
  )

  if (browser.mode !== "floating" || !browser.isVisible) return null

  const handleDock = () => {
    // If there's a live webview, switch mode via Rust. If no webview
    // (empty frame from stale floating mode), just close so the user
    // returns to the clean docked empty state on next toggle.
    if (browser.kind === "ready" || browser.kind === "opening") {
      void browser.setMode("docked")
    } else {
      void browser.close()
    }
  }
  const handleReload = () => void browser.reload()
  const handleClose = () => void browser.close()

  const frameStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, width: size.w, height: size.h }
    : { right: MARGIN, bottom: MARGIN, width: size.w, height: size.h }

  return (
    <div
      ref={frameRef}
      className="fixed bg-background border border-border-weak rounded-lg shadow-2xl overflow-hidden z-50 flex flex-col"
      style={frameStyle}
    >
      {/* Chrome strip — HTML, visible above the native webview. Acts as drag
          handle (mousedown anywhere except buttons starts a drag). */}
      <div
        className="shrink-0 flex items-center gap-1 px-2 border-b border-border-weak bg-card select-none cursor-move"
        style={{ height: CHROME_HEIGHT }}
        onMouseDown={handleDragStart}
      >
        <div className="flex-1 text-[10px] text-muted-foreground truncate font-mono px-1 pointer-events-none">
          {browser.url ?? "Floating browser"}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={handleReload} title="Reload">
          <ArrowClockwise size={12} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleDock} title="Dock">
          <ArrowsInSimple size={12} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleClose} title="Close">
          <X size={12} />
        </Button>
      </div>

      {/*
        Webview area — transparent HTML div, native webview is positioned on
        top of this region via syncBounds().

        IMPORTANT: the native webview layer ALWAYS covers HTML underneath it
        on its own rect. So if the webview rect extends to the frame borders,
        the left/right/bottom resize handles (HTML elements at the frame
        edges) become unclickable — mouse events are captured by the webview.

        Fix: inset the webview area by 8px on left/right/bottom, leaving an
        HTML-only border strip where the resize handles can receive clicks.
        Top edge handle is covered by the 28px chrome which is already HTML.
      */}
      <div className="flex-1 min-h-0 relative" style={{ padding: "0 8px 8px 8px" }}>
        <div ref={webviewAreaRef} className="w-full h-full relative">
          {isInteracting && (
            <div className="absolute inset-0 bg-muted/40 border border-dashed border-border-weak flex items-center justify-center">
              <div className="text-xs text-muted-foreground">
                {"Updating…"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resize handles — 4 edges + 4 corners. Rendered last so they sit on
          top in DOM order. All handlers stop propagation. */}
      {/* North edge — covers top 6px of the 28px chrome */}
      <div
        className="absolute top-0 left-0 right-0 cursor-ns-resize z-10"
        style={{ height: 6 }}
        onMouseDown={handleResizeStart("n")}
      />
      {/* South edge — sits in the 8px bottom padding */}
      <div
        className="absolute bottom-0 left-0 right-0 cursor-ns-resize z-10"
        style={{ height: 8 }}
        onMouseDown={handleResizeStart("s")}
      />
      {/* West edge — sits in the 8px left padding */}
      <div
        className="absolute top-0 bottom-0 left-0 cursor-ew-resize z-10"
        style={{ width: 8 }}
        onMouseDown={handleResizeStart("w")}
      />
      {/* East edge — sits in the 8px right padding */}
      <div
        className="absolute top-0 bottom-0 right-0 cursor-ew-resize z-10"
        style={{ width: 8 }}
        onMouseDown={handleResizeStart("e")}
      />
      {/* NW corner — in chrome area, fully HTML */}
      <div
        className="absolute top-0 left-0 cursor-nwse-resize z-20"
        style={{ width: 12, height: 12 }}
        onMouseDown={handleResizeStart("nw")}
      />
      {/* NE corner — in chrome area, fully HTML */}
      <div
        className="absolute top-0 right-0 cursor-nesw-resize z-20"
        style={{ width: 12, height: 12 }}
        onMouseDown={handleResizeStart("ne")}
      />
      {/* SW corner — in bottom-left padding, fully HTML */}
      <div
        className="absolute bottom-0 left-0 cursor-nesw-resize z-20"
        style={{ width: 12, height: 12 }}
        onMouseDown={handleResizeStart("sw")}
      />
      {/* SE corner — in bottom-right padding, fully HTML */}
      <div
        className="absolute bottom-0 right-0 cursor-nwse-resize z-20"
        style={{
          width: 12,
          height: 12,
          background:
            "linear-gradient(135deg, transparent 55%, var(--border) 55%, var(--border) 65%, transparent 65%, transparent 75%, var(--border) 75%, var(--border) 85%, transparent 85%)",
        }}
        onMouseDown={handleResizeStart("se")}
      />
    </div>
  )
}
