export interface Session {
  id: string
  name: string
  agent: string
  status: "initializing" | "active" | "finished" | "cancelled" | "error"
  workspace: string
  createdAt: string
  lastActiveAt?: string | null
}

// ── Message Parts ───────────────────────────────────────────────────────────

export interface TextPart {
  id: string
  type: "text"
  content: string
}

export interface ThinkingPart {
  id: string
  type: "thinking"
  content: string
}

export interface ToolCallPart {
  id: string
  type: "tool_call"
  toolCallId: string
  name: string
  status: "pending" | "running" | "completed" | "error"
  input?: Record<string, unknown>
  output?: string
  diff?: FileDiff | null
}

export interface FileDiff {
  path: string
  before?: string
  after: string
  additions?: number
  deletions?: number
}

export type MessagePart = TextPart | ThinkingPart | ToolCallPart

// ── Messages ────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  role: "user" | "assistant"
  sessionID: string
  parentID?: string
  parts: MessagePart[]
  createdAt: number
}

// ── Agents ──────────────────────────────────────────────────────────────────

export interface Agent {
  name: string
  displayName?: string
  description?: string
}

export interface ServerInfo {
  url: string
  token: string
}

export interface TokenInfo {
  accessToken: string
  tokenId: string
  expiresAt: string
  refreshDeadline: string
}

export interface StoredToken {
  id: string
  name: string
  role: string
  scopes?: string[]
  createdAt: string
  refreshDeadline: string
  lastUsedAt?: string
  revoked: boolean
}

export interface AuthInfo {
  type: "secret" | "jwt"
  tokenId?: string
  role: string
  scopes: string[]
}

// ── Server Commands ─────────────────────────────────────────────────────────

export interface ServerCommand {
  name: string
  description: string
  usage: string
  category: string
}

// ── Session History (from server) ───────────────────────────────────────────

export interface SessionHistory {
  version: number
  sessionId: string
  turns: HistoryTurn[]
}

export interface HistoryTurn {
  index: number
  role: "user" | "assistant"
  timestamp: string
  content?: string
  steps?: HistoryStep[]
  usage?: { tokensUsed?: number; contextSize?: number; cost?: unknown }
  stopReason?: string
}

export type HistoryStep =
  | { type: "thinking"; content: string }
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; status: string; input?: unknown; output?: unknown; kind?: string }
  | { type: "plan"; entries: unknown[] }
  | { type: "mode_change"; modeId: string }
  | { type: "config_change"; configId: string; value: string }
  | { type: string; [key: string]: unknown }

// ── SSE Events ──────────────────────────────────────────────────────────────

export interface AgentEvent {
  sessionId: string
  event: AgentEventPayload
}

export type AgentEventPayload =
  | { type: "text"; content: string; messageId?: string; partId?: string }
  | { type: "thought"; content: string; messageId?: string; partId?: string }
  | {
      type: "tool_call"
      id: string
      name: string
      kind?: string
      status: string
      content?: unknown
      rawInput?: Record<string, unknown>
      rawOutput?: string
      meta?: Record<string, unknown>
    }
  | {
      type: "tool_update"
      id: string
      name?: string
      kind?: string
      status: string
      content?: unknown
      rawInput?: Record<string, unknown>
      rawOutput?: string
      meta?: Record<string, unknown>
    }
  | { type: "usage"; tokensUsed?: number; contextSize?: number; cost?: number }
  | { type: "error"; content: string; messageId?: string }
  | { type: "commands_update"; [key: string]: unknown }
  | { type: "plan"; entries?: unknown[] }
  | { type: "resource_link"; uri: string; name?: string; [key: string]: unknown }
