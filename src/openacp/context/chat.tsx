import { createContext, useContext, onCleanup, onMount, type ParentProps } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useWorkspace } from "./workspace"
import { useSessions } from "./sessions"
import { createSSEManager } from "../api/sse"
import { cacheMessages, loadCachedMessages } from "../api/history-cache"
import type {
  AgentEvent, Message, MessagePart, TextPart, ThinkingPart, ToolCallPart,
  SessionHistory, HistoryTurn, HistoryStep,
} from "../types"

interface ChatContext {
  /** Messages for active session */
  messages: () => Message[]
  /** Is assistant currently streaming */
  streaming: () => boolean
  /** Is history loading */
  loadingHistory: () => boolean
  /** Active session ID */
  activeSession: () => string | undefined
  /** Set active session */
  setActiveSession: (id: string) => void
  /** Send a prompt */
  sendPrompt: (text: string) => Promise<boolean>
  /** Abort current response */
  abort: () => void
  /** Connect SSE for workspace */
  connect: () => void
  /** Add a command message to chat */
  addCommandResponse: (sessionID: string, text: string, role?: "user" | "assistant") => void
}

const Ctx = createContext<ChatContext>()

export function useChat() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useChat must be used within ChatProvider")
  return ctx
}

// ── History → Message conversion ────────────────────────────────────────────

let idCounter = 0
function uid(prefix: string) { return `${prefix}-${++idCounter}` }

function historyToMessages(history: SessionHistory): Message[] {
  const messages: Message[] = []
  for (const turn of history.turns) {
    messages.push(turnToMessage(turn, history.sessionId))
  }
  return messages
}

function turnToMessage(turn: HistoryTurn, sessionId: string): Message {
  const id = uid(turn.role === "user" ? "hist-usr" : "hist-ast")
  const parts: MessagePart[] = []

  if (turn.role === "user") {
    if (turn.content) {
      parts.push({ id: uid("p"), type: "text", content: turn.content })
    }
  } else if (turn.steps) {
    for (const step of turn.steps) {
      const part = stepToPart(step)
      if (part) parts.push(part)
    }
  }

  return {
    id,
    role: turn.role,
    sessionID: sessionId,
    parts,
    createdAt: new Date(turn.timestamp).getTime(),
  }
}

function stepToPart(step: HistoryStep): MessagePart | null {
  switch (step.type) {
    case "text":
      return { id: uid("p"), type: "text", content: step.content as string }
    case "thinking":
      return { id: uid("p"), type: "thinking", content: step.content as string }
    case "tool_call":
      return {
        id: uid("p"),
        type: "tool_call",
        toolCallId: step.id as string,
        name: step.name as string,
        status: (step.status as ToolCallPart["status"]) || "completed",
        input: step.input as Record<string, unknown> | undefined,
        output: typeof step.output === "string" ? step.output : step.output ? JSON.stringify(step.output) : undefined,
      }
    default:
      return null
  }
}

// ── Chat Provider ───────────────────────────────────────────────────────────

