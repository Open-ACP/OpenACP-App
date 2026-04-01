import { For } from "solid-js"
import { IconButton } from "@openacp/ui/icon-button"
import { Tooltip } from "@openacp/ui/tooltip"
import { Avatar } from "@openacp/ui/avatar"

const AVATAR_COLORS = ["pink", "mint", "orange", "purple", "cyan", "lime"] as const

function avatarColor(dir: string) {
  // Deterministic color based on directory string hash
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
  onSwitchWorkspace: (dir: string) => void
  onOpenFolder: () => void
}) {
  const dirName = (dir: string) => dir.split("/").pop() || "Workspace"

  return (
    <div
      data-component="sidebar-rail"
      class="w-16 shrink-0 bg-background-base flex flex-col items-center overflow-hidden"
    >
      <div class="flex-1 min-h-0 w-full">
        <div class="h-full w-full flex flex-col items-center gap-3 px-3 py-3 overflow-y-auto no-scrollbar">
          <For each={props.workspaces}>
            {(dir) => {
              const isActive = () => dir === props.activeWorkspace
              const colors = avatarColor(dir)
              return (
                <Tooltip placement="right" value={dirName(dir)}>
                  <button
                    type="button"
                    classList={{
                      "flex items-center justify-center size-10 p-1 rounded-lg overflow-hidden transition-colors cursor-default": true,
                      "bg-transparent border-2 border-icon-strong-base hover:bg-surface-base-hover": isActive(),
                      "bg-transparent border border-transparent hover:bg-surface-base-hover hover:border-border-weak-base": !isActive(),
                    }}
                    onClick={() => props.onSwitchWorkspace(dir)}
                  >
                    <Avatar
                      fallback={dirName(dir)}
                      background={colors.background}
                      foreground={colors.foreground}
                      class="size-full rounded"
                    />
                  </button>
                </Tooltip>
              )
            }}
          </For>

          <Tooltip placement="right" value="Open folder">
            <IconButton
              icon="plus"
              variant="ghost"
              size="large"
              onClick={props.onOpenFolder}
            />
          </Tooltip>
        </div>
      </div>

      <div class="shrink-0 w-full pt-3 pb-6 flex flex-col items-center gap-2">
        <Tooltip placement="right" value="Settings">
          <IconButton icon="settings-gear" variant="ghost" size="large" />
        </Tooltip>
      </div>
    </div>
  )
}
