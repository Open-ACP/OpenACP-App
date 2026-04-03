import { createContext, useContext, useEffect, useCallback, useRef, type ReactNode } from "react"
import { useImmer } from "use-immer"
import { useWorkspace } from "./workspace"
import { useSessions } from "./sessions"
import { createSSEManager } from "../api/sse"
import { cacheMessages, loadCachedMessages } from "../api/history-cache"
import type {
  AgentEvent, Message, MessagePart, MessageBlock, TextPart, ThinkingPart, ToolCallPart, FileDiff,
  TextBlock, ThinkingBlock, ToolBlock, PlanBlock, ErrorBlock, PlanEntry,
  SessionHistory, HistoryTurn, HistoryStep,
} from "../types"
import {
  resolveKind, buildTitle, extractDescription, extractCommand, isNoiseTool, validatePlanEntries,
} from "../components/chat/block-utils"

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

const Ctx = createContext<ChatContext | undefined>(undefined)

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

function stepToBlock(step: HistoryStep): MessageBlock | null {
  switch (step.type) {
    case "text":
      return { type: "text", id: uid("b"), content: step.content as string }
    case "thinking":
      return { type: "thinking", id: uid("b"), content: step.content as string, durationMs: null, isStreaming: false }
    case "tool_call": {
      const s = step as any
      const kind = resolveKind(s.name ?? "", s.kind)
      const input = (s.input as Record<string, unknown> | null) ?? null
      const title = buildTitle(s.name ?? "", kind, input)
      return {
        type: "tool", id: s.id ?? uid("b"), name: s.name ?? "", kind,
        status: (s.status as ToolBlock["status"]) || "completed",
        title, description: extractDescription(input, title),
        command: extractCommand(kind, input), input,
        output: typeof s.output === "string" ? s.output : s.output ? JSON.stringify(s.output) : null,
        diffStats: null, isNoise: isNoiseTool(s.name ?? ""), isHidden: false,
      }
    }
    case "plan": {
      const entries = validatePlanEntries((step as any).entries ?? [])
      if (entries.length === 0) return null
      return { type: "plan", id: uid("b"), entries }
    }
    default:
      return null
  }
}

function turnToMessage(turn: HistoryTurn, sessionId: string): Message {
  const id = uid(turn.role === "user" ? "hist-usr" : "hist-ast")
  const parts: MessagePart[] = []
  const blocks: MessageBlock[] = []

  if (turn.role === "user") {
    if (turn.content) {
      parts.push({ id: uid("p"), type: "text", content: turn.content })
      blocks.push({ type: "text", id: uid("b"), content: turn.content })
    }
  } else if (turn.steps) {
    for (const step of turn.steps) {
      const part = stepToPart(step)
      if (part) parts.push(part)
      const block = stepToBlock(step)
      if (block) blocks.push(block)
    }
  }

  return {
    id,
    role: turn.role,
    sessionID: sessionId,
    parts,
    blocks,
    createdAt: new Date(turn.timestamp).getTime(),
  }
}

function stepToPart(step: HistoryStep): MessagePart | null {
  switch (step.type) {
    case "text":
      return { id: uid("p"), type: "text", content: step.content as string }
    case "thinking":
      return { id: uid("p"), type: "thinking", content: step.content as string }
    case "tool_call": {
      const s = step as any
      const diff: FileDiff | null = s.diff ? { path: s.diff.path || "", before: s.diff.oldText, after: s.diff.newText } : null
      return {
        id: uid("p"),
        type: "tool_call",
        toolCallId: step.id as string,
        name: step.name as string,
        status: (step.status as ToolCallPart["status"]) || "completed",
        input: step.input as Record<string, unknown> | undefined,
        output: typeof step.output === "string" ? step.output : step.output ? JSON.stringify(step.output) : undefined,
        diff,
      }
    }
    default:
      return null
  }
}

// ── Diff extraction from tool events ──────────────────────────────────

