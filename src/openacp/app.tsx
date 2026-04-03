import { createSignal, createEffect, on, onCleanup, Show, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { WorkspaceProvider, resolveWorkspaceServer } from "./context/workspace"
import { SessionsProvider } from "./context/sessions"
import { ChatProvider } from "./context/chat"
import { SidebarPanel } from "./components/sidebar"
import { SidebarRail } from "./components/sidebar-rail"
import { ChatView } from "./components/chat"
import { Composer } from "./components/composer"
import { WelcomeScreen } from "./components/welcome"
import { AddWorkspaceModal } from "./components/add-workspace/index.js"
import { loadWorkspaces, saveWorkspaces, discoverLocalInstances, type WorkspaceEntry } from "./api/workspace-store"
import { getKeychainToken } from "./api/keychain.js"
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
    workspaces: [] as WorkspaceEntry[], // known workspaces
    active: null as string | null,      // active workspace ID
    ready: false,
  })

  const [server, setServer] = createSignal<ServerInfo | null>(null)
  const [serverLoading, setServerLoading] = createSignal(false)
  const [serverError, setServerError] = createSignal(false)
  const [errorWorkspaceIds, setErrorWorkspaceIds] = createSignal<Set<string>>(new Set())

  // ── Helpers ────────────────────────────────────────────────────────────

  function findWorkspace(id: string): WorkspaceEntry | undefined {
    return store.workspaces.find((w) => w.id === id)
  }

  // ── Workspace info refresh ──────────────────────────────────────────────

  async function refreshWorkspaceInfo(id: string) {
    const entry = store.workspaces.find(w => w.id === id)
    if (!entry) return
    try {
      if (entry.type === 'local') {
        const list = await discoverLocalInstances()
        const found = list.find(i => i.id === id)
        if (found && (found.name !== entry.name || found.directory !== entry.directory)) {
          setStore('workspaces', (prev) => prev.map(w =>
            w.id === id ? { ...w, name: found.name ?? w.name, directory: found.directory } : w
          ))
          void saveWorkspaces(store.workspaces)
        }
      } else if (entry.type === 'remote' && entry.host) {
        const token = await getKeychainToken(id)
        if (!token) return
        const res = await fetch(`${entry.host}/api/v1/workspace`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const ws = await res.json() as { name?: string; directory?: string }
        if (ws.name !== entry.name || ws.directory !== entry.directory) {
          setStore('workspaces', (prev) => prev.map(w =>
            w.id === id ? { ...w, name: ws.name ?? w.name, directory: ws.directory ?? w.directory } : w
          ))
          void saveWorkspaces(store.workspaces)
        }
      }
    } catch { /* best-effort */ }
  }

  // ── Workspace persistence ───────────────────────────────────────────────

  void loadWorkspaces().then(async (entries) => {
    // Discover local instances to validate local entries are still present
    const discovered = await discoverLocalInstances()
    const discoveredIds = new Set(discovered.map((d) => d.id))

    // Keep entries that are remote (can't validate) or still locally discoverable
    const valid = entries.filter(
      (e) => e.type === "remote" || discoveredIds.has(e.id),
    )

    if (valid.length > 0) {
      setStore("workspaces", valid)
    }

    // Restore last active (last entry in list, matching existing)
    const lastId = valid.length > 0 ? valid[valid.length - 1].id : null
    if (lastId) {
      setStore("active", lastId)
    }

    setStore("ready", true)
  })

  function persistWorkspaces() {
    void saveWorkspaces(store.workspaces)
  }

  function addWorkspace(entry: WorkspaceEntry): boolean {
    const existing = store.workspaces.find((w) => w.id === entry.id)
    if (existing) {
      // Update all mutable fields (name, directory, host, token info)
      setStore("workspaces", (prev) =>
        prev.map((w) =>
          w.id === entry.id ? { ...w, ...entry } : w
        )
      )
      setStore("active", entry.id)
      persistWorkspaces()
      return false // already existed → updated
    } else {
      setStore("workspaces", (prev) => [...prev, entry])
      setStore("active", entry.id)
      persistWorkspaces()
      return true // newly added
    }
  }

  function addInstance(instanceId: string) {
    // Legacy helper: add a local workspace by ID only (for WelcomeScreen callback)
    const existing = findWorkspace(instanceId)
    if (existing) {
      setStore("active", instanceId)
      persistWorkspaces()
      return
    }
    // Build a minimal WorkspaceEntry for local instances
    const entry: WorkspaceEntry = {
      id: instanceId,
      name: instanceId,
      directory: "",
      type: "local",
    }
    addWorkspace(entry)
  }

  function switchInstance(instanceId: string) {
    setStore("active", instanceId)
    persistWorkspaces()
  }

  function removeInstance(instanceId: string) {
    setStore("workspaces", (prev) => prev.filter((w) => w.id !== instanceId))
    if (store.active === instanceId) {
      setStore("active", store.workspaces[0]?.id ?? null)
    }
    setErrorWorkspaceIds(prev => { const next = new Set(prev); next.delete(instanceId); return next })
    persistWorkspaces()
  }

  // ── Add workspace modal ─────────────────────────────────────────────────

  const [showAddWorkspace, setShowAddWorkspace] = createSignal(false)
  const [addWorkspaceDefaultTab, setAddWorkspaceDefaultTab] = createSignal<'local' | 'remote'>('local')

  async function handleAddWorkspace(entry: WorkspaceEntry) {
    const isNew = addWorkspace(entry)
    setShowAddWorkspace(false) // don't call closeAddWorkspaceModal — we handle reconnect below

    // If the updated workspace is already active, force re-resolve so the new host/token takes effect
    if (!isNew && store.active === entry.id) {
      stopRetry()
      setServer(null)
      const info = await resolveServer(entry.id)
      if (info) {
        setServer(info)
      } else {
        startRetry(entry.id)
      }
    }

    const { showToast } = await import("../ui/src/components/toast")
    if (isNew) {
      showToast({ description: `Workspace "${entry.name}" added.`, variant: "success" })
    } else {
      showToast({ description: `Workspace "${entry.name}" already exists — info updated.`, variant: "success" })
    }
  }

  function openAddWorkspaceModal(defaultTab: 'local' | 'remote' = 'local') {
    stopRetry() // pause background retry while modal is open
    setAddWorkspaceDefaultTab(defaultTab)
    setShowAddWorkspace(true)
  }

  function closeAddWorkspaceModal() {
    setShowAddWorkspace(false)
    // resume retry if still disconnected
    if (store.active && !server()) {
      startRetry(store.active)
    }
  }

  // Open folder picker — find matching workspace by directory
  async function openFolderPicker() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const selected = await open({ directory: true, multiple: false })
      if (!selected || typeof selected !== "string") return

      // Check existing workspaces first
      const existingMatch = store.workspaces.find((w) => w.directory === selected)
      if (existingMatch) {
        switchInstance(existingMatch.id)
        return
      }

      // Discover fresh list and find match
      const discovered = await discoverLocalInstances()
      const match = discovered.find((info) => info.directory === selected)
      if (match) {
        const entry: WorkspaceEntry = {
          id: match.id,
          name: match.name ?? match.id,
          directory: match.directory,
          type: "local",
        }
        addWorkspace(entry)
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
      const entry = findWorkspace(instanceId)

      let info: ServerInfo | null = null

      if (!entry || entry.type === "local") {
        // Local: use Tauri command to get server info from instance root
        info = await resolveWorkspaceServer(instanceId)
      } else {
        // Remote: read JWT from keychain
        const jwt = await getKeychainToken(entry.id)
        if (!jwt) {
          setServerLoading(false)
          setServerError(true)
          return null
        }
        info = { url: entry.host ?? '', token: jwt }
      }

      if (info) {
        try {
          const res = await fetch(`${info.url}/api/v1/system/health`)
          if (res.ok) {
            setServerLoading(false)
            setServerError(false)
            setErrorWorkspaceIds(prev => { const next = new Set(prev); next.delete(instanceId); return next })
            retryCount = 0
            void refreshWorkspaceInfo(instanceId)
            return info
          }
        } catch { /* health check failed */ }
      }
      setServerLoading(false)
      setServerError(true)
      setErrorWorkspaceIds(prev => new Set([...prev, instanceId]))
      return null
    } catch {
      setServerLoading(false)
      setServerError(true)
      setErrorWorkspaceIds(prev => new Set([...prev, instanceId]))
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

  const activeWorkspace = () => store.active ? findWorkspace(store.active) ?? null : null
  const hasInstance = () => store.active !== null
  const isConnected = () => server() !== null

  return (
    <div class="flex h-screen w-screen bg-background-base text-text-base select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      <Toast.Region />
      <SidebarRail
        workspaces={store.workspaces.map((w) => w.directory || w.id)}
        activeWorkspace={activeWorkspace()?.directory ?? activeWorkspace()?.id ?? ""}
        errorWorkspaces={new Set(
          store.workspaces
            .filter(w => errorWorkspaceIds().has(w.id))
            .map(w => w.directory || w.id)
        )}
        onSwitchWorkspace={(dir) => {
          const match = store.workspaces.find((w) => w.directory === dir || w.id === dir)
          if (match) switchInstance(match.id)
        }}
        onReconnect={(dir) => {
          const match = store.workspaces.find((w) => w.directory === dir || w.id === dir)
          if (match) switchInstance(match.id)
          openAddWorkspaceModal('remote')
        }}
        onOpenFolder={() => openAddWorkspaceModal('local')}
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
                    <div class="text-12-regular text-text-weak font-mono mt-1">{activeWorkspace()?.directory}</div>
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
            workspace={activeWorkspace()!}
            server={server()!}
            onReconnectNeeded={() => {
              setServer(null)
              setServerError(true)
              if (store.active) {
                setErrorWorkspaceIds(prev => new Set([...prev, store.active!]))
              }
            }}
            onTokenRefreshed={({ expiresAt, refreshDeadline }) => {
              const id = store.active
              if (!id) return
              setStore("workspaces", (prev) =>
                prev.map((w) => w.id === id ? { ...w, expiresAt, refreshDeadline } : w)
              )
              void saveWorkspaces(store.workspaces)
            }}
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
      <Show when={showAddWorkspace()}>
        <AddWorkspaceModal
          onAdd={handleAddWorkspace}
          onClose={closeAddWorkspaceModal}
          existingIds={store.workspaces.map((w) => w.id)}
          defaultTab={addWorkspaceDefaultTab()}
        />
      </Show>
    </div>
  )
}
