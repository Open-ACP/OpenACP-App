import React, { useState, useEffect, useRef, useCallback } from "react"
import { WorkspaceProvider, resolveWorkspaceServer } from "./context/workspace"
import { SessionsProvider } from "./context/sessions"
import { ChatProvider, useChat } from "./context/chat"
import { SidebarPanel } from "./components/sidebar"
import { SidebarRail } from "./components/sidebar-rail"
import { ChatView } from "./components/chat"
import { Composer } from "./components/composer"
import { WelcomeScreen } from "./components/welcome"
import { AddWorkspaceModal } from "./components/add-workspace/index"
import { loadWorkspaces, saveWorkspaces, discoverLocalInstances, type WorkspaceEntry } from "./api/workspace-store"
import { getKeychainToken } from "./api/keychain"
import { ReviewPanel } from "./components/review-panel"
import { showToast } from "./lib/toast"
import type { ServerInfo } from "./types"

function ChatArea() {
  const chat = useChat()
  const [reviewOpen, setReviewOpen] = useState(false)
  return (
    <div className="flex flex-1 min-h-0 h-full min-w-0">
      <div className="@container relative flex-1 flex flex-col min-h-0 h-full bg-background-stronger min-w-0">
        <ChatView onOpenReview={() => setReviewOpen(true)} />
        {chat.activeSession() && <Composer />}
      </div>
      {reviewOpen && (
        <div className="shrink-0 h-full">
          <ReviewPanel onClose={() => setReviewOpen(false)} />
        </div>
      )}
    </div>
  )
}

