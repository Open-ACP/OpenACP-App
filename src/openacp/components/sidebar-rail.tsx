import { For, Show } from "solid-js"
import { IconButton } from "@openacp/ui/icon-button"
import { Tooltip } from "@openacp/ui/tooltip"
import { Avatar } from "@openacp/ui/avatar"
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
  onSwitchWorkspace: (dir: string) => void
  onOpenFolder: () => void
}) {
  const dirName = (dir: string) => dir.split("/").pop() || "Workspace"

  return (
    <div
      data-component="sidebar-rail"
      class="w-14 shrink-0 bg-background-base flex flex-col items-center overflow-hidden"
    >
      <div class="flex-1 min-h-0 w-full">
        <div class="h-full w-full flex flex-col items-center gap-2 px-2 pt-3 overflow-y-auto no-scrollbar">
          <For each={props.workspaces}>
            {(dir) => {
              const isActive = () => dir === props.activeWorkspace
              const colors = avatarColor(dir)
              return (
                <Tooltip placement="right" value={dirName(dir)}>
                  <button
                    type="button"
                    classList={{
                      "flex items-center justify-center size-9 rounded-lg overflow-hidden transition-all cursor-default": true,
                      "ring-2 ring-text-weak ring-offset-1 ring-offset-background-base": isActive(),
                      "opacity-60 hover:opacity-100": !isActive(),
                    }}
                    onClick={() => props.onSwitchWorkspace(dir)}
                  >
                    <Avatar
                      fallback={dirName(dir)}
                      background={colors.background}
                      foreground={colors.foreground}
                      class="size-full rounded-lg"
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
              onClick={props.onOpenFolder}
            />
          </Tooltip>
        </div>
      </div>

      <div class="shrink-0 w-full pb-5 pt-3 flex flex-col items-center gap-2">
        <Show when={import.meta.env.DEV}>
          <Tooltip placement="right" value="[Dev] Reset OpenACP">
            <IconButton
              icon="trash"
              variant="ghost"
              onClick={async () => {
                await invoke('dev_reset_openacp')
                location.reload()
              }}
            />
          </Tooltip>
        </Show>
        <Tooltip placement="right" value="Settings">
          <IconButton icon="settings-gear" variant="ghost" />
        </Tooltip>
      </div>
    </div>
  )
}