function extractDiff(evt: { meta?: Record<string, unknown>; rawInput?: Record<string, unknown>; rawOutput?: unknown; content?: unknown; name?: string }): FileDiff | null {
  // Try meta.filediff first (server-provided)
  const meta = evt.meta as Record<string, any> | undefined
  if (meta?.filediff) {
    const fd = meta.filediff
    return { path: fd.path || "", before: fd.before ?? fd.oldText, after: fd.after ?? fd.newText }
  }

  // Check content array for diff objects (from tool_call_update after edit)
  if (Array.isArray(evt.content)) {
    for (const item of evt.content) {
      if (item && typeof item === "object" && (item as any).type === "diff") {
        const d = item as any
        return { path: d.path || "", before: d.oldText ?? undefined, after: d.newText ?? "" }
      }
    }
  }

  // Parse input — try rawInput then content object
  let input: Record<string, any> | undefined
  for (const src of [evt.rawInput, evt.content]) {
    if (!src || Array.isArray(src)) continue
    if (typeof src === "string") {
      try { input = JSON.parse(src) } catch { /* ignore */ }
    } else if (typeof src === "object") {
      const obj = src as Record<string, any>
      if (obj.input && typeof obj.input === "object") {
        input = obj.input as Record<string, any>
      } else if (obj.file_path || obj.filePath || obj.old_string || obj.content) {
        input = obj
      }
    }
    if (input && Object.keys(input).length > 0) break
  }
  if (!input) return null

  const name = (evt.name || "").toLowerCase()
  const path = (input.file_path || input.filePath || input.path || "") as string

  // Edit tool: old_string + new_string
  if (name === "edit" && (input.old_string != null || input.new_string != null)) {
    return { path, before: input.old_string != null ? String(input.old_string) : undefined, after: String(input.new_string ?? input.content ?? "") }
  }

  // Write tool: content only
  if (name === "write" && input.content != null) {
    return { path, after: String(input.content) }
  }

  // apply_patch
  if (name === "apply_patch" && input.patch != null) {
    return { path: input.file_path || input.path || "patch", after: String(input.patch) }
  }

  return null
}

// ── Chat Provider ───────────────────────────────────────────────────────────

