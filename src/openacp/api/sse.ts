import type { AgentEvent, Session } from "../types"

export interface SSECallbacks {
  onAgentEvent: (event: AgentEvent) => void
  onSessionCreated: (session: Session) => void
  onSessionUpdated: (session: Session) => void
  onSessionDeleted: (sessionId: string) => void
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
    // Already connected
    if (connections.has(directory)) {
      const existing = connections.get(directory)!
      console.log('[sse] already have connection for', directory, 'readyState:', existing.readyState)
      return
    }

    // Mask token in log
    const logUrl = eventsUrl.replace(/token=[^&]+/, 'token=***')
    console.log('[sse] connecting to:', logUrl)
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
        console.log("[sse] session:updated", data)
        callbacks.onSessionUpdated(mapSessionFromSSE(data))
      } catch { /* skip */ }
    })

    es.addEventListener("session:deleted", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        callbacks.onSessionDeleted(data.sessionId || data.id)
      } catch { /* skip */ }
    })

    es.onopen = () => {
      console.log('[sse] connected:', eventsUrl)
      callbacks.onConnected()
    }
    es.onerror = (e) => {
      console.warn('[sse] error event, readyState:', es.readyState, e)
      if (es.readyState === EventSource.CLOSED) {
        console.warn('[sse] permanently closed — removing from map so reconnect is possible')
        connections.delete(directory)
        callbacks.onDisconnected()
      } else {
        // readyState === CONNECTING — browser is auto-retrying
        console.warn('[sse] reconnecting (auto-retry):', logUrl)
        callbacks.onReconnecting?.()
      }
    }

    // Listen to health heartbeat to confirm data is flowing
    es.addEventListener('health', (e) => {
      console.log('[sse] health heartbeat received')
    })

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
    createdAt: s.createdAt || new Date().toISOString(),
    lastActiveAt: s.lastActiveAt ?? null,
  }
}
