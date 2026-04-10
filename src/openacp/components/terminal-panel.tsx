import React, { useState, useCallback, useRef } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Plus, X, Terminal } from "@phosphor-icons/react"
import { ResizeHandle } from "./ui/resize-handle"
import { TerminalRenderer } from "./terminal-renderer"
import { useTerminal } from "../context/terminal"

const DEFAULT_HEIGHT = 260
const MIN_HEIGHT = 120

interface TerminalPanelProps {
  open: boolean
  onClose: () => void
  workspacePath: string
}

export function TerminalPanel({ open, onClose, workspacePath }: TerminalPanelProps) {
  const { sessions, activeId, backend, createSession, closeSession, setActiveId } = useTerminal()
  const [height, setHeight] = useState(DEFAULT_HEIGHT)

  const handleNewTerminal = useCallback(async () => {
    await createSession(workspacePath)
  }, [createSession, workspacePath])

  const handleCloseTab = useCallback(
    async (id: string) => {
      await closeSession(id)
      if (sessions.length <= 1) {
        onClose()
      }
    },
    [closeSession, sessions.length, onClose],
  )

  const handleCollapse = useCallback(() => {
    onClose()
  }, [onClose])

  // Auto-create first terminal when panel opens with no sessions
  const creatingRef = useRef(false)
  React.useEffect(() => {
    if (open && sessions.length === 0 && workspacePath && !creatingRef.current) {
      creatingRef.current = true
      createSession(workspacePath).finally(() => { creatingRef.current = false })
    }
  }, [open, sessions.length, workspacePath, createSession])

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

          {/* Tab bar — h-9 matching Review/Files panel headers */}
          <div className="flex h-9 shrink-0 items-center border-b border-l border-border-weak bg-background px-1">
            <div className="flex flex-1 items-center gap-0.5 overflow-x-auto">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setActiveId(session.id)}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault()
                      handleCloseTab(session.id)
                    }
                  }}
                  className={`group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                    activeId === session.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <Terminal size={12} className="shrink-0 opacity-60" />
                  <span className="truncate max-w-[100px]">{session.title}</span>
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCloseTab(session.id)
                    }}
                    className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                  >
                    <X size={10} />
                  </span>
                </button>
              ))}
            </div>

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

          {/* Terminal content — with left border separator + padding */}
          <div className="h-[calc(100%-36px)] w-full border-l border-border-weak">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="h-full w-full"
                style={{ display: activeId === session.id ? "block" : "none" }}
              >
                <TerminalRenderer
                  sessionId={session.id}
                  backend={backend}
                  className="pl-2 pt-1"
                />
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