export function ChatProvider(props: { children: ReactNode }) {
  const workspace = useWorkspace()
  const sessions = useSessions()
  const sseRef = useRef(createSSEManager())

  const [store, updateStore] = useImmer({
    messagesBySession: {} as Record<string, Message[]>,
    activeSession: undefined as string | undefined,
    streaming: false,
    loadingHistory: false,
  })

  // Use ref so the store snapshot is always current in callbacks
  const storeRef = useRef(store)
  storeRef.current = store

  const abortedSessions = useRef(new Set<string>())
  const assistantMsgId = useRef(new Map<string, string>())
  const loadedSessions = useRef(new Set<string>())
  const thinkingStartTime = useRef(new Map<string, number>())
  const msgCounter = useRef(0)
  const partCounter = useRef(0)
  const sendingRef = useRef(false)

  // Text batching refs
  const textBuffer = useRef(new Map<string, string>())
  const thoughtBuffer = useRef(new Map<string, string>())
  const flushScheduledRef = useRef(false)

  function nextId(prefix: string) {
    return `${prefix}-${Date.now()}-${++msgCounter.current}`
  }

  function nextPartId() {
    return `part-${Date.now()}-${++partCounter.current}`
  }

  function addMessage(sessionID: string, msg: Message) {
    updateStore(draft => {
      if (!draft.messagesBySession[sessionID]) draft.messagesBySession[sessionID] = []
      draft.messagesBySession[sessionID].push(msg)
    })
  }

  function setMessages(sessionID: string, msgs: Message[]) {
    updateStore(draft => {
      draft.messagesBySession[sessionID] = msgs
    })
  }

  function updateAssistantParts(sessionID: string, updater: (parts: MessagePart[]) => void) {
    const msgId = assistantMsgId.current.get(sessionID)
    if (!msgId) return
    updateStore(draft => {
      const msgs = draft.messagesBySession[sessionID]
      if (!msgs) return
      const msg = msgs.find((m) => m.id === msgId)
      if (msg) updater(msg.parts)
    })
  }

  function updateAssistantBlocks(sessionID: string, updater: (blocks: MessageBlock[]) => void) {
    const msgId = assistantMsgId.current.get(sessionID)
    if (!msgId) return
    updateStore(draft => {
      const msgs = draft.messagesBySession[sessionID]
      if (!msgs) return
      const msg = msgs.find((m) => m.id === msgId)
      if (msg) updater(msg.blocks)
    })
  }

  function ensureAssistantMessage(sessionID: string, parentId?: string): string {
    let msgId = assistantMsgId.current.get(sessionID)
    if (msgId) return msgId

    msgId = nextId("ast")
    assistantMsgId.current.set(sessionID, msgId)
    addMessage(sessionID, {
      id: msgId,
      role: "assistant",
      sessionID,
      parts: [],
      blocks: [],
      createdAt: Date.now(),
      parentID: parentId,
    })
    updateStore(draft => { draft.streaming = true })
    return msgId
  }

  function findToolPart(parts: MessagePart[], toolCallId: string): ToolCallPart | undefined {
    return parts.find((p) => p.type === "tool_call" && p.toolCallId === toolCallId) as ToolCallPart | undefined
  }

  // ── History loading ─────────────────────────────────────────────────────

  async function loadHistory(sessionID: string) {
    const hasInMemory = (storeRef.current.messagesBySession[sessionID]?.length ?? 0) > 0

    // 1. Show something immediately: in-memory > cache
    if (!hasInMemory) {
      const cached = await loadCachedMessages(sessionID)
      if (cached && cached.length > 0) {
        setMessages(sessionID, cached)
      }
    }

    // 2. Always fetch server for latest (other clients may have added messages)
    updateStore(draft => { draft.loadingHistory = true })
    try {
      const history = await workspace.client.getSessionHistory(sessionID)
      if (history && history.turns.length > 0) {
        const serverMessages = historyToMessages(history)
        const current = storeRef.current.messagesBySession[sessionID] ?? []

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
      updateStore(draft => { draft.loadingHistory = false })
    }
  }

  // ── Text batching — accumulate chunks, flush once per frame ────────────

  function scheduleFlush() {
    if (flushScheduledRef.current) return
    flushScheduledRef.current = true
    requestAnimationFrame(flushBuffers)
  }

  function flushBuffers() {
    flushScheduledRef.current = false

    for (const [sessionID, text] of textBuffer.current) {
      ensureAssistantMessage(sessionID)

      // Seal thinking blocks when text arrives
      const thinkStart = thinkingStartTime.current.get(sessionID)
      if (thinkStart) {
        const durationMs = Date.now() - thinkStart
        thinkingStartTime.current.delete(sessionID)
        updateAssistantBlocks(sessionID, (blocks) => {
          const thinking = [...blocks].reverse().find((b): b is ThinkingBlock => b.type === "thinking" && b.isStreaming)
          if (thinking) {
            thinking.isStreaming = false
            thinking.durationMs = durationMs
          }
        })
      }

      updateAssistantParts(sessionID, (parts) => {
        const last = parts[parts.length - 1]
        if (last?.type === "text") {
          last.content += text
        } else {
          parts.push({ id: nextPartId(), type: "text", content: text })
        }
      })
      updateAssistantBlocks(sessionID, (blocks) => {
        const last = blocks[blocks.length - 1]
        if (last?.type === "text") {
          (last as TextBlock).content += text
        } else {
          blocks.push({ type: "text", id: nextPartId(), content: text })
        }
      })
    }
    textBuffer.current.clear()

    for (const [sessionID, text] of thoughtBuffer.current) {
      ensureAssistantMessage(sessionID)
      updateAssistantParts(sessionID, (parts) => {
        const existing = [...parts].reverse().find((p): p is ThinkingPart => p.type === "thinking")
        if (existing) {
          existing.content += text
        } else {
          parts.push({ id: nextPartId(), type: "thinking", content: text })
        }
      })
      updateAssistantBlocks(sessionID, (blocks) => {
        const existing = [...blocks].reverse().find((b): b is ThinkingBlock => b.type === "thinking" && b.isStreaming)
        if (existing) {
          existing.content += text
        } else {
          if (!thinkingStartTime.current.has(sessionID)) {
            thinkingStartTime.current.set(sessionID, Date.now())
          }
          blocks.push({ type: "thinking", id: nextPartId(), content: text, durationMs: null, isStreaming: true })
        }
      })
    }
    thoughtBuffer.current.clear()
  }

  // ── SSE event handling ──────────────────────────────────────────────────

  function handleAgentEvent(event: AgentEvent) {
    const sessionID = event.sessionId
    if (!sessionID) return
    if (abortedSessions.current.has(sessionID)) return

    const evt = event.event

    switch (evt.type) {
      case "text": {
        ensureAssistantMessage(sessionID)
        textBuffer.current.set(sessionID, (textBuffer.current.get(sessionID) ?? "") + evt.content)
        scheduleFlush()
        break
      }

      case "thought": {
        ensureAssistantMessage(sessionID)
        if (!thinkingStartTime.current.has(sessionID)) {
          thinkingStartTime.current.set(sessionID, Date.now())
        }
        thoughtBuffer.current.set(sessionID, (thoughtBuffer.current.get(sessionID) ?? "") + evt.content)
        scheduleFlush()
        break
      }

      case "tool_call": {
        ensureAssistantMessage(sessionID)
        const diff = extractDiff(evt)
        updateAssistantParts(sessionID, (parts) => {
          const existing = findToolPart(parts, evt.id)
          if (existing) {
            existing.name = evt.name
            existing.status = evt.status as ToolCallPart["status"]
            if (evt.rawInput) existing.input = evt.rawInput
            if (evt.rawOutput) existing.output = evt.rawOutput
            if (diff) existing.diff = diff
          } else {
            parts.push({
              id: nextPartId(),
              type: "tool_call",
              toolCallId: evt.id,
              name: evt.name,
              status: evt.status as ToolCallPart["status"],
              input: evt.rawInput,
              output: evt.rawOutput,
              diff,
            })
          }
        })
        updateAssistantBlocks(sessionID, (blocks) => {
          const kind = resolveKind(evt.name, evt.kind, evt.displayKind)
          const input = evt.rawInput ?? null
          const title = buildTitle(evt.name, kind, input, evt.displayTitle, evt.displaySummary)
          const existing = blocks.find((b): b is ToolBlock => b.type === "tool" && b.id === evt.id)
          const outputStr = evt.rawOutput != null
            ? (typeof evt.rawOutput === "string" ? evt.rawOutput : JSON.stringify(evt.rawOutput, null, 2))
            : null
          if (existing) {
            existing.name = evt.name
            existing.status = evt.status as ToolBlock["status"]
            existing.kind = kind
            existing.title = title
            if (input) existing.input = input
            if (outputStr != null) existing.output = outputStr
          } else {
            blocks.push({
              type: "tool",
              id: evt.id,
              name: evt.name,
              kind,
              status: (evt.status as ToolBlock["status"]) || "running",
              title,
              description: extractDescription(input, title),
              command: extractCommand(kind, input),
              input,
              output: outputStr,
              diffStats: null,
              isNoise: isNoiseTool(evt.name, evt.isNoise),
              isHidden: false,
            })
          }
        })
        break
      }

      case "tool_update": {
        ensureAssistantMessage(sessionID)
        const diff = extractDiff(evt)
        updateAssistantParts(sessionID, (parts) => {
          const existing = findToolPart(parts, evt.id)
          if (existing) {
            if (evt.status) existing.status = evt.status as ToolCallPart["status"]
            if (evt.rawInput) existing.input = evt.rawInput
            if (evt.rawOutput != null) existing.output = evt.rawOutput
            if (evt.name) existing.name = evt.name
            if (diff) existing.diff = diff
          }
        })
        updateAssistantBlocks(sessionID, (blocks) => {
          const existing = blocks.find((b): b is ToolBlock => b.type === "tool" && b.id === evt.id)
          if (existing) {
            if (evt.status) existing.status = evt.status as ToolBlock["status"]
            if (evt.rawInput) existing.input = evt.rawInput
            if (evt.rawOutput != null) {
              existing.output = typeof evt.rawOutput === "string" ? evt.rawOutput : JSON.stringify(evt.rawOutput, null, 2)
            }
            if (evt.name) existing.name = evt.name
            if (evt.displayTitle) existing.title = evt.displayTitle
            if (evt.displayKind) existing.kind = evt.displayKind
            // Extract diffStats from meta
            const meta = evt.meta as Record<string, any> | undefined
            if (meta?.diffStats) {
              existing.diffStats = meta.diffStats as { added: number; removed: number }
            }
          }
        })
        break
      }

      case "plan": {
        ensureAssistantMessage(sessionID)
        if (evt.entries && Array.isArray(evt.entries)) {
          const entries = validatePlanEntries(evt.entries)
          updateAssistantBlocks(sessionID, (blocks) => {
            const existing = blocks.find((b): b is PlanBlock => b.type === "plan")
            if (existing) {
              existing.entries = entries
            } else {
              blocks.push({ type: "plan", id: nextPartId(), entries })
            }
          })
        }
        break
      }

      case "error": {
        flushBuffers() // flush pending text before error
        ensureAssistantMessage(sessionID)
        updateAssistantParts(sessionID, (parts) => {
          parts.push({ id: nextPartId(), type: "text", content: `\n\n**Error:** ${evt.content}` })
        })
        updateAssistantBlocks(sessionID, (blocks) => {
          blocks.push({ type: "error", id: nextPartId(), content: evt.content })
        })
        assistantMsgId.current.delete(sessionID)
        updateStore(draft => { draft.streaming = false })
        break
      }

      case "usage": {
        flushBuffers() // flush any remaining text
        // Seal any active thinking
        const thinkStart2 = thinkingStartTime.current.get(sessionID)
        if (thinkStart2) {
          const durationMs = Date.now() - thinkStart2
          thinkingStartTime.current.delete(sessionID)
          updateAssistantBlocks(sessionID, (blocks) => {
            const thinking = [...blocks].reverse().find((b): b is ThinkingBlock => b.type === "thinking" && b.isStreaming)
            if (thinking) {
              thinking.isStreaming = false
              thinking.durationMs = durationMs
            }
          })
        }
        assistantMsgId.current.delete(sessionID)
        updateStore(draft => { draft.streaming = false })
        void sessions.refresh()
        // Cache messages after turn complete
        const msgs = storeRef.current.messagesBySession[sessionID]
        if (msgs) void cacheMessages(sessionID, msgs)
        break
      }
    }
  }

  function connect() {
    sseRef.current.connect(workspace.directory, workspace.client.eventsUrl, {
      onAgentEvent: handleAgentEvent,
      onSessionCreated: (s) => sessions.upsert(s),
      onSessionUpdated: (s) => sessions.upsert(s),
      onSessionDeleted: (id) => sessions.delete(id),
      onConnected: () => {},
      onDisconnected: () => {},
    })
  }

  async function sendPrompt(text: string): Promise<boolean> {
    if (sendingRef.current) return false
    sendingRef.current = true
    try {
      return await doSendPrompt(text)
    } finally {
      sendingRef.current = false
    }
  }

  async function doSendPrompt(text: string): Promise<boolean> {
    let sessionID = storeRef.current.activeSession
    if (!sessionID) {
      const session = await sessions.create()
      if (!session) return false
      sessionID = session.id
      updateStore(draft => { draft.activeSession = sessionID })
    }

    const userMsgId = nextId("usr")
    addMessage(sessionID, {
      id: userMsgId,
      role: "user",
      sessionID,
      parts: [{ id: nextPartId(), type: "text", content: text }],
      blocks: [{ type: "text", id: nextPartId(), content: text }],
      createdAt: Date.now(),
    })

    const astMsgId = nextId("ast")
    assistantMsgId.current.set(sessionID, astMsgId)
    addMessage(sessionID, {
      id: astMsgId,
      role: "assistant",
      sessionID,
      parts: [],
      blocks: [],
      createdAt: Date.now(),
      parentID: userMsgId,
    })
    updateStore(draft => { draft.streaming = true })

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
      blocks: [{ type: "text", id: nextPartId(), content: text }],
      createdAt: Date.now(),
    })
  }

  function setActiveSession(id: string) {
    updateStore(draft => { draft.activeSession = id })
    void loadHistory(id)
  }

  function abort() {
    const sessionID = storeRef.current.activeSession
    if (!sessionID) return
    abortedSessions.current.add(sessionID)
    assistantMsgId.current.delete(sessionID)
    updateStore(draft => { draft.streaming = false })
    setTimeout(() => abortedSessions.current.delete(sessionID), 2000)
  }

  useEffect(() => {
    connect()
    return () => {
      sseRef.current.disconnectAll()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const value: ChatContext = {
    messages: () => storeRef.current.messagesBySession[storeRef.current.activeSession || ""] || [],
    streaming: () => storeRef.current.streaming,
    loadingHistory: () => storeRef.current.loadingHistory,
    activeSession: () => storeRef.current.activeSession,
    setActiveSession,
    sendPrompt,
    abort,
    connect,
    addCommandResponse,
  }

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
