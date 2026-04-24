import React, { useState, useCallback, useRef, useEffect } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Plus,
  X,
  Terminal,
  SplitHorizontal,
  SplitVertical,
} from "@phosphor-icons/react"
import { ResizeHandle } from "./ui/resize-handle"
import { TerminalRenderer } from "./terminal-renderer"
import {
  useTerminal,
  type TerminalNode,
  type TerminalTab,
} from "../context/terminal"

const DEFAULT_HEIGHT = 260
const MIN_HEIGHT = 120

interface TerminalPanelProps {
  open: boolean
  onClose: () => void
  workspacePath: string
}

/**
 * Recursively renders a terminal layout tree. Splits use `flex` to size their
 * children by ratio; leaves host a `<TerminalRenderer>` plus a click hit-zone
 * that updates the active leaf for keyboard focus tracking.
 */
function NodeRenderer({
  node,
  path,
  tab,
}: {
  node: TerminalNode
  path: number[]
  tab: TerminalTab
}) {
  // Leaves and splits call different render paths but the same set of hooks
  // MUST be invoked unconditionally on every render — otherwise a node that
  // morphs between leaf and split (e.g. after splitActive / closeLeaf) would
  // violate React's hook-order rule and throw "Rendered more hooks…".
  const { backend, setActiveLeaf, setSplitRatio, closeLeaf, activeTabId } =
    useTerminal()
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ size: number; ratio: number } | null>(null)

  // Direction flags default safely for leaves so useCallback deps are stable.
  const isSplit = node.type === "split"
  const isRow = isSplit && node.direction === "horizontal"
  const splitRatio = isSplit ? node.ratio : 0.5

  const onResize = useCallback(
    (delta: number) => {
      const container = containerRef.current
      if (!container) return
      const start = dragStartRef.current
      if (!start) return
      const total = isRow
        ? container.getBoundingClientRect().width
        : container.getBoundingClientRect().height
      if (total <= 0) return
      const nextRatio = start.ratio + delta / total
      setSplitRatio(path, nextRatio)
    },
    [isRow, path, setSplitRatio],
  )

  const onResizeStart = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    dragStartRef.current = {
      size: isRow ? rect.width : rect.height,
      ratio: splitRatio,
    }
  }, [isRow, splitRatio])

  if (node.type === "leaf") {
    const focused = tab.activeLeaf === node.sessionId
    const isActive = activeTabId === tab.id
    const isFocusedLeaf = focused && isActive
    return (
      <div
        className={`group relative h-full w-full ${
          isFocusedLeaf ? "ring-1 ring-inset ring-border-strong" : ""
        }`}
        onMouseDown={() => setActiveLeaf(node.sessionId)}
      >
        <div
          className={`h-full w-full transition-opacity ${isFocusedLeaf ? "" : "opacity-50"}`}
        >
          <TerminalRenderer sessionId={node.sessionId} backend={backend} />
        </div>
        {/* Per-leaf close button: appears on hover so single-pane tabs stay clean. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void closeLeaf(node.sessionId)
          }}
          className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-accent hover:opacity-100 group-hover:opacity-60"
          aria-label="Close pane"
          title="Close pane"
        >
          <X size={10} />
        </button>
      </div>
    )
  }

  // Split branch
  const childAPath = [...path, 0]
  const childBPath = [...path, 1]
  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full ${isRow ? "flex-row" : "flex-col"}`}
    >
      <div style={{ flex: `${splitRatio} 1 0%`, minWidth: 0, minHeight: 0 }}>
        <NodeRenderer node={node.a} path={childAPath} tab={tab} />
      </div>
      <SplitDivider
        direction={isRow ? "vertical" : "horizontal"}
        onResize={onResize}
        onResizeStart={onResizeStart}
      />
      <div style={{ flex: `${1 - splitRatio} 1 0%`, minWidth: 0, minHeight: 0 }}>
        <NodeRenderer node={node.b} path={childBPath} tab={tab} />
      </div>
    </div>
  )
}

/**
 * Thin drag handle between two split children. Raw mouse-event driven so we
 * don't pull a bigger library in; the tree reducer does the math.
 */
function SplitDivider({
  direction,
  onResize,
  onResizeStart,
}: {
  /** Visual orientation of the handle bar: horizontal = wide thin bar between
   *  stacked panes; vertical = tall thin bar between side-by-side panes. */
  direction: "horizontal" | "vertical"
  onResize: (delta: number) => void
  onResizeStart: () => void
}) {
  const isHorizontal = direction === "horizontal"

  const handleMouseDown = useCallback(
    (downEvent: React.MouseEvent) => {
      downEvent.preventDefault()
      const startX = downEvent.clientX
      const startY = downEvent.clientY
      onResizeStart()
      document.body.style.cursor = isHorizontal ? "row-resize" : "col-resize"

      function onMove(e: MouseEvent) {
        const delta = isHorizontal ? e.clientY - startY : e.clientX - startX
        onResize(delta)
      }
      function onUp() {
        document.body.style.cursor = ""
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [isHorizontal, onResize, onResizeStart],
  )

  return (
    <div
      onMouseDown={handleMouseDown}
      className={
        isHorizontal
          ? "h-1 w-full shrink-0 cursor-row-resize bg-border-weak hover:bg-border-strong"
          : "h-full w-1 shrink-0 cursor-col-resize bg-border-weak hover:bg-border-strong"
      }
    />
  )
}

export function TerminalPanel({ open, onClose, workspacePath }: TerminalPanelProps) {
  const { tabs, activeTabId, openTab, closeTab, setActiveTab, splitActive } =
    useTerminal()
  const [height, setHeight] = useState(DEFAULT_HEIGHT)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  const handleNewTerminal = useCallback(async () => {
    await openTab(workspacePath)
  }, [openTab, workspacePath])

  const handleCloseTab = useCallback(
    async (id: string) => {
      await closeTab(id)
      if (tabs.length <= 1) {
        onClose()
      }
    },
    [closeTab, tabs.length, onClose],
  )

  const handleCollapse = useCallback(() => {
    onClose()
  }, [onClose])

  // Auto-create first tab when panel opens with no tabs
  const creatingRef = useRef(false)
  useEffect(() => {
    if (open && tabs.length === 0 && workspacePath && !creatingRef.current) {
      creatingRef.current = true
      openTab(workspacePath).finally(() => {
        creatingRef.current = false
      })
    }
  }, [open, tabs.length, workspacePath, openTab])

  const maxHeight = Math.floor(window.innerHeight * 0.6)

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="relative w-full shrink-0 overflow-hidden border-t border-border-weak bg-background"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: `${height}px`, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {/* Resize handle — top edge */}
          <ResizeHandle
            direction="vertical"
            edge="start"
            size={height}
            min={MIN_HEIGHT}
            max={maxHeight}
            onResize={setHeight}
            onCollapse={handleCollapse}
            collapseThreshold={60}
          />

          {/* Tab bar */}
          <div className="flex h-9 shrink-0 items-center border-b border-l border-border-weak bg-background px-1">
            <div className="flex flex-1 items-center gap-0.5 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault()
                      handleCloseTab(tab.id)
                    }
                  }}
                  className={`group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                    activeTabId === tab.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <Terminal size={12} className="shrink-0 opacity-60" />
                  <span className="truncate max-w-[100px]">{tab.title}</span>
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCloseTab(tab.id)
                    }}
                    className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                  >
                    <X size={10} />
                  </span>
                </button>
              ))}
            </div>

            {/* Split controls — operate on the active tab's focused leaf */}
            {activeTab && (
              <>
                <button
                  type="button"
                  onClick={() => void splitActive("horizontal", workspacePath)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Split right"
                  aria-label="Split right"
                >
                  <SplitHorizontal size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void splitActive("vertical", workspacePath)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Split down"
                  aria-label="Split down"
                >
                  <SplitVertical size={14} />
                </button>
              </>
            )}

            {/* New terminal button */}
            <button
              type="button"
              onClick={handleNewTerminal}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="New terminal"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Terminal content — render each tab mounted, only show the active
              one. Keeping hidden tabs mounted preserves scroll position and
              live PTY output in the background. */}
          <div className="h-[calc(100%-36px)] w-full border-l border-border-weak">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className="h-full w-full"
                style={{ display: activeTabId === tab.id ? "block" : "none" }}
              >
                <NodeRenderer node={tab.root} path={[]} tab={tab} />
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
