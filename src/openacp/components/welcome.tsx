import { For, Show, createResource } from "solid-js"
import { discoverLocalInstances } from "../api/workspace-store"

export function WelcomeScreen(props: {
  onOpenFolder: () => void
  onSelectWorkspace: (instanceId: string) => void
}) {
  const [discovered] = createResource(discoverLocalInstances)

  const dirName = (directory: string) => directory.split("/").pop() || "Workspace"
  const shortPath = (directory: string) => {
    const parts = directory.split("/")
    if (parts.length > 3) return "~/" + parts.slice(3).join("/")
    return directory
  }

  return (
    <div class="flex-1 flex items-center justify-center bg-background-stronger">
      <div class="flex flex-col items-center gap-8 max-w-md w-full px-6">
        <div class="flex flex-col items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-surface-raised-base flex items-center justify-center border border-border-weaker-base">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-base" />
            </svg>
          </div>
          <div class="text-center">
            <div class="text-16-medium text-text-strong">OpenACP</div>
            <div class="text-13-regular text-text-weak mt-1">Open a workspace to get started</div>
          </div>
        </div>

        <Show when={discovered() && discovered()!.length > 0}>
          <div class="w-full">
            <div class="text-text-weaker mb-2" style={{ "font-size": "11px", "font-weight": "500", "letter-spacing": "0.03em" }}>
              Recent workspaces
            </div>
            <div class="flex flex-col gap-1">
              <For each={discovered()}>
                {(instance) => (
                  <button
                    class="w-full flex flex-col gap-0.5 px-3 py-2.5 rounded-lg text-left hover:bg-surface-raised-base-hover transition-colors"
                    onClick={() => props.onSelectWorkspace(instance.id)}
                  >
                    <span class="text-14-medium text-text-strong">{dirName(instance.directory)}</span>
                    <span class="text-12-regular text-text-weak truncate">{shortPath(instance.directory)}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <button
          class="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border-base text-14-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors"
          onClick={props.onOpenFolder}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M2.5 5.83333V15.8333H17.5V7.5H9.58333L7.5 5.83333H2.5Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Open Folder
        </button>
      </div>
    </div>
  )
}
