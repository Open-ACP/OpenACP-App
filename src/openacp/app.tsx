import { createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { WorkspaceProvider, resolveWorkspaceServer } from "./context/workspace"
import { SessionsProvider } from "./context/sessions"
import { ChatProvider } from "./context/chat"
import { SidebarPanel } from "./components/sidebar"
import { SidebarRail } from "./components/sidebar-rail"
import { ChatView } from "./components/chat-view"
import { Composer } from "./components/composer"

export function OpenACPApp(props: { directory: string }) {
  const [store, setStore] = createStore({
    workspaces: [props.directory] as string[],
    active: props.directory,
  })

  function addWorkspace(directory: string) {
    if (store.workspaces.includes(directory)) {
      setStore("active", directory)
      return
    }
    setStore("workspaces", (prev) => [...prev, directory])
    setStore("active", directory)
  }

  function switchWorkspace(directory: string) {
    setStore("active", directory)
  }

  async function openFolderPicker() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const selected = await open({ directory: true, multiple: false })
      if (selected && typeof selected === "string") {
        addWorkspace(selected)
      }
    } catch (e) {
      console.error("[openFolder] failed", e)
      const dir = window.prompt("Enter workspace directory path:")
      if (dir) addWorkspace(dir)
    }
  }

  const [server] = createResource(
    () => store.active,
    async (dir) => resolveWorkspaceServer(dir),
  )

  return (
    <div class="flex h-screen w-screen bg-background-base text-text-base select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      {/* Rail — always visible */}
      <SidebarRail
        workspaces={store.workspaces}
        activeWorkspace={store.active}
        onSwitchWorkspace={switchWorkspace}
        onOpenFolder={openFolderPicker}
      />

      {/* Content — depends on server availability */}
      <Show
        when={server()}
        fallback={
          <div class="flex-1 flex items-center justify-center bg-background-stronger">
            <Show when={server.loading} fallback={
              <div class="text-center">
                <div class="text-16-medium text-text-strong mb-2">No Server Found</div>
                <div class="text-14-regular text-text-weak mb-4">
                  Run <code class="px-1.5 py-0.5 rounded bg-surface-raised-base text-13-regular font-mono">openacp start</code> in your workspace
                </div>
                <div class="text-12-regular text-text-weak font-mono">{store.active}</div>
              </div>
            }>
              <div class="text-14-regular text-text-weak">Connecting...</div>
            </Show>
          </div>
        }
      >
        {(serverInfo) => (
          <WorkspaceProvider directory={store.active} server={serverInfo()}>
            <SessionsProvider>
              <ChatProvider>
                <SidebarPanel />
                <div class="@container relative flex-1 flex flex-col min-h-0 h-full bg-background-stronger min-w-0">
                  <ChatView />
                  <Composer />
                </div>
              </ChatProvider>
            </SessionsProvider>
          </WorkspaceProvider>
        )}
      </Show>
    </div>
  )
}
