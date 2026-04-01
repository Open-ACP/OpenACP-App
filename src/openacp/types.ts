export interface Session {
  id: string
  name: string
  agent: string
  status: "initializing" | "active" | "finished" | "cancelled" | "error"
  workspace: string
  createdAt: string
  lastActiveAt?: string | null
}

export interface Message {
  id: string
  role: "user" | "assistant"
  sessionID: string
  parentID?: string
  content: string
  createdAt: number
}

export interface Part {
  id: string
  type: "text" | "tool-invocation" | "thought"
  messageID: string
  content: string
}

export interface Agent {
  name: string
  displayName?: string
  description?: string
}

export interface ServerInfo {
  url: string
  token: string
}

/** SSE agent:event payload from OpenACP server */
export interface AgentEvent {
  sessionId: string
  event: {
    type: "text" | "usage" | "error" | "tool_call" | "thought" | "commands_update"
    content?: string
    messageId?: string
    partId?: string
    [key: string]: unknown
  }
}
