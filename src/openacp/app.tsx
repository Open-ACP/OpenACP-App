import { createSignal, createEffect, on, onCleanup, Show, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { WorkspaceProvider, resolveWorkspaceServer } from "./context/workspace"
import { SessionsProvider } from "./context/sessions"
import { ChatProvider } from "./context/chat"
import { SidebarPanel } from "./components/sidebar"
import { SidebarRail } from "./components/sidebar-rail"
import { ChatView } from "./components/chat-view"
import { Composer } from "./components/composer"
import { WelcomeScreen } from "./components/welcome"
import { loadWorkspaceData, saveWorkspaceData, discoverWorkspaces, type InstanceInfo } from "./api/workspace-store"
import { useChat } from "./context/chat"
import { Toast } from "../ui/src/components/toast"
import { ReviewPanel } from "./components/review-panel"
import type { ServerInfo } from "./types"

function ChatArea() {
  const chat = useChat()
  const [reviewOpen, setReviewOpen] = createSignal(false)
  return (
    <div class="flex flex-1 min-h-0 h-full min-w-0">
      <div class="@container relative flex-1 flex flex-col min-h-0 h-full bg-background-stronger min-w-0">
        <ChatView onOpenReview={() => setReviewOpen(true)} />
        <Show when={chat.activeSession()}>
          <Composer />
        </Show>
      </div>
      <Show when={reviewOpen()}>
        <div class="shrink-0 h-full">
          <ReviewPanel onClose={() => setReviewOpen(false)} />
        </div>
      </Show>
    </div>
  )
}

export function OpenACPApp() {
  const [store, setStore] = createStore({
    instances: [] as string[],       // known instance IDs
    active: null as string | null,   // active instance ID
    ready: false,
  })

  // Map of instanceId → InstanceInfo (for workspace dir, root, etc.)
  const [instanceMap, setInstanceMap] = createSignal<Map<string, InstanceInfo>>(new Map())

  const [server, setServer] = createSignal<ServerInfo | null>(null)
  const [serverLoading, setServerLoading] = createSignal(false)
  const [serverError, setServerError] = createSignal(false)

  // ── Instance info loading ──────────────────────────────────────────────

  async function refreshInstanceMap() {
    const discovered = await discoverWorkspaces()
    const map = new Map<string, InstanceInfo>()
    for (const info of discovered) map.set(info.id, info)
    setInstanceMap(map)
    return map
  }

  // ── Workspace persistence ───────────────────────────────────────────────

  void loadWorkspaceData().then(async (data) => {
    const map = await refreshInstanceMap()
    const validInstances = data.instances.filter((id) => map.has(id))
    if (validInstances.length > 0) {
      setStore("instances", validInstances)
    }
    if (data.lastActive && map.has(data.lastActive)) {
      setStore("active", data.lastActive)
    }
    setStore("ready", true)
  })

  function persistInstances() {
    void saveWorkspaceData({
      instances: store.instances,
      lastActive: store.active,
    })
  }

  function addInstance(instanceId: string) {
    if (store.instances.includes(instanceId)) {
      setStore("active", instanceId)
    } else {
      setStore("instances", (prev) => [...prev, instanceId])
      setStore("active", instanceId)
    }
    persistInstances()
  }

  function switchInstance(instanceId: string) {
    setStore("active", instanceId)
    persistInstances()
  }

  function removeInstance(instanceId: string) {
    setStore("instances", (prev) => prev.filter((id) => id !== instanceId))
    if (store.active === instanceId) {
      setStore("active", store.instances[0] ?? null)
    }
    persistInstances()
  }

  // Open folder picker — find matching instance by workspace dir
  async function openFolderPicker() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const selected = await open({ directory: true, multiple: false })
      if (!selected || typeof selected !== "string") return

      const map = await refreshInstanceMap()
      const match = Array.from(map.values()).find((info) => info.workspace === selected)
      if (match) {
        addInstance(match.id)
      } else {
        console.warn("[openFolder] No registered instance found for", selected)
        window.alert(`No OpenACP instance found in ${selected}.\nRun "openacp start" in that directory first.`)
      }
    } catch (e) {
      console.error("[openFolder] failed", e)
    }
  }

  // ── Server connection with auto-retry ───────────────────────────────────

  let retryTimer: ReturnType<typeof setInterval> | undefined
  let retryCount = 0
  const MAX_RETRY_INTERVAL = 10_000
  const BASE_RETRY_INTERVAL = 3_000

  async function resolveServer(instanceId: string): Promise<ServerInfo | null> {
    setServerLoading(true)
    setServerError(false)
    try {
      const info = await resolveWorkspaceServer(instanceId)
      if (info) {
        try {
          const res = await fetch(`${info.url}/api/v1/system/health`)
          if (res.ok) {
            setServerLoading(false)
            setServerError(false)
            retryCount = 0
            return info
          }
        } catch { /* health check failed */ }
      }
      setServerLoading(false)
      setServerError(true)
      return null
    } catch {
      setServerLoading(false)
      setServerError(true)
      return null
    }
  }

  function startRetry(instanceId: string) {
    stopRetry()
    const interval = Math.min(BASE_RETRY_INTERVAL + retryCount * 1000, MAX_RETRY_INTERVAL)
    retryTimer = setInterval(async () => {
      retryCount++
      const info = await resolveServer(instanceId)
      if (info) {
        setServer(info)
        stopRetry()
      }
    }, interval)
  }

  function stopRetry() {
    if (retryTimer) {
      clearInterval(retryTimer)
      retryTimer = undefined
    }
  }

  createEffect(
    on(
      () => store.active,
      async (instanceId) => {
        stopRetry()
        setServer(null)
        if (!instanceId) return

        const info = await resolveServer(instanceId)
        if (info) {
          setServer(info)
        } else {
          startRetry(instanceId)
        }
      },
    ),
  )

  onCleanup(() => stopRetry())

  if (typeof document !== "undefined") {
    const handleVisibility = async () => {
      if (document.visibilityState === "visible" && store.active && !server()) {
        const info = await resolveServer(store.active)
        if (info) {
          setServer(info)
          stopRetry()
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    onCleanup(() => document.removeEventListener("visibilitychange", handleVisibility))
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const activeInstanceInfo = () => store.active ? instanceMap().get(store.active) ?? null : null
  const hasInstance = () => store.active !== null
  const isConnected = () => server() !== null

  return (
    <div class="flex h-screen w-screen bg-background-base text-text-base select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      <Toast.Region />
      <SidebarRail
        workspaces={store.instances.map((id) => instanceMap().get(id)?.workspace ?? id)}
        activeWorkspace={activeInstanceInfo()?.workspace ?? ""}
        onSwitchWorkspace={(dir) => {
          const match = Array.from(instanceMap().values()).find((i) => i.workspace === dir)
          if (match) switchInstance(match.id)
        }}
        onOpenFolder={openFolderPicker}
      />

      <Show
        when={hasInstance()}
        fallback={
          <WelcomeScreen
            onOpenFolder={openFolderPicker}
            onSelectWorkspace={(instanceId) => addInstance(instanceId)}
          />
        }
      >
        <Show
          when={isConnected()}
          fallback={
            <div class="flex-1 flex items-center justify-center bg-background-stronger">
              <Show
                when={serverError()}
                fallback={<div class="text-14-regular text-text-weak">Connecting...</div>}
              >
                <div class="text-center flex flex-col items-center gap-4">
                  <div class="flex flex-col items-center gap-2">
                    <div class="text-16-medium text-text-strong">No Server Found</div>
                    <div class="text-14-regular text-text-weak">
                      Run <code class="px-1.5 py-0.5 rounded bg-surface-raised-base text-13-regular font-mono">openacp start</code> in your workspace
                    </div>
                    <div class="text-12-regular text-text-weak font-mono mt-1">{activeInstanceInfo()?.workspace}</div>
                  </div>
                  <div class="flex items-center gap-2 text-12-regular text-text-weaker">
                    <div class="w-1.5 h-1.5 rounded-full bg-text-weaker animate-pulse" />
                    Waiting for server...
                  </div>
                </div>
              </Show>
            </div>
          }
        >
          <WorkspaceProvider
            instanceId={store.active!}
            directory={activeInstanceInfo()?.workspace ?? ""}
            server={server()!}
          >
            <SessionsProvider>
              <ChatProvider>
                <SidebarPanel />
                <ChatArea />
              </ChatProvider>
            </SessionsProvider>
          </WorkspaceProvider>
        </Show>
      </Show>
    </div>
  )
}