export function OpenACPApp() {
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const [server, setServer] = useState<ServerInfo | null>(null)
  const [serverLoading, setServerLoading] = useState(false)
  const [serverError, setServerError] = useState(false)
  const [errorWorkspaceIds, setErrorWorkspaceIds] = useState<Set<string>>(new Set())

  const [showAddWorkspace, setShowAddWorkspace] = useState(false)
  const [addWorkspaceDefaultTab, setAddWorkspaceDefaultTab] = useState<'local' | 'remote'>('local')

  const retryRef = useRef<ReturnType<typeof setInterval>>()
  const retryCountRef = useRef(0)

  // ── Helpers ────────────────────────────────────────────────────────────

  const findWorkspace = useCallback((id: string) => workspaces.find((w) => w.id === id), [workspaces])

  // ── Workspace info refresh ──────────────────────────────────────────────

  async function refreshWorkspaceInfo(id: string) {
    const entry = workspaces.find(w => w.id === id)
    if (!entry) return
    try {
      if (entry.type === 'local') {
        const list = await discoverLocalInstances()
        const found = list.find(i => i.id === id)
        if (found && (found.name !== entry.name || found.directory !== entry.directory)) {
          setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name: found.name ?? w.name, directory: found.directory } : w))
        }
      } else if (entry.type === 'remote' && entry.host) {
        const token = await getKeychainToken(id)
        if (!token) return
        const res = await fetch(`${entry.host}/api/v1/workspace`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const ws = await res.json() as { name?: string; directory?: string }
        if (ws.name !== entry.name || ws.directory !== entry.directory) {
          setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name: ws.name ?? w.name, directory: ws.directory ?? w.directory } : w))
        }
      }
    } catch { /* best-effort */ }
  }

  // ── Load workspaces on mount ─────────────────────────────────────────────

  useEffect(() => {
    void loadWorkspaces().then(async (entries) => {
      const discovered = await discoverLocalInstances()
      const discoveredIds = new Set(discovered.map((d) => d.id))
      const valid = entries.filter((e) => e.type === "remote" || discoveredIds.has(e.id))
      if (valid.length > 0) setWorkspaces(valid)
      const lastId = valid.length > 0 ? valid[valid.length - 1].id : null
      if (lastId) setActive(lastId)
      setReady(true)
    })
  }, [])

  // Persist workspaces
  useEffect(() => {
    if (ready && workspaces.length > 0) void saveWorkspaces(workspaces)
  }, [workspaces, ready])

  function addWorkspace(entry: WorkspaceEntry): boolean {
    const existing = workspaces.find((w) => w.id === entry.id)
    if (existing) {
      setWorkspaces(prev => prev.map(w => w.id === entry.id ? { ...w, ...entry } : w))
      setActive(entry.id)
      return false
    }
    setWorkspaces(prev => [...prev, entry])
    setActive(entry.id)
    return true
  }

  function addInstance(instanceId: string) {
    const existing = findWorkspace(instanceId)
    if (existing) { setActive(instanceId); return }
    addWorkspace({ id: instanceId, name: instanceId, directory: "", type: "local" })
  }

  function switchInstance(instanceId: string) { setActive(instanceId) }

  function removeInstance(instanceId: string) {
    setWorkspaces(prev => prev.filter((w) => w.id !== instanceId))
    if (active === instanceId) setActive(workspaces.find(w => w.id !== instanceId)?.id ?? null)
    setErrorWorkspaceIds(prev => { const next = new Set(prev); next.delete(instanceId); return next })
  }

  // ── Server connection ───────────────────────────────────────────────────

  const resolveServer = useCallback(async (instanceId: string): Promise<ServerInfo | null> => {
    setServerLoading(true); setServerError(false)
    try {
      const entry = findWorkspace(instanceId)
      let info: ServerInfo | null = null
      if (!entry || entry.type === "local") {
        info = await resolveWorkspaceServer(instanceId)
      } else {
        const jwt = await getKeychainToken(entry.id)
        if (!jwt) { setServerLoading(false); setServerError(true); return null }
        info = { url: entry.host ?? '', token: jwt }
      }
      if (info) {
        try {
          const res = await fetch(`${info.url}/api/v1/system/health`)
          if (res.ok) {
            setServerLoading(false); setServerError(false)
            setErrorWorkspaceIds(prev => { const next = new Set(prev); next.delete(instanceId); return next })
            retryCountRef.current = 0
            void refreshWorkspaceInfo(instanceId)
            return info
          }
        } catch {}
      }
      setServerLoading(false); setServerError(true)
      setErrorWorkspaceIds(prev => new Set([...prev, instanceId]))
      return null
    } catch {
      setServerLoading(false); setServerError(true)
      setErrorWorkspaceIds(prev => new Set([...prev, instanceId]))
      return null
    }
  }, [findWorkspace, workspaces])

  const stopRetry = useCallback(() => {
    if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = undefined }
  }, [])

  const startRetry = useCallback((instanceId: string) => {
    stopRetry()
    const interval = Math.min(3000 + retryCountRef.current * 1000, 10000)
    retryRef.current = setInterval(async () => {
      retryCountRef.current++
      const info = await resolveServer(instanceId)
      if (info) { setServer(info); stopRetry() }
    }, interval)
  }, [stopRetry, resolveServer])

  // React to active workspace changes
  useEffect(() => {
    stopRetry(); setServer(null)
    if (!active) return
    let cancelled = false
    void resolveServer(active).then((info) => {
      if (cancelled) return
      if (info) setServer(info); else startRetry(active)
    })
    return () => { cancelled = true; stopRetry() }
  }, [active])

  // Visibility change
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === "visible" && active && !server) {
        const info = await resolveServer(active)
        if (info) { setServer(info); stopRetry() }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [active, server, resolveServer, stopRetry])

  // ── Add workspace modal ─────────────────────────────────────────────────

  async function handleAddWorkspace(entry: WorkspaceEntry) {
    const isNew = addWorkspace(entry)
    setShowAddWorkspace(false)
    if (!isNew && active === entry.id) {
      stopRetry(); setServer(null)
      const info = await resolveServer(entry.id)
      if (info) setServer(info); else startRetry(entry.id)
    }
    showToast({ description: isNew ? `Workspace "${entry.name}" added.` : `Workspace "${entry.name}" already exists -- info updated.`, variant: "success" })
  }

  function openAddWorkspaceModal(defaultTab: 'local' | 'remote' = 'local') {
    stopRetry(); setAddWorkspaceDefaultTab(defaultTab); setShowAddWorkspace(true)
  }

  function closeAddWorkspaceModal() {
    setShowAddWorkspace(false)
    if (active && !server) startRetry(active)
  }

  async function openFolderPicker() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const selected = await open({ directory: true, multiple: false })
      if (!selected || typeof selected !== "string") return
      const existingMatch = workspaces.find((w) => w.directory === selected)
      if (existingMatch) { switchInstance(existingMatch.id); return }
      const discovered = await discoverLocalInstances()
      const match = discovered.find((info) => info.directory === selected)
      if (match) addWorkspace({ id: match.id, name: match.name ?? match.id, directory: match.directory, type: "local" })
      else window.alert(`No OpenACP instance found in ${selected}.\nRun "openacp start" in that directory first.`)
    } catch (e) { console.error("[openFolder] failed", e) }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const activeWorkspace = active ? findWorkspace(active) ?? null : null
  const hasInstance = active !== null
  const isConnected = server !== null

  return (
    <div className="flex h-screen w-screen bg-background-base text-text-base select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      <SidebarRail
        workspaces={workspaces.map((w) => w.directory || w.id)}
        activeWorkspace={activeWorkspace?.directory ?? activeWorkspace?.id ?? ""}
        errorWorkspaces={new Set(workspaces.filter(w => errorWorkspaceIds.has(w.id)).map(w => w.directory || w.id))}
        onSwitchWorkspace={(dir) => { const match = workspaces.find((w) => w.directory === dir || w.id === dir); if (match) switchInstance(match.id) }}
        onReconnect={(dir) => { const match = workspaces.find((w) => w.directory === dir || w.id === dir); if (match) switchInstance(match.id); openAddWorkspaceModal('remote') }}
        onOpenFolder={() => openAddWorkspaceModal('local')}
      />

      {hasInstance ? (
        isConnected ? (
          <WorkspaceProvider
            workspace={activeWorkspace!}
            server={server!}
            onReconnectNeeded={() => { setServer(null); setServerError(true); if (active) setErrorWorkspaceIds(prev => new Set([...prev, active])) }}
            onTokenRefreshed={({ expiresAt, refreshDeadline }) => {
              if (!active) return
              setWorkspaces(prev => prev.map(w => w.id === active ? { ...w, expiresAt, refreshDeadline } : w))
            }}
          >
            <SessionsProvider>
              <ChatProvider>
                <SidebarPanel />
                <ChatArea />
              </ChatProvider>
            </SessionsProvider>
          </WorkspaceProvider>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-background-stronger">
            {serverError ? (
              <div className="text-center flex flex-col items-center gap-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="text-16-medium text-text-strong">No Server Found</div>
                  <div className="text-14-regular text-text-weak">Run <code className="px-1.5 py-0.5 rounded bg-surface-raised-base text-13-regular font-mono">openacp start</code> in your workspace</div>
                  <div className="text-12-regular text-text-weak font-mono mt-1">{activeWorkspace?.directory}</div>
                </div>
                <div className="flex items-center gap-2 text-12-regular text-text-weaker"><div className="w-1.5 h-1.5 rounded-full bg-text-weaker animate-pulse" />Waiting for server...</div>
              </div>
            ) : (
              <div className="text-14-regular text-text-weak">Connecting...</div>
            )}
          </div>
        )
      ) : (
        <WelcomeScreen onOpenFolder={openFolderPicker} onSelectWorkspace={(instanceId) => addInstance(instanceId)} />
      )}

      {showAddWorkspace && (
        <AddWorkspaceModal onAdd={handleAddWorkspace} onClose={closeAddWorkspaceModal} existingIds={workspaces.map((w) => w.id)} defaultTab={addWorkspaceDefaultTab} />
      )}
    </div>
  )
}
