import React, { createContext, useContext, useEffect, useRef, useCallback, useMemo } from "react"
import { useImmer } from "use-immer"
import { current } from "immer"
import { useWorkspace } from "./workspace"
import { useSessions } from "./sessions"
import { createSSEManager } from "../api/sse"
import { cacheMessages, loadCachedMessages } from "../api/history-cache"
import type {
  AgentEvent, Message, MessagePart, MessageBlock, TextPart, ThinkingPart, ToolCallPart, FileDiff,
  TextBlock, ThinkingBlock, ToolBlock, PlanBlock, ErrorBlock, PlanEntry,
  SessionHistory, HistoryTurn, HistoryStep,
  MessageQueuedEvent, MessageProcessingEvent, PermissionRequest, UsageInfo,
} from "../types"
import {
  resolveKind, buildTitle, extractDescription, extractCommand, isNoiseTool, validatePlanEntries,
} from "../components/chat/block-utils"

interface ChatContext {
  messages: () => Message[]
  streaming: () => boolean
  loadingHistory: () => boolean
  sseStatus: () => 'connected' | 'reconnecting' | 'disconnected'
  activeSession: () => string | undefined
  scrollTrigger: () => number
  setActiveSession: (id: string) => void
  sendPrompt: (text: string, attachments?: import("../types").FileAttachment[]) => Promise<boolean>
  abort: () => void
  connect: () => void
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

  const msg: Message = {
    id, role: turn.role, sessionID: sessionId,
    parts, blocks,
    createdAt: new Date(turn.timestamp).getTime(),
  }

  if (turn.usage) {
    msg.usage = {
      tokensUsed: turn.usage.tokensUsed,
      contextSize: turn.usage.contextSize,
      cost: turn.usage.cost as UsageInfo["cost"],
    }
  }

