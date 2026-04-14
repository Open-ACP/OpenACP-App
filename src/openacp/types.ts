export interface Session {
  id: string
  name: string
  agent: string
  status: "initializing" | "active" | "finished" | "cancelled" | "error"
  workspace: string
  channelId: string
  createdAt: string
  lastActiveAt?: string | null
  dangerousMode: boolean
  queueDepth: number
  promptRunning: boolean
  capabilities: unknown | null
  configOptions?: unknown[]
  isLive: boolean
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

// ── Message Blocks (new) ───────────────────────────────────────────────────

export interface TextBlock {
  type: "text"
  id: string
  content: string
}

export interface ThinkingBlock {
  type: "thinking"
  id: string
  content: string
  durationMs: number | null
  isStreaming: boolean
}

export interface ToolBlock {
  type: "tool"
  id: string
  name: string
  kind: string
  status: "pending" | "running" | "completed" | "error"
  title: string
  description: string | null
  command: string | null
  input: Record<string, unknown> | null
  output: string | null
  diffStats: { added: number; removed: number } | null
  diff?: FileDiff | null
  isNoise: boolean
  isHidden: boolean
}

export interface PlanEntry {
  content: string
  status: "pending" | "in_progress" | "completed"
}

export interface PlanBlock {
  type: "plan"
  id: string
  entries: PlanEntry[]
}

export interface ErrorBlock {
  type: "error"
  id: string
  content: string
}

export type MessageBlock = TextBlock | ThinkingBlock | ToolBlock | PlanBlock | ErrorBlock

// ── File Attachments ───────────────────────────────────────────────────────

export interface FileAttachment {
  id: string
  fileName: string
  mimeType: string
  dataUrl: string
  size: number
}

// ── Usage Info ──────────────────────────────────────────────────────────────

export interface UsageInfo {
  tokensUsed?: number
  contextSize?: number
  cost?: { amount: number; currency: string } | number
}

// ── Messages ────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  role: "user" | "assistant"
  sessionID: string
  parentID?: string
  parts: MessagePart[]
  blocks: MessageBlock[]
  attachments?: FileAttachment[]
  createdAt: number
  /** Set when message originated from an external adapter (e.g. "telegram", "discord") */
  sourceAdapterId?: string
  /** Token usage and cost info for this assistant response */
  usage?: UsageInfo
  /** Whether the user interrupted/aborted this response */
  interrupted?: boolean
  /** Server turn index — used for cache↔server merge matching */
  turnId?: string
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
  sourceAdapterId?: string
}

export type HistoryStep =
  | { type: "thinking"; content: string }
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; status: string; input?: unknown; output?: unknown; kind?: string; diff?: { path?: string; oldText?: string; newText?: string } | null }
  | { type: "plan"; entries: unknown[] }
  | { type: "mode_change"; modeId: string }
  | { type: "config_change"; configId: string; value: string }
  | { type: string; [key: string]: unknown }

// ── SSE Events ──────────────────────────────────────────────────────────────

export interface AgentEvent {
  sessionId: string
  turnId?: string
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
      displayTitle?: string
      displayKind?: string
      displaySummary?: string
      isNoise?: boolean
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
      displayTitle?: string
      displayKind?: string
      displaySummary?: string
      isNoise?: boolean
    }
  | { type: "usage"; tokensUsed?: number; contextSize?: number; cost?: number }
  | { type: "error"; content: string; messageId?: string }
  | { type: "commands_update"; [key: string]: unknown }
  | { type: "plan"; entries?: unknown[] }
  | { type: "resource_link"; uri: string; name?: string; [key: string]: unknown }

// ── Cross-Adapter Input Events ───────────────────────────────────────────────

export interface TurnSender {
  userId: string
  identityId: string
  displayName?: string
  username?: string
}

export interface MessageQueuedEvent {
  sessionId: string
  turnId: string
  text: string
  sourceAdapterId: string
  attachments?: unknown[]
  timestamp: string
  queueDepth: number
  sender?: TurnSender | null
}

export interface MessageProcessingEvent {
  sessionId: string
  turnId: string
  sourceAdapterId: string
  timestamp: string
  // Optional for backward compat with older Core versions that don't emit these fields
  userPrompt?: string
  finalPrompt?: string
  attachments?: unknown[]
  sender?: TurnSender | null
}

export interface MessageFailedEvent {
  sessionId: string
  turnId: string
  reason: string
}

// ── Permission Request ──────────────────────────────────────────────────────

export interface PermissionOption {
  id: string
  label: string
  isAllow: boolean
}

export interface PermissionRequest {
  id: string
  sessionId: string
  description: string
  options: PermissionOption[]
}

// ─── Plugin types ──────────────────────────────────────────────────────────

export interface InstalledPlugin {
  name: string
  version: string
  description?: string
  source: 'builtin' | 'npm' | 'local'
  enabled: boolean
  loaded: boolean
  failed: boolean
  essential: boolean
  hasConfigure: boolean
}

export interface MarketplacePlugin {
  name: string
  displayName?: string
  description: string
  npm: string
  version: string
  minCliVersion: string
  category: string
  tags: string[]
  icon: string
  author: string
  verified: boolean
  featured: boolean
  installed: boolean
}

export interface MarketplaceCategory {
  id: string
  name: string
  icon: string
}
