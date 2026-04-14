import type { AgentEvent, MessageFailedEvent, MessageProcessingEvent, MessageQueuedEvent, PermissionRequest, Session } from "../types"

export interface SSECallbacks {
  onAgentEvent: (event: AgentEvent) => void
  onSessionCreated: (session: Session) => void
  onSessionUpdated: (session: Session) => void
  onSessionDeleted: (sessionId: string) => void
  onMessageQueued?: (event: MessageQueuedEvent) => void
  onMessageProcessing?: (event: MessageProcessingEvent) => void
  onMessageFailed?: (event: MessageFailedEvent) => void
  onPermissionRequest?: (event: PermissionRequest) => void
  onPermissionResolved?: (event: { sessionId: string; requestId: string; decision: string }) => void
  onConnected: () => void
  onDisconnected: () => void
  onReconnecting?: () => void
}

/**
 * Per-workspace SSE connection manager.
 * Each workspace gets its own EventSource pointing to its server.
 */
export function createSSEManager() {
  const connections = new Map<string, EventSource>()

  function connect(directory: string, eventsUrl: string, callbacks: SSECallbacks) {
    if (connections.has(directory)) return

    const logUrl = eventsUrl.replace(/token=[^&]+/, 'token=***')
    console.log('[sse] connecting:', logUrl)
    const es = new EventSource(eventsUrl)

    es.addEventListener("agent:event", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        callbacks.onAgentEvent(data)
      } catch { /* skip parse errors */ }
    })

    es.addEventListener("session:created", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        callbacks.onSessionCreated(mapSessionFromSSE(data))
      } catch { /* skip */ }
    })

    es.addEventListener("session:updated", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        callbacks.onSessionUpdated(mapSessionFromSSE(data))
      } catch { /* skip */ }
    })

    es.addEventListener("session:deleted", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        callbacks.onSessionDeleted(data.sessionId || data.id)
      } catch { /* skip */ }
    })

    es.addEventListener("message:queued", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        callbacks.onMessageQueued?.(data)
      } catch { /* skip */ }
    })

    es.addEventListener("message:processing", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        callbacks.onMessageProcessing?.(data)
      } catch { /* skip */ }
    })

    es.addEventListener("message:failed", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        callbacks.onMessageFailed?.(data)
      } catch { /* skip */ }
    })

    es.addEventListener("permission:request", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        // Event bus format: { sessionId, permission: { id, description, options } }
        if (data.permission) {
          const req = { ...data.permission, sessionId: data.sessionId }
          callbacks.onPermissionRequest?.(req)
          window.dispatchEvent(new CustomEvent("permission-request", { detail: req }))
        }
      } catch { /* skip */ }
    })

    es.addEventListener("permission:resolved", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        callbacks.onPermissionResolved?.(data)
      } catch { /* skip */ }
    })

    es.onopen = () => {
      console.log('[sse] connected')
      callbacks.onConnected()
    }
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        connections.delete(directory)
        callbacks.onDisconnected()
      } else {
        callbacks.onReconnecting?.()
      }
    }

    connections.set(directory, es)
  }

  function disconnect(directory: string) {
    const es = connections.get(directory)
    if (es) {
      es.close()
      connections.delete(directory)
    }
  }

  function disconnectAll() {
    for (const [, es] of connections) es.close()
    connections.clear()
  }

  function isConnected(directory: string): boolean {
    const es = connections.get(directory)
    return es?.readyState === EventSource.OPEN
  }

  return { connect, disconnect, disconnectAll, isConnected }
}

function mapSessionFromSSE(s: any): Session {
  return {
    id: s.id || s.sessionId || "",
    name: s.name || "Untitled",
    agent: s.agent || s.agentName || "",
    status: s.status || "active",
    workspace: s.workspace || "",
    channelId: s.channelId || "",
    createdAt: s.createdAt || new Date().toISOString(),
    lastActiveAt: s.lastActiveAt ?? null,
    dangerousMode: s.dangerousMode ?? false,
    queueDepth: s.queueDepth ?? 0,
    promptRunning: s.promptRunning ?? false,
    capabilities: s.capabilities ?? null,
    configOptions: s.configOptions,
    isLive: s.isLive ?? ["active", "initializing"].includes(s.status || "active"),
  }
}
