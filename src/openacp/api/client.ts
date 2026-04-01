import type { Agent, ServerInfo, Session } from "../types"

export function createApiClient(server: ServerInfo) {
  const { url, token } = server

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${url}/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers as Record<string, string> | undefined),
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`API ${res.status} ${path}: ${body}`)
    }
    return res.json()
  }

  return {
    /** Check server health */
    async health(): Promise<boolean> {
      try {
        const res = await api<{ status: string }>("/system/health")
        return res.status === "ok"
      } catch {
        return false
      }
    },

    /** List agents (models) available on this workspace server */
    async agents(): Promise<{ agents: Agent[]; default: string }> {
      const res = await api<{ agents: any[]; default: string }>("/agents")
      return {
        agents: (res.agents || []).map((a: any) => ({
          name: a.name,
          displayName: a.displayName || a.name,
          description: a.description || "",
        })),
        default: res.default || res.agents?.[0]?.name || "default",
      }
    },

    /** List sessions for this workspace */
    async listSessions(): Promise<Session[]> {
      const res = await api<{ sessions: any[] }>("/sessions")
      return (res.sessions || []).map(mapSession)
    },

    /** Create a new session */
    async createSession(opts?: { workspace?: string; agent?: string }): Promise<Session> {
      const body: Record<string, string> = {}
      if (opts?.workspace) body.workspace = opts.workspace
      if (opts?.agent) body.agent = opts.agent
      const res = await api<any>("/sessions", {
        method: "POST",
        body: JSON.stringify(body),
      })
      return mapSession(res)
    },

    /** Delete a session */
    async deleteSession(sessionID: string): Promise<void> {
      await api(`/sessions/${encodeURIComponent(sessionID)}`, { method: "DELETE" })
    },

    /** Send a prompt to a session */
    async sendPrompt(sessionID: string, text: string): Promise<void> {
      await api(`/sessions/${encodeURIComponent(sessionID)}/prompt`, {
        method: "POST",
        body: JSON.stringify({ prompt: text }),
      })
    },

    /** Get session config options (mode, model, etc.) */
    async getSessionConfig(sessionID: string): Promise<{ configOptions: any[]; clientOverrides: any }> {
      return api(`/sessions/${encodeURIComponent(sessionID)}/config`)
    },

    /** Set a session config option */
    async setSessionConfig(sessionID: string, configId: string, value: string): Promise<void> {
      await api(`/sessions/${encodeURIComponent(sessionID)}/config/${encodeURIComponent(configId)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      })
    },

    /** SSE events URL for EventSource */
    get eventsUrl(): string {
      return `${url}/api/v1/events?token=${encodeURIComponent(token)}`
    },
  }
}

function mapSession(s: any): Session {
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

export type ApiClient = ReturnType<typeof createApiClient>
