import { useState, useMemo } from "react"
import { Plus, Minus, Archive } from "@phosphor-icons/react"
import { ResizeHandle } from "./ui/resize-handle"
import { useSessions } from "../context/sessions"
import { useChat } from "../context/chat"
import { useWorkspace } from "../context/workspace"

const DEFAULT_SIDEBAR_WIDTH = 280
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 480

export function SidebarPanel() {
  const sessions = useSessions()
  const chat = useChat()
  const workspace = useWorkspace()

  const [panelWidth, setPanelWidth] = useState(DEFAULT_SIDEBAR_WIDTH)

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
      {/* Project header */}
      <div className="shrink-0 pl-1 py-1">
        <div className="group/project flex items-start justify-between gap-2 py-2 pl-2 pr-0">
          <div className="flex flex-col min-w-0">
            <span className="text-14-medium text-text-strong truncate">{workspaceName}</span>
            <span className="text-12-regular text-text-base truncate" title={workspace.directory}>{workspacePath}</span>
          </div>
          {/* Dropdown menu placeholder */}
          <button className="shrink-0 size-6 rounded-md flex items-center justify-center transition-opacity opacity-0 group-hover/project:opacity-100 group-focus-within/project:opacity-100 hover:bg-surface-raised-base-hover text-icon-weak">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <circle cx="4.5" cy="10" r="1.25" fill="currentColor" />
              <circle cx="10" cy="10" r="1.25" fill="currentColor" />
              <circle cx="15.5" cy="10" r="1.25" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <nav className="flex flex-col gap-1">
          {/* New session */}
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
            console.error("Failed to create session. Max sessions may be reached.")
          }
        } finally {
          setCreating(false)
        }
      }}
    >
      {creating ? (
        <div className="w-3.5 h-3.5 border-2 rounded-full oac-spinner" style={{ borderColor: "var(--text-weak)", borderTopColor: "transparent" }} />
      ) : (
        <Plus size={14} weight="bold" className="text-icon-weak" />
      )}
      {creating ? "Creating..." : "New session"}
    </button>
  )
}

function SessionItem({
  session,
  active,
  streaming,
  onClick,
  onDelete,
}: {
  session: { id: string; name: string; agent: string; status: string }
  active: boolean
  streaming: boolean
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <div
      data-session-id={session.id}
      className="group/session relative w-full min-w-0 rounded-md cursor-default pl-2 pr-3 transition-colors hover:bg-surface-raised-base-hover [&:has(:focus-visible)]:bg-surface-raised-base-hover"
    >
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <button
            className={`flex items-center gap-1 min-w-0 w-full text-left focus:outline-none py-1 ${active ? "active" : ""}`}
            onClick={onClick}
          >
            <div className="shrink-0 size-6 flex items-center justify-center">
              {streaming ? (
                <div className="size-[15px] border-2 rounded-full oac-spinner" style={{ borderColor: "var(--text-weak)", borderTopColor: "transparent" }} />
              ) : (
                <Minus size={14} className="text-icon-weak" />
              )}
            </div>
            <span className="text-14-regular text-text-strong min-w-0 flex-1 truncate">{session.name}</span>
          </button>
        </div>
        <div className="shrink-0 overflow-hidden transition-[width,opacity] w-0 opacity-0 pointer-events-none group-hover/session:w-6 group-hover/session:opacity-100 group-hover/session:pointer-events-auto group-focus-within/session:w-6 group-focus-within/session:opacity-100 group-focus-within/session:pointer-events-auto">
          <button
            className="size-6 rounded-md flex items-center justify-center hover:bg-surface-raised-base-hover text-icon-weak hover:text-icon-base transition-colors"
            title="Archive"
            onClick={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
          >
            <Archive size={14} />
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
