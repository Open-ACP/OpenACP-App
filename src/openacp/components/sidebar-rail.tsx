import { Plus, Trash, Gear } from "@phosphor-icons/react"
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

function AvatarFallback({ name, background, foreground }: { name: string; background: string; foreground: string }) {
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <div
      className="size-full rounded-lg flex items-center justify-center text-[11px] font-medium select-none"
      style={{ background, color: foreground }}
    >
      {initials}
    </div>
  )
}

export function SidebarRail({
  workspaces,
  activeWorkspace,
  onSwitchWorkspace,
  onOpenFolder,
}: {
  workspaces: string[]
  activeWorkspace: string
  onSwitchWorkspace: (dir: string) => void
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
          {workspaces.map((dir) => {
            const isActive = dir === activeWorkspace
            const colors = avatarColor(dir)
            return (
              <button
                key={dir}
                type="button"
                title={dirName(dir)}
                className={`flex items-center justify-center size-8 rounded-md overflow-hidden transition-all cursor-default ${
                  isActive
                    ? "ring-2 ring-text-base ring-offset-1 ring-offset-background-base"
                    : "opacity-60 hover:opacity-100"
                }`}
                onClick={() => onSwitchWorkspace(dir)}
              >
                <AvatarFallback
                  name={dirName(dir)}
                  background={colors.background}
                  foreground={colors.foreground}
                />
              </button>
            )
          })}

          <div className="mt-1">
            <button
              className="size-8 rounded-md flex items-center justify-center hover:bg-surface-raised-base-hover text-icon-weak hover:text-icon-base transition-colors"
              title="Open workspace"
              onClick={onOpenFolder}
            >
              <Plus size={16} weight="bold" />
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 w-full pb-5 pt-3 flex flex-col items-center gap-2">
        {import.meta.env.DEV && (
          <button
            className="size-8 rounded-md flex items-center justify-center hover:bg-surface-raised-base-hover text-icon-weak hover:text-icon-base transition-colors"
            title="[Dev] Reset OpenACP"
            onClick={async () => {
              await invoke('dev_reset_openacp')
              location.reload()
            }}
          >
            <Trash size={16} />
          </button>
        )}
        <button
          className="size-8 rounded-md flex items-center justify-center hover:bg-surface-raised-base-hover text-icon-weak hover:text-icon-base transition-colors"
          title="Settings"
        >
          <Gear size={16} />
        </button>
      </div>
    </div>
  )
}
