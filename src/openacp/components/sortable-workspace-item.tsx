import React from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Globe, Broadcast, PushPin } from "@phosphor-icons/react"

const AVATAR_COLORS = ["pink", "mint", "orange", "purple", "cyan", "lime"] as const

function avatarColor(dir: string) {
  let hash = 0
  for (let i = 0; i < dir.length; i++) hash = ((hash << 5) - hash + dir.charCodeAt(i)) | 0
  const key = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
  return {
    background: `var(--avatar-background-${key})`,
    foreground: `var(--avatar-text-${key})`,
  }
}

export interface SortableWorkspaceItemProps {
  id: string
  directory: string
  name: string
  type: "local" | "remote"
  customName?: string
  pinned?: boolean
  isActive: boolean
  hasError: boolean
  isConnected: boolean
  isSharing: boolean
  onSwitch: () => void
  onReconnect?: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function getDisplayName(ws: { directory: string; name: string; customName?: string }) {
  if (ws.customName) return ws.customName
  const folderName = ws.directory ? ws.directory.split("/").pop() : null
  return folderName || ws.name
}

export function SortableWorkspaceItem(props: SortableWorkspaceItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : undefined,
    scale: isDragging ? "1.05" : undefined,
  }

  const colors = avatarColor(props.directory || props.id)
  const label = getDisplayName(props)
  const initial = label.charAt(0).toUpperCase()

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative"
      title={`${label}${props.type === "remote" ? " (remote)" : ""}${props.hasError ? " — reconnect needed" : ""}`}
      onContextMenu={props.onContextMenu}
    >
      <button
        type="button"
        className={`flex items-center justify-center size-9 rounded-lg overflow-hidden transition-all cursor-default ${
          props.isActive ? "ring-2 ring-fg-weak ring-offset-1 ring-offset-background" : "opacity-60 hover:opacity-100"
        }`}
        onClick={() => props.hasError && props.onReconnect ? props.onReconnect() : props.onSwitch()}
      >
        <div
          className="size-full rounded-lg flex items-center justify-center text-sm font-medium leading-lg"
          style={{ background: colors.background, color: colors.foreground }}
        >
          {initial}
        </div>
      </button>

      {/* Status indicator */}
      <div
        className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-background pointer-events-none"
        style={{
          background: props.hasError
            ? "var(--color-critical)"
            : props.isConnected
              ? "var(--color-success)"
              : "var(--text-weaker)",
        }}
      />

      {/* Remote badge */}
      {props.type === "remote" && (
        <div className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background border border-border-weak flex items-center justify-center pointer-events-none">
          <Globe size={11} weight="bold" className="text-muted-foreground" />
        </div>
      )}

      {/* Sharing badge */}
      {props.type === "local" && props.isConnected && props.isSharing && (
        <div className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background border border-border-weak flex items-center justify-center pointer-events-none">
          <Broadcast size={11} weight="bold" className="text-muted-foreground" />
        </div>
      )}

      {/* Pin indicator */}
      {props.pinned && (
        <div className="absolute -top-1.5 -left-1.5 size-4 rounded-full bg-background border border-border-weak flex items-center justify-center pointer-events-none">
          <PushPin size={9} weight="fill" className="text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
