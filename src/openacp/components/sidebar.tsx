import React, { useMemo, useState } from "react"
import { ResizeHandle } from "./ui/resize-handle"
import { Spinner } from "./ui/spinner"
import { useSessions } from "../context/sessions"
import { useChat } from "../context/chat"
import { useWorkspace } from "../context/workspace"
import { PluginsModal } from "./plugins-modal"
import { showToast } from "../lib/toast"

const DEFAULT_SIDEBAR_WIDTH = 280
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 480

export function SidebarPanel() {
  const sessions = useSessions()
  const chat = useChat()
  const workspace = useWorkspace()

  const [panelWidth, setPanelWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [pluginsOpen, setPluginsOpen] = useState(false)

  const workspaceName = useMemo(() => workspace.directory.split("/").pop() || "Workspace", [workspace.directory])
  const workspacePath = useMemo(() => {
    const parts = workspace.directory.split("/")
    if (parts.length > 3) return "~/" + parts.slice(3).join("/")
    return workspace.directory
  }, [workspace.directory])

  return (
    <div
      className="relative flex flex-col min-h-0 min-w-0 box-border rounded-tl-[12px] px-3 border-l border-t border-border-weaker-base bg-background-base overflow-hidden shrink-0"
      style={{ width: `${panelWidth}px` }}
    >
      <ResizeHandle
        direction="horizontal"
        edge="end"
        size={panelWidth}
        min={MIN_SIDEBAR_WIDTH}
        max={MAX_SIDEBAR_WIDTH}
        onResize={setPanelWidth}
      />
      <div className="shrink-0 pl-1 py-1">
        <div className="group/project flex items-start justify-between gap-2 py-2 pl-2 pr-0">
          <div className="flex flex-col min-w-0">
            <span className="text-14-medium text-text-strong truncate">{workspaceName}</span>
            <span className="text-12-regular text-text-base truncate" title={workspace.directory}>{workspacePath}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <nav className="flex flex-col gap-1">
          <NewSessionButton />
          <div className="h-2" />
          {sessions.loading() && <SessionSkeleton />}
          {sessions.list().map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              active={chat.activeSession() === session.id}
              streaming={chat.streaming() && chat.activeSession() === session.id}
              onClick={() => chat.setActiveSession(session.id)}
              onDelete={() => sessions.remove(session.id)}
            />
          ))}
        </nav>
      </div>

      <div className="shrink-0 pt-1 pb-2">
        <button
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-12-medium text-text-base hover:bg-surface-raised-base-hover transition-colors"
          onClick={() => setPluginsOpen(true)}
        >
          Plugins
        </button>
      </div>

      <PluginsModal open={pluginsOpen} onClose={() => setPluginsOpen(false)} />
    </div>
  )
}

function NewSessionButton() {
  const sessions = useSessions()
  const chat = useChat()
  const [creating, setCreating] = useState(false)

  return (
    <button
      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-border-base text-12-medium text-text-base hover:bg-surface-raised-base-hover transition-colors active:scale-[0.98] disabled:opacity-50"
      disabled={creating}
      onClick={async () => {
        if (creating) return
        setCreating(true)
        try {
          const session = await sessions.create()
          if (session) {
            chat.setActiveSession(session.id)
          } else {
            showToast({ description: "Failed to create session. Max sessions may be reached.", variant: "error" })
          }
        } finally {
          setCreating(false)
        }
      }}
    >
      {creating ? (
        <Spinner className="size-[15px] text-text-weak" />
      ) : (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 4.16699V15.8337M4.16699 10.0003H15.8337" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      )}
      {creating ? "Creating..." : "New session"}
    </button>
  )
}

function SessionItem({ session, active, streaming, onClick, onDelete }: {
  session: { id: string; name: string; agent: string; status: string }
  active: boolean
  streaming: boolean
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <div
      data-session-id={session.id}
      className={`group/session relative w-full min-w-0 rounded-md cursor-default pl-2 pr-3 transition-colors hover:bg-surface-raised-base-hover`}
    >
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <button
            className={`flex items-center gap-1 min-w-0 w-full text-left focus:outline-none py-1 ${active ? "active" : ""}`}
            onClick={onClick}
          >
            <div className="shrink-0 size-6 flex items-center justify-center">
              {streaming ? (
                <Spinner className="size-[15px] text-text-weak" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 10H15" stroke="currentColor" strokeLinecap="round" className="text-icon-weak" /></svg>
              )}
            </div>
            <span className="text-14-regular text-text-strong min-w-0 flex-1 truncate">{session.name}</span>
          </button>
        </div>
        <div className="shrink-0 overflow-hidden transition-[width,opacity] w-0 opacity-0 pointer-events-none group-hover/session:w-6 group-hover/session:opacity-100 group-hover/session:pointer-events-auto">
          <button
            className="size-6 flex items-center justify-center rounded-md hover:bg-surface-raised-base-hover"
            title="Archive"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M3.33 6.67h13.34M5 6.67V15.83a1.67 1.67 0 001.67 1.67h6.66A1.67 1.67 0 0015 15.83V6.67M7.5 3.33h5" stroke="currentColor" strokeLinecap="round" className="text-icon-weak" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function SessionSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-8 w-full rounded-md bg-surface-raised-base opacity-60 animate-pulse" />
      ))}
    </div>
  )
}
