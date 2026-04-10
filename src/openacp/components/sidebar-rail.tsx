import React, { useState, useRef, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  GearSix,
  PuzzlePiece,
  Plus,
  Trash,
  PushPin,
  PencilSimple,
} from "@phosphor-icons/react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import type { Modifier } from "@dnd-kit/core"
import { Button } from "./ui/button"
import { SortableWorkspaceItem } from "./sortable-workspace-item"
import { RenameWorkspaceDialog } from "./rename-workspace-popover"
import { showToast } from "../lib/toast"

export interface WorkspaceItem {
  id: string
  directory: string
  name: string
  type: "local" | "remote"
  pinned?: boolean
  customName?: string
}

function displayName(ws: WorkspaceItem) {
  if (ws.customName) return ws.customName
  const folderName = ws.directory ? ws.directory.split("/").pop() : null
  return folderName || ws.name || ws.id
}

function ContextMenu(props: {
  x: number
  y: number
  workspace: WorkspaceItem
  isConnected: boolean
  isSharing: boolean
  isPinned: boolean
  onCopyPath: () => void
  onShare: () => void
  onCopyShareLink: () => void
  onStopSharing: () => void
  onReconnect: () => void
  onStart: () => void
  onStop: () => void
  onRemove: () => void
  onTogglePin: () => void
  onRename: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) props.onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose()
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [props.onClose])

  const menuBtnClass = "w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent transition-colors flex items-center gap-2"

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] rounded-md border border-border-weak bg-popover shadow-lg py-1"
      style={{ left: props.x, top: props.y }}
    >
      {/* Pin / Unpin */}
      <button className={menuBtnClass} onClick={() => { props.onTogglePin(); props.onClose() }}>
        <PushPin size={14} weight={props.isPinned ? "fill" : "regular"} />
        {props.isPinned ? "Unpin" : "Pin to top"}
      </button>

      {/* Rename */}
      <button className={menuBtnClass} onClick={() => { props.onRename(); props.onClose() }}>
        <PencilSimple size={14} />
        Rename
      </button>

      <div className="my-1 border-t border-border-weak" />

      {props.workspace.directory && (
        <button
          className={menuBtnClass}
          onClick={() => { props.onCopyPath(); props.onClose() }}
        >
          Copy path
        </button>
      )}
      {props.isConnected && props.workspace.type !== "remote" && (
        props.isSharing ? (
          <>
            <button
              className={menuBtnClass}
              onClick={() => { props.onCopyShareLink(); props.onClose() }}
            >
              Copy share link
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-sm text-warning hover:bg-accent transition-colors"
              onClick={() => { props.onStopSharing(); props.onClose() }}
            >
              Stop sharing
            </button>
          </>
        ) : (
          <button
            className={menuBtnClass}
            onClick={() => { props.onShare(); props.onClose() }}
          >
            Share workspace
          </button>
        )
      )}
      {props.isConnected ? (
        <button
          className={menuBtnClass}
          onClick={() => { props.onStop(); props.onClose() }}
        >
          Stop server
        </button>
      ) : (
        <>
          <button
            className={menuBtnClass}
            onClick={() => { props.onStart(); props.onClose() }}
          >
            Start server
          </button>
          <button
            className={menuBtnClass}
            onClick={() => { props.onReconnect(); props.onClose() }}
          >
            Reconnect
          </button>
        </>
      )}
      <div className="my-1 border-t border-border-weak" />
      <button
        className="w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent transition-colors"
        onClick={() => { props.onRemove(); props.onClose() }}
      >
        Remove workspace
      </button>
    </div>
  )
}

