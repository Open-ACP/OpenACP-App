import { useState, useEffect, useRef, useCallback } from "react"
import { WorkspaceProvider, resolveWorkspaceServer } from "./context/workspace"
import { SessionsProvider } from "./context/sessions"
import { ChatProvider } from "./context/chat"
import { SidebarPanel } from "./components/sidebar"
import { SidebarRail } from "./components/sidebar-rail"
import { ChatView } from "./components/chat"
import { Composer } from "./components/composer"
import { WelcomeScreen } from "./components/welcome"
import { loadWorkspaceData, saveWorkspaceData, discoverWorkspaces, type InstanceInfo } from "./api/workspace-store"
import { useChat } from "./context/chat"
import { ReviewPanel } from "./components/review-panel"
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
  const [instances, setInstances] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [instanceMap, setInstanceMap] = useState<Map<string, InstanceInfo>>(new Map())
  const [server, setServer] = useState<ServerInfo | null>(null)
  const [serverLoading, setServerLoading] = useState(false)
  const [serverError, setServerError] = useState(false)

  const retryTimerRef = useRef<ReturnType<typeof setInterval>>()
  const retryCountRef = useRef(0)
  const MAX_RETRY_INTERVAL = 10_000
  const BASE_RETRY_INTERVAL = 3_000

  // Keep refs for latest state in callbacks
  const activeRef = useRef(active)
  activeRef.current = active
  const serverRef = useRef(server)
  serverRef.current = server
  const instancesRef = useRef(instances)
  instancesRef.current = instances

  const refreshInstanceMap = useCallback(async () => {
    const discovered = await discoverWorkspaces()
    const map = new Map<string, InstanceInfo>()
    for (const info of discovered) map.set(info.id, info)
    setInstanceMap(map)
    return map
  }, [])

  // Workspace persistence: load on mount
  useEffect(() => {
    (async () => {
      const data = await loadWorkspaceData()
      const map = await refreshInstanceMap()
      const validInstances = data.instances.filter((id) => map.has(id))
      if (validInstances.length > 0) setInstances(validInstances)
      if (data.lastActive && map.has(data.lastActive)) setActive(data.lastActive)
      setReady(true)
    })()
  }, [refreshInstanceMap])

  const persistInstances = useCallback((insts: string[], act: string | null) => {
    void saveWorkspaceData({ instances: insts, lastActive: act })
  }, [])

  const addInstance = useCallback((instanceId: string) => {
    setInstances((prev) => {
      const next = prev.includes(instanceId) ? prev : [...prev, instanceId]
      setActive(instanceId)
      persistInstances(next, instanceId)
      return next
    })
  }, [persistInstances])

  const switchInstance = useCallback((instanceId: string) => {
    setActive(instanceId)
    persistInstances(instancesRef.current, instanceId)
  }, [persistInstances])

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

  // -- Server connection with auto-retry --

  const resolveServer = useCallback(async (instanceId: string): Promise<ServerInfo | null> => {
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
            retryCountRef.current = 0
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
  }, [])

  const stopRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current)
      retryTimerRef.current = undefined
    }
  }, [])

  const startRetry = useCallback((instanceId: string) => {
    stopRetry()
    const interval = Math.min(BASE_RETRY_INTERVAL + retryCountRef.current * 1000, MAX_RETRY_INTERVAL)
    retryTimerRef.current = setInterval(async () => {
      retryCountRef.current++
      const info = await resolveServer(instanceId)
      if (info) {
        setServer(info)
        stopRetry()
      }
    }, interval)
  }, [resolveServer, stopRetry])

  // Connect when active changes
  useEffect(() => {
    stopRetry()
    setServer(null)
    if (!active) return

    let cancelled = false
    ;(async () => {
      const info = await resolveServer(active)
      if (cancelled) return
      if (info) {
        setServer(info)
      } else {
        startRetry(active)
      }
    })()

    return () => {
      cancelled = true
      stopRetry()
    }
  }, [active, resolveServer, startRetry, stopRetry])

  // Visibility change handler
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === "visible" && activeRef.current && !serverRef.current) {
        const info = await resolveServer(activeRef.current)
        if (info) {
          setServer(info)
          stopRetry()
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [resolveServer, stopRetry])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopRetry()
  }, [stopRetry])

  const activeInstanceInfo = active ? instanceMap.get(active) ?? null : null
  const hasInstance = active !== null
  const isConnected = server !== null

  return (
    <div className="flex h-screen w-screen bg-background-base text-text-base select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      {/* Toast region placeholder */}
      <div id="toast-region" />
      <SidebarRail
        workspaces={instances.map((id) => instanceMap.get(id)?.workspace ?? id)}
        activeWorkspace={activeInstanceInfo?.workspace ?? ""}
        onSwitchWorkspace={(dir) => {
          const match = Array.from(instanceMap.values()).find((i) => i.workspace === dir)
          if (match) switchInstance(match.id)
        }}
        onOpenFolder={openFolderPicker}
      />

      {hasInstance ? (
        isConnected ? (
          <WorkspaceProvider
            instanceId={active!}
            directory={activeInstanceInfo?.workspace ?? ""}
            server={server!}
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
                  <div className="text-14-regular text-text-weak">
                    Run <code className="px-1.5 py-0.5 rounded bg-surface-raised-base text-13-regular font-mono">openacp start</code> in your workspace
                  </div>
                  <div className="text-12-regular text-text-weak font-mono mt-1">{activeInstanceInfo?.workspace}</div>
                </div>
                <div className="flex items-center gap-2 text-12-regular text-text-weaker">
                  <div className="w-1.5 h-1.5 rounded-full bg-text-weaker animate-pulse" />
                  Waiting for server...
                </div>
              </div>
            ) : (
              <div className="text-14-regular text-text-weak">Connecting...</div>
            )}
          </div>
        )
      ) : (
        <WelcomeScreen
          onOpenFolder={openFolderPicker}
          onSelectWorkspace={(instanceId) => addInstance(instanceId)}
        />
      )}
    </div>
  )
}