export function ChatProvider(props: ParentProps) {
  const workspace = useWorkspace()
  const sessions = useSessions()
  const sse = createSSEManager()

  const [store, setStore] = createStore({
    messagesBySession: {} as Record<string, Message[]>,
    activeSession: undefined as string | undefined,
    streaming: false,
    loadingHistory: false,
  })

  const abortedSessions = new Set<string>()
  const assistantMsgId = new Map<string, string>()
  const loadedSessions = new Set<string>()
  let msgCounter = 0
  let partCounter = 0

  function nextId(prefix: string) {
    return `${prefix}-${Date.now()}-${++msgCounter}`
  }

  function nextPartId() {
    return `part-${Date.now()}-${++partCounter}`
  }

  function addMessage(sessionID: string, msg: Message) {
    setStore("messagesBySession", sessionID, (prev) => [...(prev || []), msg])
  }

  function setMessages(sessionID: string, msgs: Message[]) {
    setStore("messagesBySession", sessionID, msgs)
  }

  function updateAssistantParts(sessionID: string, updater: (parts: MessagePart[]) => void) {
    const msgId = assistantMsgId.get(sessionID)
    if (!msgId) return
    setStore("messagesBySession", sessionID, produce((msgs) => {
      if (!msgs) return
      const msg = msgs.find((m) => m.id === msgId)
      if (msg) updater(msg.parts)
    }))
  }

  function ensureAssistantMessage(sessionID: string, parentId?: string): string {
    let msgId = assistantMsgId.get(sessionID)
    if (msgId) return msgId

    msgId = nextId("ast")
    assistantMsgId.set(sessionID, msgId)
    addMessage(sessionID, {
      id: msgId,
      role: "assistant",
      sessionID,
      parts: [],
      createdAt: Date.now(),
      parentID: parentId,
    })
    setStore("streaming", true)
    return msgId
  }

  function findToolPart(parts: MessagePart[], toolCallId: string): ToolCallPart | undefined {
    return parts.find((p) => p.type === "tool_call" && p.toolCallId === toolCallId) as ToolCallPart | undefined
  }

  // ── History loading ─────────────────────────────────────────────────────

  async function loadHistory(sessionID: string) {
    const hasInMemory = (store.messagesBySession[sessionID]?.length ?? 0) > 0

    // 1. Show something immediately: in-memory > cache
    if (!hasInMemory) {
      const cached = await loadCachedMessages(sessionID)
      if (cached && cached.length > 0) {
        setMessages(sessionID, cached)
      }
    }

    // 2. Always fetch server for latest (other clients may have added messages)
    setStore("loadingHistory", true)
    try {
      const history = await workspace.client.getSessionHistory(sessionID)
      if (history && history.turns.length > 0) {
        const serverMessages = historyToMessages(history)
        const current = store.messagesBySession[sessionID] ?? []

        // Server has more complete history — use it as base,
        // but keep any in-flight streaming messages (not yet in server history)
        const lastServerTurn = history.turns[history.turns.length - 1]
        const lastServerTime = new Date(lastServerTurn.timestamp).getTime()

        // Messages created after the last server turn = in-flight (streaming)
        const inFlight = current.filter((m) => m.createdAt > lastServerTime + 1000)

        setMessages(sessionID, [...serverMessages, ...inFlight])
        void cacheMessages(sessionID, serverMessages)
      }
    } catch {
      // Server unavailable — showing cache/in-memory data
    } finally {
      setStore("loadingHistory", false)
    }
  }

  // ── Text batching — accumulate chunks, flush once per frame ────────────

  const textBuffer = new Map<string, string>() // sessionID → pending text
  const thoughtBuffer = new Map<string, string>()
  let flushScheduled = false

  function scheduleFlush() {
    if (flushScheduled) return
    flushScheduled = true
    requestAnimationFrame(flushBuffers)
  }

  function flushBuffers() {
    flushScheduled = false

    for (const [sessionID, text] of textBuffer) {
      ensureAssistantMessage(sessionID)
      updateAssistantParts(sessionID, (parts) => {
        const last = parts[parts.length - 1]
        if (last?.type === "text") {
          last.content += text
        } else {
          parts.push({ id: nextPartId(), type: "text", content: text })
        }
      })
    }
    textBuffer.clear()

    for (const [sessionID, text] of thoughtBuffer) {
      ensureAssistantMessage(sessionID)
      updateAssistantParts(sessionID, (parts) => {
        const existing = [...parts].reverse().find((p): p is ThinkingPart => p.type === "thinking")
        if (existing) {
          existing.content += text
        } else {
          parts.push({ id: nextPartId(), type: "thinking", content: text })
        }
      })
    }
    thoughtBuffer.clear()
  }

  // ── SSE event handling ──────────────────────────────────────────────────

  function handleAgentEvent(event: AgentEvent) {
    const sessionID = event.sessionId
    if (!sessionID) return
    if (abortedSessions.has(sessionID)) return

    const evt = event.event

    switch (evt.type) {
      case "text": {
        ensureAssistantMessage(sessionID)
        textBuffer.set(sessionID, (textBuffer.get(sessionID) ?? "") + evt.content)
        scheduleFlush()
        break
      }

      case "thought": {
        ensureAssistantMessage(sessionID)
        thoughtBuffer.set(sessionID, (thoughtBuffer.get(sessionID) ?? "") + evt.content)
        scheduleFlush()
        break
      }

      case "tool_call": {
        ensureAssistantMessage(sessionID)
        updateAssistantParts(sessionID, (parts) => {
          const existing = findToolPart(parts, evt.id)
          if (existing) {
            existing.name = evt.name
            existing.status = evt.status as ToolCallPart["status"]
            if (evt.rawInput) existing.input = evt.rawInput
            if (evt.rawOutput) existing.output = evt.rawOutput
          } else {
            parts.push({
              id: nextPartId(),
              type: "tool_call",
              toolCallId: evt.id,
              name: evt.name,
              status: evt.status as ToolCallPart["status"],
              input: evt.rawInput,
              output: evt.rawOutput,
            })
          }
        })
        break
      }

      case "tool_update": {
        ensureAssistantMessage(sessionID)
        updateAssistantParts(sessionID, (parts) => {
          const existing = findToolPart(parts, evt.id)
          if (existing) {
            if (evt.status) existing.status = evt.status as ToolCallPart["status"]
            if (evt.rawInput) existing.input = evt.rawInput
            if (evt.rawOutput != null) existing.output = evt.rawOutput
            if (evt.name) existing.name = evt.name
          }
        })
        break
      }

      case "error": {
        flushBuffers() // flush pending text before error
        ensureAssistantMessage(sessionID)
        updateAssistantParts(sessionID, (parts) => {
          parts.push({ id: nextPartId(), type: "text", content: `\n\n**Error:** ${evt.content}` })
        })
        assistantMsgId.delete(sessionID)
        setStore("streaming", false)
        break
      }

      case "usage": {
        flushBuffers() // flush any remaining text
        assistantMsgId.delete(sessionID)
        setStore("streaming", false)
        void sessions.refresh()
        // Cache messages after turn complete
        const msgs = store.messagesBySession[sessionID]
        if (msgs) void cacheMessages(sessionID, msgs)
        break
      }
    }
  }

  function connect() {
    sse.connect(workspace.directory, workspace.client.eventsUrl, {
      onAgentEvent: handleAgentEvent,
      onSessionCreated: (s) => sessions.upsert(s),
      onSessionUpdated: (s) => sessions.upsert(s),
      onSessionDeleted: (id) => sessions.delete(id),
      onConnected: () => {},
      onDisconnected: () => {},
    })
  }

  let sending = false
  async function sendPrompt(text: string): Promise<boolean> {
    if (sending) return false
    sending = true
    try {
      return await doSendPrompt(text)
    } finally {
      sending = false
    }
  }

  async function doSendPrompt(text: string): Promise<boolean> {
    let sessionID = store.activeSession
    if (!sessionID) {
      const session = await sessions.create()
      if (!session) return false
      sessionID = session.id
      setStore("activeSession", sessionID)
    }

    const userMsgId = nextId("usr")
    addMessage(sessionID, {
      id: userMsgId,
      role: "user",
      sessionID,
      parts: [{ id: nextPartId(), type: "text", content: text }],
      createdAt: Date.now(),
    })

    const astMsgId = nextId("ast")
    assistantMsgId.set(sessionID, astMsgId)
    addMessage(sessionID, {
      id: astMsgId,
      role: "assistant",
      sessionID,
      parts: [],
      createdAt: Date.now(),
      parentID: userMsgId,
    })
    setStore("streaming", true)

    connect()

    try {
      await workspace.client.sendPrompt(sessionID, text)
      return true
    } catch {
      return false
    }
  }

  function addCommandResponse(sessionID: string, text: string, role: "user" | "assistant" = "assistant") {
    addMessage(sessionID, {
      id: nextId(role === "user" ? "cmd-usr" : "cmd-ast"),
      role,
      sessionID,
      parts: [{ id: nextPartId(), type: "text", content: text }],
      createdAt: Date.now(),
    })
  }

  function setActiveSession(id: string) {
    setStore("activeSession", id)
    void loadHistory(id)
  }

  onMount(() => connect())
  onCleanup(() => sse.disconnectAll())

  function abort() {
    const sessionID = store.activeSession
    if (!sessionID) return
    abortedSessions.add(sessionID)
    assistantMsgId.delete(sessionID)
    setStore("streaming", false)
    setTimeout(() => abortedSessions.delete(sessionID), 2000)
  }

  const value: ChatContext = {
    messages: () => store.messagesBySession[store.activeSession || ""] || [],
    streaming: () => store.streaming,
    loadingHistory: () => store.loadingHistory,
    activeSession: () => store.activeSession,
    setActiveSession,
    sendPrompt,
    abort,
    connect,
    addCommandResponse,
  }

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