export function SidebarRail(props: {
  workspaces: WorkspaceItem[]
  activeId: string | null
  connectedIds?: Set<string>
  errorIds?: Set<string>
  pinnedIds: Set<string>
  onSwitchWorkspace: (id: string) => void
  onRemoveWorkspace?: (id: string) => void
  onShareWorkspace?: (id: string) => void
  onCopyShareLink?: (id: string) => void
  onStopSharing?: (id: string) => void
  sharingIds?: Set<string>
  onReconnect?: (id: string) => void
  onOpenFolder: () => void
  onOpenPlugins?: () => void
  onOpenSettings?: () => void
  onTogglePin: (id: string) => void
  onReorder: (activeId: string, overId: string) => void
  onRename: (id: string, name: string) => void
}) {
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const sortableContainerRef = useRef<HTMLDivElement>(null)

  // Listen for workspace menu open from sidebar header
  useEffect(() => {
    function handleOpenMenu(e: Event) {
      const { x, y } = (e as CustomEvent).detail
      if (props.activeId) setContextMenu({ id: props.activeId, x, y })
    }
    window.addEventListener("open-workspace-menu", handleOpenMenu)
    return () => window.removeEventListener("open-workspace-menu", handleOpenMenu)
  }, [props.activeId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const restrictToContainer: Modifier = useCallback(
    ({ transform, draggingNodeRect, containerNodeRect: _ignore }) => {
      const container = sortableContainerRef.current
      if (!container || !draggingNodeRect) return transform
      const containerRect = container.getBoundingClientRect()
      const clampedY = Math.min(
        Math.max(transform.y, containerRect.top - draggingNodeRect.top),
        containerRect.bottom - draggingNodeRect.bottom,
      )
      return { ...transform, x: 0, y: clampedY }
    },
    [],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        props.onReorder(String(active.id), String(over.id))
      }
    },
    [props.onReorder],
  )

  const handleRename = useCallback(
    (id: string) => setRenameTarget(id),
    [],
  )

  // Find the boundary index between pinned and unpinned
  const firstUnpinnedIdx = props.workspaces.findIndex(ws => !props.pinnedIds.has(ws.id))
  const hasPinned = props.pinnedIds.size > 0
  const hasUnpinned = firstUnpinnedIdx >= 0

  return (
    <div
      data-component="sidebar-rail"
      className="w-14 shrink-0 bg-background flex flex-col items-center overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full">
        <div className="h-full w-full flex flex-col items-center gap-3 px-2 overflow-y-auto no-scrollbar pt-5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToContainer]}
            onDragEnd={handleDragEnd}
          >
            <div ref={sortableContainerRef} className="flex flex-col items-center gap-3">
              <SortableContext
                items={props.workspaces.map(ws => ws.id)}
                strategy={verticalListSortingStrategy}
              >
                {props.workspaces.map((ws, index) => {
                  const showSeparator =
                    hasPinned && hasUnpinned && index === firstUnpinnedIdx

                  return (
                    <React.Fragment key={ws.id}>
                      {showSeparator && (
                        <div className="w-6 border-t border-border-weak" />
                      )}
                      <div ref={(el) => { if (el) itemRefs.current.set(ws.id, el); else itemRefs.current.delete(ws.id) }}>
                        <SortableWorkspaceItem
                          id={ws.id}
                          directory={ws.directory}
                          name={ws.name}
                          type={ws.type}
                          customName={ws.customName}
                          pinned={props.pinnedIds.has(ws.id)}
                          isActive={ws.id === props.activeId}
                          hasError={props.errorIds?.has(ws.id) ?? false}
                          isConnected={props.connectedIds?.has(ws.id) ?? false}
                          isSharing={props.sharingIds?.has(ws.id) ?? false}
                          onSwitch={() => props.onSwitchWorkspace(ws.id)}
                          onReconnect={props.onReconnect ? () => props.onReconnect!(ws.id) : undefined}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setContextMenu({ id: ws.id, x: e.clientX, y: e.clientY })
                          }}
                        />
                      </div>
                    </React.Fragment>
                  )
                })}
              </SortableContext>
            </div>
          </DndContext>

          <div>
            <Button
              variant="ghost"
              size="icon-lg"
              title="Open workspace"
              onClick={props.onOpenFolder}
            >
              <Plus size={16} className="text-foreground-weak" />
            </Button>
          </div>
        </div>
      </div>

      <div className="shrink-0 w-full pb-5 pt-3 flex flex-col items-center gap-2">
        {import.meta.env.DEV && (
          <Button
            variant="ghost"
            size="icon-lg"
            title="[Dev] Reset OpenACP"
            onClick={async () => {
              await invoke('dev_reset_openacp')
              // Clear workspace store so onboarding starts fresh
              try { localStorage.removeItem('workspaces_v2') } catch {}
              try {
                const { load } = await import('@tauri-apps/plugin-store')
                const store = await load('openacp.bin')
                await store.delete('workspaces_v2')
                await store.save()
              } catch {}
              location.reload()
            }}
          >
            <Trash size={16} className="text-foreground-weak" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-lg"
          title="Plugins"
          onClick={props.onOpenPlugins}
          disabled={!props.activeId || !props.connectedIds?.has(props.activeId)}
          className={!props.activeId || !props.connectedIds?.has(props.activeId) ? "opacity-30" : ""}
        >
          <PuzzlePiece size={16} className="text-foreground-weak" />
        </Button>
        <Button variant="ghost" size="icon-lg" title="Settings" onClick={props.onOpenSettings}>
          <GearSix size={16} className="text-foreground-weak" />
        </Button>
      </div>

      {contextMenu && (() => {
        const ws = props.workspaces.find(w => w.id === contextMenu.id)
        if (!ws) return null
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            workspace={ws}
            isConnected={props.connectedIds?.has(ws.id) ?? false}
            isSharing={props.sharingIds?.has(ws.id) ?? false}
            isPinned={props.pinnedIds.has(ws.id)}
            onCopyPath={async () => {
              try {
                await navigator.clipboard.writeText(ws.directory)
                showToast({ description: "Path copied to clipboard" })
              } catch { /* fallback */ }
            }}
            onShare={() => props.onShareWorkspace?.(contextMenu.id)}
            onCopyShareLink={() => props.onCopyShareLink?.(contextMenu.id)}
            onStopSharing={() => props.onStopSharing?.(contextMenu.id)}
            onReconnect={() => props.onSwitchWorkspace(contextMenu.id)}
            onStart={async () => {
              try {
                showToast({ description: "Starting server..." })
                await invoke<string>('invoke_cli', { args: ['start', '--dir', ws.directory] })
                showToast({ description: "Server started", variant: "success" })
                props.onSwitchWorkspace(contextMenu.id)
              } catch (e: any) {
                showToast({ description: typeof e === 'string' ? e : 'Failed to start server', variant: "error" })
              }
            }}
            onStop={async () => {
              try {
                await invoke<string>('invoke_cli', { args: ['stop', '--dir', ws.directory] })
                showToast({ description: "Server stopped" })
              } catch { /* best-effort */ }
            }}
            onRemove={async () => {
              try {
                await invoke<string>('invoke_cli', { args: ['stop', '--dir', ws.directory] })
              } catch { /* best-effort */ }
              props.onRemoveWorkspace?.(contextMenu.id)
            }}
            onTogglePin={() => props.onTogglePin(contextMenu.id)}
            onRename={() => handleRename(contextMenu.id)}
            onClose={() => setContextMenu(null)}
          />
        )
      })()}

      <RenameWorkspaceDialog
        open={renameTarget !== null}
        currentName={renameTarget ? displayName(props.workspaces.find(w => w.id === renameTarget) ?? { directory: "", name: "", id: renameTarget }) : ""}
        onSave={(name) => { if (renameTarget) props.onRename(renameTarget, name) }}
        onClose={() => setRenameTarget(null)}
      />
    </div>
  )
}
