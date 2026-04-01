import type { AgentEvent, Session } from "../types"

export interface SSECallbacks {
  onAgentEvent: (event: AgentEvent) => void
  onSessionCreated: (session: Session) => void
  onSessionUpdated: (session: Session) => void
  onSessionDeleted: (sessionId: string) => void
  onConnected: () => void
  onDisconnected: () => void
}

/**
 * Per-workspace SSE connection manager.
 * Each workspace gets its own EventSource pointing to its server.
 */
export function createSSEManager() {
  const connections = new Map<string, EventSource>()

  function connect(directory: string, eventsUrl: string, callbacks: SSECallbacks) {
    // Already connected
    if (connections.has(directory)) return

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

    es.onopen = () => callbacks.onConnected()
    es.onerror = () => callbacks.onDisconnected()

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