  return msg
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
        id: uid("p"), type: "tool_call",
        toolCallId: step.id as string, name: step.name as string,
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

// ── Chat Provider ───────────────────────────────────────────────────────────

interface ChatStore {
  messagesBySession: Record<string, Message[]>
  activeSession: string | undefined
  streaming: boolean
  loadingHistory: boolean
  sseStatus: 'connected' | 'reconnecting' | 'disconnected'
  scrollTrigger: number
}

export function ChatProvider({ children, onPermissionRequest, onPermissionResolved }: { children: React.ReactNode; onPermissionRequest?: (req: PermissionRequest) => void; onPermissionResolved?: (event: { sessionId: string; requestId: string }) => void }) {
  const workspace = useWorkspace()
  const sessions = useSessions()
  const sseRef = useRef(createSSEManager())

  const [store, setStore] = useImmer<ChatStore>({
    messagesBySession: {},
    activeSession: undefined,
    streaming: false,
    loadingHistory: false,
    sseStatus: 'disconnected',
    scrollTrigger: 0,
  })

  // Mirror of messagesBySession for reliable reads outside React batching
  const messagesRef = useRef<Record<string, Message[]>>({})

  const abortedSessions = useRef(new Set<string>())
  const assistantMsgId = useRef(new Map<string, string>())
  const thinkingStartTime = useRef(new Map<string, number>())
  // Maps turnId → userMsgId for cross-adapter messages (message:queued → message:processing pairing)
  const turnIdToUserMsgId = useRef(new Map<string, string>())
  const msgCounter = useRef(0)
  const partCounter = useRef(0)
  const sendingRef = useRef(false)

  // Text batching
  const textBuffer = useRef(new Map<string, string>())
  const thoughtBuffer = useRef(new Map<string, string>())
  const flushScheduled = useRef(false)

  function nextId(prefix: string) {
    return `${prefix}-${Date.now()}-${++msgCounter.current}`
  }
  function nextPartId() {
    return `part-${Date.now()}-${++partCounter.current}`
  }

  function addMessage(sessionID: string, msg: Message) {
    setStore((draft) => {
      if (!draft.messagesBySession[sessionID]) draft.messagesBySession[sessionID] = []
      draft.messagesBySession[sessionID].push(msg)
    })
    // Keep ref in sync
    if (!messagesRef.current[sessionID]) messagesRef.current[sessionID] = []
    messagesRef.current[sessionID] = [...(messagesRef.current[sessionID] || []), msg]
  }

  function setMessages(sessionID: string, msgs: Message[]) {
    messagesRef.current[sessionID] = msgs
    setStore((draft) => { draft.messagesBySession[sessionID] = msgs })
  }

  // Sync ref after every store mutation — use current() to get plain objects from Immer draft
  function syncRef(sessionID: string, draft: ChatStore) {
    const msgs = draft.messagesBySession[sessionID]
    messagesRef.current[sessionID] = msgs ? current(msgs) : []
  }

  function updateAssistantParts(sessionID: string, updater: (parts: MessagePart[]) => void) {
    const msgId = assistantMsgId.current.get(sessionID)
    if (!msgId) return
    setStore((draft) => {
      const msgs = draft.messagesBySession[sessionID]
      if (!msgs) return
      const msg = msgs.find((m) => m.id === msgId)
      if (msg) updater(msg.parts)
      syncRef(sessionID, draft)
    })
  }

  function updateAssistantBlocks(sessionID: string, updater: (blocks: MessageBlock[]) => void) {
    const msgId = assistantMsgId.current.get(sessionID)
    if (!msgId) return
    setStore((draft) => {
      const msgs = draft.messagesBySession[sessionID]
      if (!msgs) return
      const msg = msgs.find((m) => m.id === msgId)
      if (msg) updater(msg.blocks)
      syncRef(sessionID, draft)
    })
  }

  function ensureAssistantMessage(sessionID: string, parentId?: string): string {
    let msgId = assistantMsgId.current.get(sessionID)
    if (msgId) return msgId

    msgId = nextId("ast")
    assistantMsgId.current.set(sessionID, msgId)
    addMessage(sessionID, {
      id: msgId, role: "assistant", sessionID,
      parts: [], blocks: [], createdAt: Date.now(), parentID: parentId,
    })
    setStore((draft) => { draft.streaming = true })
    return msgId
  }

  function findToolPart(parts: MessagePart[], toolCallId: string): ToolCallPart | undefined {
    return parts.find((p) => p.type === "tool_call" && p.toolCallId === toolCallId) as ToolCallPart | undefined
  }

  // ── History loading ─────────────────────────────────────────────────────

  async function loadHistory(sessionID: string) {
    const localMsgs = messagesRef.current[sessionID] ?? []
    const hasInMemory = localMsgs.length > 0

    if (!hasInMemory) {
      try {
        const cached = await loadCachedMessages(sessionID)
        if (cached && cached.length > 0) {
          setMessages(sessionID, cached)
        }
      } catch { /* cache unavailable */ }
    }

    setStore((draft) => { draft.loadingHistory = true })
    try {
      const history = await workspace.client.getSessionHistory(sessionID)
      if (history && history.turns.length > 0) {
        const serverMessages = historyToMessages(history)
        const serverAstBlocks = serverMessages.filter((m) => m.role === "assistant").reduce((n, m) => n + m.blocks.length, 0)
        const local = messagesRef.current[sessionID] ?? []
        const localAstBlocks = local.filter((m) => m.role === "assistant").reduce((n, m) => n + m.blocks.length, 0)

        if (serverAstBlocks > 0 && serverAstBlocks >= localAstBlocks) {
          const lastServerTime = new Date(history.turns[history.turns.length - 1].timestamp).getTime()
          const inFlight = local.filter((m) => m.createdAt > lastServerTime + 1000)
          setMessages(sessionID, [...serverMessages, ...inFlight])
          void cacheMessages(sessionID, serverMessages)
        } else if (local.length === 0) {
          setMessages(sessionID, serverMessages)
        }
        // else: local data is richer, keep it
      }
    } catch {
      // Server unavailable — local cache/in-memory used as fallback
    } finally {
      setStore((draft) => { draft.loadingHistory = false })
    }
  }

  // ── Diff extraction ──────────────────────────────────────────────────

  function extractDiff(evt: { meta?: Record<string, unknown>; rawInput?: Record<string, unknown>; rawOutput?: unknown; content?: unknown; name?: string }): FileDiff | null {
    const meta = evt.meta as Record<string, any> | undefined
    if (meta?.filediff) {
      const fd = meta.filediff
      return { path: fd.path || "", before: fd.before ?? fd.oldText, after: fd.after ?? fd.newText }
    }
    if (Array.isArray(evt.content)) {
      for (const item of evt.content) {
        if (item && typeof item === "object" && (item as any).type === "diff") {
          const d = item as any
          return { path: d.path || "", before: d.oldText ?? undefined, after: d.newText ?? "" }
        }
      }
    }
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
    if (name === "edit" && (input.old_string != null || input.new_string != null)) {
      return { path, before: input.old_string != null ? String(input.old_string) : undefined, after: String(input.new_string ?? input.content ?? "") }
    }
    if (name === "write" && input.content != null) {
      return { path, after: String(input.content) }
    }
    if (name === "apply_patch" && input.patch != null) {
      return { path: input.file_path || input.path || "patch", after: String(input.patch) }
    }
    return null
  }

  // ── Text batching ────────────────────────────────────────────────

  function scheduleFlush() {
    if (flushScheduled.current) return
    flushScheduled.current = true
    requestAnimationFrame(flushBuffers)
  }

  function flushBuffers() {
    flushScheduled.current = false

    for (const [sessionID, text] of textBuffer.current) {
      ensureAssistantMessage(sessionID)
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
              id: nextPartId(), type: "tool_call",
              toolCallId: evt.id, name: evt.name,
              status: evt.status as ToolCallPart["status"],
              input: evt.rawInput, output: evt.rawOutput, diff,
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
            existing.name = evt.name; existing.status = evt.status as ToolBlock["status"]
            existing.kind = kind; existing.title = title
            if (input) existing.input = input
            if (outputStr != null) existing.output = outputStr
          } else {
            blocks.push({
              type: "tool", id: evt.id, name: evt.name, kind,
              status: (evt.status as ToolBlock["status"]) || "running",
              title, description: extractDescription(input, title),
              command: extractCommand(kind, input), input,
              output: outputStr, diffStats: null,
              isNoise: isNoiseTool(evt.name, evt.isNoise), isHidden: false,
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
        flushBuffers()
        ensureAssistantMessage(sessionID)
        updateAssistantParts(sessionID, (parts) => {
          parts.push({ id: nextPartId(), type: "text", content: `\n\n**Error:** ${evt.content}` })
        })
        updateAssistantBlocks(sessionID, (blocks) => {
          blocks.push({ type: "error", id: nextPartId(), content: evt.content })
        })
        assistantMsgId.current.delete(sessionID)
        setStore((draft) => { draft.streaming = false })
        break
      }
      case "usage": {
        flushBuffers()
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
        // Attach usage data to the current assistant message
        const usageMsgId = assistantMsgId.current.get(sessionID)
        if (usageMsgId) {
          const usageInfo: UsageInfo = {
            tokensUsed: evt.tokensUsed,
            contextSize: evt.contextSize,
            cost: (evt as any).cost,
          }
          setStore((draft) => {
            const msgs = draft.messagesBySession[sessionID]
            if (!msgs) return
            const msg = msgs.find((m) => m.id === usageMsgId)
            if (msg) msg.usage = usageInfo
          })
        }
        assistantMsgId.current.delete(sessionID)
        setStore((draft) => { draft.streaming = false })
        void sessions.refresh()
        const msgs = messagesRef.current[sessionID]
        if (msgs) void cacheMessages(sessionID, [...msgs])
        break
      }
    }
  }

  function handleMessageQueued(ev: MessageQueuedEvent) {
    const userMsgId = nextId("usr-ext")
    turnIdToUserMsgId.current.set(ev.turnId, userMsgId)
    setStore((draft) => {
      if (!draft.messagesBySession[ev.sessionId]) draft.messagesBySession[ev.sessionId] = []
      draft.messagesBySession[ev.sessionId].push({
        id: userMsgId,
        role: "user",
        sessionID: ev.sessionId,
        parts: [{ id: nextPartId(), type: "text", content: ev.text }],
        blocks: [{ type: "text", id: nextPartId(), content: ev.text }],
        createdAt: new Date(ev.timestamp).getTime(),
        sourceAdapterId: ev.sourceAdapterId,
      })
      // Sort by createdAt so the message lands in correct chronological position
      // (it may arrive while a previous AI turn is still streaming)
      draft.messagesBySession[ev.sessionId].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      draft.scrollTrigger++
    })
  }

  function handleMessageProcessing(ev: MessageProcessingEvent) {
    const userMsgId = turnIdToUserMsgId.current.get(ev.turnId)
    const astMsgId = nextId("ast-ext")
    assistantMsgId.current.set(ev.sessionId, astMsgId)
    addMessage(ev.sessionId, {
      id: astMsgId,
      role: "assistant",
      sessionID: ev.sessionId,
      parts: [],
      blocks: [],
      createdAt: new Date(ev.timestamp).getTime(),
      parentID: userMsgId,
    })
    setStore((draft) => { draft.streaming = true })
  }

  const connect = useCallback(() => {
    sseRef.current.connect(workspace.directory, workspace.client.eventsUrl, {
      onAgentEvent: handleAgentEvent,
      onSessionCreated: (s) => sessions.upsert(s),
      onSessionUpdated: (s) => sessions.upsert(s),
      onSessionDeleted: (id) => sessions.delete(id),
      onMessageQueued: handleMessageQueued,
      onMessageProcessing: handleMessageProcessing,
      onPermissionRequest: onPermissionRequest,
      onPermissionResolved: onPermissionResolved,
      onConnected: () => setStore((d) => { d.sseStatus = 'connected' }),
      onReconnecting: () => setStore((d) => { d.sseStatus = 'reconnecting' }),
      onDisconnected: () => setStore((d) => { d.sseStatus = 'disconnected' }),
    })
  }, [workspace.directory, workspace.client.eventsUrl])

  async function doSendPrompt(text: string, attachments?: import("../types").FileAttachment[]): Promise<boolean> {
    let sessionID = store.activeSession
    if (!sessionID) {
      const session = await sessions.create()
      if (!session) return false
      sessionID = session.id
      setStore((draft) => { draft.activeSession = sessionID })
    }

    const userMsgId = nextId("usr")
    addMessage(sessionID, {
      id: userMsgId, role: "user", sessionID,
      parts: [{ id: nextPartId(), type: "text", content: text }],
      blocks: [{ type: "text", id: nextPartId(), content: text }],
      attachments: attachments?.length ? attachments : undefined,
      createdAt: Date.now(),
    })

    const astMsgId = nextId("ast")
    assistantMsgId.current.set(sessionID, astMsgId)
    addMessage(sessionID, {
      id: astMsgId, role: "assistant", sessionID,
      parts: [], blocks: [], createdAt: Date.now(), parentID: userMsgId,
    })
    setStore((draft) => { draft.streaming = true })

    connect()

    try {
      await workspace.client.sendPrompt(sessionID, text, attachments)
      return true
    } catch {
      return false
    }
  }

  const sendPrompt = useCallback(async (text: string, attachments?: import("../types").FileAttachment[]): Promise<boolean> => {
    if (sendingRef.current) return false
    sendingRef.current = true
    try {
      return await doSendPrompt(text, attachments)
    } finally {
      sendingRef.current = false
    }
  }, [store.activeSession, workspace.client])

  const addCommandResponse = useCallback((sessionID: string, text: string, role: "user" | "assistant" = "assistant") => {
    addMessage(sessionID, {
      id: nextId(role === "user" ? "cmd-usr" : "cmd-ast"),
      role, sessionID,
      parts: [{ id: nextPartId(), type: "text", content: text }],
      blocks: [{ type: "text", id: nextPartId(), content: text }],
      createdAt: Date.now(),
    })
  }, [])

  const setActiveSession = useCallback((id: string) => {
    setStore((draft) => { draft.activeSession = id })
    void loadHistory(id)
  }, [workspace.client])

  const abort = useCallback(() => {
    const sessionID = store.activeSession
    if (!sessionID) return
    abortedSessions.current.add(sessionID)
    assistantMsgId.current.delete(sessionID)
    setStore((draft) => { draft.streaming = false })
    // Tell server to actually cancel the agent's prompt
    workspace.client.cancelPrompt(sessionID).catch(() => {})
    setTimeout(() => abortedSessions.current.delete(sessionID), 5000)
  }, [store.activeSession, workspace.client])

  // Connect on mount, disconnect on cleanup
  useEffect(() => {
    connect()
    return () => sseRef.current.disconnectAll()
  }, [connect])

  const value = useMemo((): ChatContext => ({
    messages: () => store.messagesBySession[store.activeSession || ""] || [],
    streaming: () => store.streaming,
    loadingHistory: () => store.loadingHistory,
    sseStatus: () => store.sseStatus,
    activeSession: () => store.activeSession,
    scrollTrigger: () => store.scrollTrigger,
    setActiveSession,
    sendPrompt,
    abort,
    connect,
    addCommandResponse,
  }), [store, setActiveSession, sendPrompt, abort, connect, addCommandResponse])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
