import React, { useState, useCallback } from "react"
import { Plus, X } from "@phosphor-icons/react"
import { ResizeHandle } from "./ui/resize-handle"
import { TerminalRenderer } from "./terminal-renderer"
import { useTerminal } from "../context/terminal"

const DEFAULT_HEIGHT = 280
const MIN_HEIGHT = 100

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
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      await closeSession(id)
      // If no sessions left, close the panel
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
  React.useEffect(() => {
    if (open && sessions.length === 0 && workspacePath) {
      createSession(workspacePath)
    }
  }, [open, sessions.length, workspacePath, createSession])

  if (!open) return null

  const maxHeight = Math.floor(window.innerHeight * 0.6)

  return (
    <div
      className="relative w-full shrink-0 overflow-hidden border-t border-border-weak bg-[#0a0a0a]"
      style={{ height: `${height}px` }}
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
      <div className="flex h-8 shrink-0 items-center border-b border-zinc-800 bg-[#0f0f0f] px-1">
        <div className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setActiveId(session.id)}
              className={`group flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                activeId === session.id
                  ? "bg-zinc-800 text-zinc-200"
                  : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-400"
              }`}
            >
              <span className="truncate max-w-[120px]">{session.title}</span>
              <span
                role="button"
                onClick={(e) => handleCloseTab(e, session.id)}
                className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-700"
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
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          title="New terminal"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Terminal content */}
      <div className="h-[calc(100%-32px)] w-full">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="h-full w-full"
            style={{ display: activeId === session.id ? "block" : "none" }}
          >
            <TerminalRenderer
              sessionId={session.id}
              backend={backend}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
