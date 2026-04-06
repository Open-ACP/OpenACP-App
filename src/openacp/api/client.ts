import type { Agent, AuthInfo, ServerCommand, ServerInfo, Session, SessionHistory, StoredToken, TokenInfo } from "../types"

export function createApiClient(server: ServerInfo, workspaceId?: string) {
  const { url } = server
  let token = server.token
  let onReconnectNeeded: (() => void) | undefined
  let onTokenRefreshed: ((update: { expiresAt: string; refreshDeadline: string }) => void) | undefined

  async function tryRefreshToken(): Promise<boolean> {
    try {
      const res = await fetch(`${url}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return false
      const data: TokenInfo = await res.json()
      token = data.accessToken
      // Persist refreshed token to keychain
      if (workspaceId) {
        const { setKeychainToken } = await import('./keychain.js')
        await setKeychainToken(workspaceId, data.accessToken)
      }
      // Notify caller so WorkspaceEntry dates can be updated in the store
      onTokenRefreshed?.({ expiresAt: data.expiresAt, refreshDeadline: data.refreshDeadline })
      return true
    } catch {
      return false
    }
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${url}/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers as Record<string, string> | undefined),
      },
    })

    // Auto-refresh expired JWT and retry once
    if (res.status === 401 && token.startsWith("eyJ")) {
      const refreshed = await tryRefreshToken()
      if (refreshed) {
        const retry = await fetch(`${url}/api/v1${path}`, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(init?.headers as Record<string, string> | undefined),
          },
        })
        if (!retry.ok) {
          const body = await retry.text().catch(() => "")
          throw new Error(`API ${retry.status} ${path}: ${body}`)
        }
        return retry.json()
      }
      // Refresh failed — token is no longer valid
      onReconnectNeeded?.()
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`API ${res.status} ${path}: ${body}`)
    }
    return res.json()
  }

  return {
    /** Register a callback invoked when the JWT can no longer be refreshed */
    setOnReconnectNeeded(cb: () => void) { onReconnectNeeded = cb },
    /** Register a callback invoked after a successful token refresh with updated expiry dates */
    setOnTokenRefreshed(cb: (update: { expiresAt: string; refreshDeadline: string }) => void) { onTokenRefreshed = cb },
    /** Check server health */
    async health(): Promise<boolean> {
      try {
        const res = await api<{ status: string }>("/system/health")
        return res.status === "ok"
      } catch {
        return false
      }
    },

    /** Get the server version string (e.g. "2026.327.1") */
    async getServerVersion(): Promise<string> {
      const res = await api<{ version: string }>("/system/health")
      return res.version
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

    /** Switch the agent for an active session */
    async switchAgent(sessionId: string, agentName: string): Promise<{ ok: boolean; resumed?: boolean }> {
      return api<{ ok: boolean; resumed?: boolean }>(`/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ agentName }),
      })
    },

    /** List sessions for this workspace */
    async listSessions(): Promise<Session[]> {
      const res = await api<{ sessions: any[] }>("/sessions")
      return (res.sessions || []).map(mapSession)
    },

    /** Create a new session */
    async createSession(opts?: { workspace?: string; agent?: string }): Promise<Session> {
      const body: Record<string, string> = { channel: "sse" }
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

    /** Send a prompt to a session, optionally with file attachments */
    async sendPrompt(sessionID: string, text: string, attachments?: import("../types").FileAttachment[]): Promise<void> {
      const body: Record<string, unknown> = { prompt: text }
      if (attachments?.length) {
        body.attachments = attachments.map(a => ({
          fileName: a.fileName,
          mimeType: a.mimeType,
          data: a.dataUrl.split(",")[1] ?? "", // strip data URL prefix, send raw base64
        }))
      }
      await api(`/sessions/${encodeURIComponent(sessionID)}/prompt`, {
        method: "POST",
        body: JSON.stringify(body),
      })
    },

    /** Cancel/abort the current prompt in a session */
    async cancelPrompt(sessionID: string): Promise<void> {
      await api(`/sessions/${encodeURIComponent(sessionID)}/cancel`, {
        method: "POST",
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

    /** Generate a new JWT token (requires secret token auth) */
    async generateToken(opts: { role: string; name: string; expire?: string; scopes?: string[] }): Promise<TokenInfo> {
      return api("/auth/tokens", {
        method: "POST",
        body: JSON.stringify(opts),
      })
    },

    /** Refresh the current JWT (works even if expired, within refresh deadline) */
    async refreshToken(): Promise<TokenInfo> {
      const data = await api<TokenInfo>("/auth/refresh", { method: "POST" })
      token = data.accessToken
      return data
    },

    /** List active tokens (requires auth:manage scope) */
    async listTokens(): Promise<StoredToken[]> {
      const res = await api<{ tokens: StoredToken[] }>("/auth/tokens")
      return res.tokens || []
    },

    /** Revoke a token by ID (requires auth:manage scope) */
    async revokeToken(tokenId: string): Promise<void> {
      await api(`/auth/tokens/${encodeURIComponent(tokenId)}`, { method: "DELETE" })
    },

    /** Get current auth info (role, scopes, expiry) */
    async me(): Promise<AuthInfo> {
      return api("/auth/me")
    },

    /** List registered commands from server */
    async getCommands(): Promise<ServerCommand[]> {
      try {
        const res = await api<{ commands: any[] }>("/commands")
        return (res.commands || []).map((c: any) => ({
          name: c.name,
          description: c.description || "",
          usage: c.usage || "",
          category: c.category || "system",
        }))
      } catch {
        return []
      }
    },

    /** Execute a server command */
    async executeCommand(command: string, sessionID?: string): Promise<{ result?: any; error?: string }> {
      try {
        const body: Record<string, string> = { command }
        if (sessionID) body.sessionId = sessionID
        return await api("/commands/execute", {
          method: "POST",
          body: JSON.stringify(body),
        })
      } catch (e: any) {
        return { error: e?.message || "Command failed" }
      }
    },

    /** Resolve a permission request (approve/deny), optionally with feedback text */
    async resolvePermission(sessionID: string, permissionId: string, optionId: string, feedback?: string): Promise<void> {
      const body: Record<string, string> = { permissionId, optionId }
      if (feedback) body.feedback = feedback
      await api(`/sessions/${encodeURIComponent(sessionID)}/permission`, {
        method: "POST",
        body: JSON.stringify(body),
      })
    },

    /** Set client overrides (bypass permissions, etc.) */
    async setClientOverrides(sessionID: string, overrides: { bypassPermissions?: boolean }): Promise<void> {
      await api(`/sessions/${encodeURIComponent(sessionID)}/config/overrides`, {
        method: "PUT",
        body: JSON.stringify(overrides),
      })
    },

    /** Get full conversation history for a session */
    async getSessionHistory(sessionID: string): Promise<SessionHistory | null> {
      try {
        const res = await api<{ history: SessionHistory }>(`/sessions/${encodeURIComponent(sessionID)}/history`)
        return res.history
      } catch {
        return null
      }
    },

    /** List all installed plugins with runtime state */
    async listPlugins(): Promise<{ plugins: import('../types').InstalledPlugin[] }> {
      return api('/plugins')
    },

    /** Fetch marketplace plugins (proxied from registry, with installed flag) */
    async getMarketplace(): Promise<{
      plugins: import('../types').MarketplacePlugin[]
      categories: import('../types').MarketplaceCategory[]
    }> {
      return api('/plugins/marketplace')
    },

    /** Enable a plugin via hot-load */
    async enablePlugin(name: string): Promise<void> {
      await api(`/plugins/${encodeURIComponent(name)}/enable`, { method: 'POST' })
    },

    /** Disable a plugin via hot-unload */
    async disablePlugin(name: string): Promise<void> {
      await api(`/plugins/${encodeURIComponent(name)}/disable`, { method: 'POST' })
    },

    /** Uninstall a plugin (remove from registry + unload) */
    async uninstallPlugin(name: string): Promise<void> {
      await api(`/plugins/${encodeURIComponent(name)}`, { method: 'DELETE' })
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

export type ApiClient = ReturnType<typeof createApiClient>
