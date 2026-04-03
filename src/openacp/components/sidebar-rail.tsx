import React from "react"
import { invoke } from "@tauri-apps/api/core"

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

export function SidebarRail(props: {
  workspaces: string[]
  activeWorkspace: string
  errorWorkspaces?: Set<string>
  onSwitchWorkspace: (dir: string) => void
  onReconnect?: (dir: string) => void
  onOpenFolder: () => void
}) {
  const dirName = (dir: string) => dir.split("/").pop() || "Workspace"

  return (
    <div
      data-component="sidebar-rail"
      className="w-14 shrink-0 bg-background-base flex flex-col items-center overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full">
        <div className="h-full w-full flex flex-col items-center gap-2 px-2 overflow-y-auto no-scrollbar pt-5">
          {props.workspaces.map((dir) => {
            const isActive = dir === props.activeWorkspace
            const hasError = props.errorWorkspaces?.has(dir) ?? false
            const colors = avatarColor(dir)
            const initial = dirName(dir).charAt(0).toUpperCase()
            return (
              <div key={dir} className="relative" title={hasError ? `${dirName(dir)} -- reconnect needed` : dirName(dir)}>
                <button
                  type="button"
                  className={`flex items-center justify-center size-8 rounded-md overflow-hidden transition-all cursor-default ${
                    isActive ? "ring-2 ring-text-base ring-offset-1 ring-offset-background-base" : "opacity-60 hover:opacity-100"
                  }`}
                  onClick={() => hasError && props.onReconnect ? props.onReconnect(dir) : props.onSwitchWorkspace(dir)}
                >
                  <div
                    className="size-full rounded-lg flex items-center justify-center text-12-medium"
                    style={{ background: colors.background, color: colors.foreground }}
                  >
                    {initial}
                  </div>
                </button>
                {hasError && (
                  <div className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-status-error border-2 border-background-base pointer-events-none" />
                )}
              </div>
            )
          })}

          <div className="mt-1">
            <button
              className="size-8 rounded-md flex items-center justify-center hover:bg-surface-raised-base-hover transition-colors"
              title="Open workspace"
              onClick={props.onOpenFolder}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 4.16699V15.8337M4.16699 10.0003H15.8337" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-icon-weak" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 w-full pb-5 pt-3 flex flex-col items-center gap-2">
        {import.meta.env.DEV && (
          <button
            className="size-8 rounded-md flex items-center justify-center hover:bg-surface-raised-base-hover"
            title="[Dev] Reset OpenACP"
            onClick={async () => {
              await invoke('dev_reset_openacp')
              location.reload()
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3.33 6.67h13.34M5 6.67V15.83a1.67 1.67 0 001.67 1.67h6.66A1.67 1.67 0 0015 15.83V6.67M7.5 3.33h5" stroke="currentColor" strokeLinecap="round" className="text-icon-weak" /></svg>
          </button>
        )}
        <button className="size-8 rounded-md flex items-center justify-center hover:bg-surface-raised-base-hover" title="Settings">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.2" className="text-icon-weak" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-icon-weak" /></svg>
        </button>
      </div>
    </div>
  )
}
