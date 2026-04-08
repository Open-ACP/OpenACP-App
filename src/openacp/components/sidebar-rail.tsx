import React, { useState, useRef, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { GearSix, PuzzlePiece, Plus, Trash, Globe, Broadcast } from "@phosphor-icons/react"
import { Button } from "./ui/button"
import { showToast } from "../lib/toast"

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

/** Get display name: prefer directory folder name over raw name/id */
function displayName(ws: WorkspaceItem) {
  const folderName = ws.directory ? ws.directory.split("/").pop() : null
  return folderName || ws.name || ws.id
}

export interface WorkspaceItem {
  id: string
  directory: string
  name: string
  type: "local" | "remote"
}

function ContextMenu(props: {
  x: number
  y: number
  workspace: WorkspaceItem
  isConnected: boolean
  isSharing: boolean
  onCopyPath: () => void
  onShare: () => void
  onCopyShareLink: () => void
  onStopSharing: () => void
  onReconnect: () => void
  onStart: () => void
  onStop: () => void
  onRemove: () => void
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

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] rounded-md border border-border-weak bg-popover shadow-lg py-1"
      style={{ left: props.x, top: props.y }}
    >
      {props.workspace.directory && (
        <button
          className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent transition-colors"
          onClick={() => { props.onCopyPath(); props.onClose() }}
        >
          Copy path
        </button>
      )}
      {props.isConnected && props.workspace.type !== "remote" && (
        props.isSharing ? (
          <>
            <button
              className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent transition-colors"
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
            className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent transition-colors"
            onClick={() => { props.onShare(); props.onClose() }}
          >
            Share workspace
          </button>
        )
      )}
      {props.isConnected ? (
        <button
          className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent transition-colors"
          onClick={() => { props.onStop(); props.onClose() }}
        >
          Stop server
        </button>
      ) : (
        <>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent transition-colors"
            onClick={() => { props.onStart(); props.onClose() }}
          >
            Start server
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent transition-colors"
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
}) {
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  // Listen for workspace menu open from sidebar header
  useEffect(() => {
    function handleOpenMenu(e: Event) {
      const { x, y } = (e as CustomEvent).detail
      if (props.activeId) setContextMenu({ id: props.activeId, x, y })
    }
    window.addEventListener("open-workspace-menu", handleOpenMenu)
    return () => window.removeEventListener("open-workspace-menu", handleOpenMenu)
  }, [props.activeId])

  return (
    <div
      data-component="sidebar-rail"
      className="w-14 shrink-0 bg-background flex flex-col items-center overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full">
        <div className="h-full w-full flex flex-col items-center gap-3 px-2 overflow-y-auto no-scrollbar pt-5">
          {props.workspaces.map((ws) => {
            const isActive = ws.id === props.activeId
            const hasError = props.errorIds?.has(ws.id) ?? false
            const isConnected = props.connectedIds?.has(ws.id) ?? false
            const colors = avatarColor(ws.directory || ws.id)
            const label = displayName(ws)
            const initial = label.charAt(0).toUpperCase()
            return (
              <div
                key={ws.id}
                className="relative"
                title={`${label}${ws.type === "remote" ? " (remote)" : ""}${hasError ? " — reconnect needed" : ""}`}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ id: ws.id, x: e.clientX, y: e.clientY })
                }}
              >
                <button
                  type="button"
                  className={`flex items-center justify-center size-9 rounded-lg overflow-hidden transition-all cursor-default ${
                    isActive ? "ring-2 ring-foreground-weak ring-offset-1 ring-offset-background" : "opacity-60 hover:opacity-100"
                  }`}
                  onClick={() => hasError && props.onReconnect ? props.onReconnect(ws.id) : props.onSwitchWorkspace(ws.id)}
                >
                  <div
                    className="size-full rounded-lg flex items-center justify-center text-sm font-medium leading-lg"
                    style={{ background: colors.background, color: colors.foreground }}
                  >
                    {initial}
                  </div>
                </button>
                <div className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-background pointer-events-none"
                  style={{ background: hasError ? 'var(--surface-critical-strong)' : isConnected ? 'var(--surface-success-strong)' : 'var(--text-weaker)' }}
                />
                {ws.type === "remote" && (
                  <div className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background border border-border-weak flex items-center justify-center pointer-events-none">
                    <Globe size={11} weight="bold" className="text-muted-foreground" />
                  </div>
                )}
                {ws.type === "local" && isConnected && (props.sharingIds?.has(ws.id) ?? false) && (
                  <div className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background border border-border-weak flex items-center justify-center pointer-events-none">
                    <Broadcast size={11} weight="bold" className="text-muted-foreground" />
                  </div>
                )}
              </div>
            )
          })}

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
              location.reload()
            }}
          >
            <Trash size={16} className="text-foreground-weak" />
          </Button>
        )}
        <Button variant="ghost" size="icon-lg" title="Plugins" onClick={props.onOpenPlugins}>
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
                await invoke<string>('invoke_cli', { args: ['start', '--dir', ws.directory, '--daemon'] })
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
            onClose={() => setContextMenu(null)}
          />
        )
      })()}
    </div>
  )
}
