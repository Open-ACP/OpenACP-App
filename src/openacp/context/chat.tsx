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
import * as charStream from "../lib/char-stream"

interface ChatContext {
  messages: () => Message[]
  pending: () => PendingItem[]
  streaming: () => boolean
  /** Session ID that is currently streaming (may differ from activeSession for cross-adapter turns) */
  streamingSession: () => string | undefined
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
      const input = (s.input as Record<string, unknown> | null) ?? null
      const kind = resolveKind(s.name ?? "", s.kind, undefined, input)
      const title = buildTitle(s.name ?? "", kind, input)
      // Extract diff from history step — server stores before in oldText, after in newText
      const diff: FileDiff | null = s.diff
        ? { path: s.diff.path || "", before: s.diff.oldText, after: s.diff.newText ?? "" }
        : null
      return {
        type: "tool", id: s.id ?? uid("b"), name: s.name ?? "", kind,
        status: (s.status as ToolBlock["status"]) || "completed",
        title, description: extractDescription(input, title),
        command: extractCommand(kind, input), input,
        output: typeof s.output === "string" ? s.output : s.output ? JSON.stringify(s.output) : null,
        diffStats: null, diff, isNoise: isNoiseTool(s.name ?? ""), isHidden: false,
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

  if (turn.sourceAdapterId) {
    msg.sourceAdapterId = turn.sourceAdapterId
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

export interface PendingItem {
  turnId: string
  text: string
  sender?: import("../types").TurnSender | null
  timestamp: string
}

interface ChatStore {
  messagesBySession: Record<string, Message[]>
  pendingBySession: Record<string, PendingItem[]>
  activeSession: string | undefined
  streaming: boolean
  /** Which session is currently streaming (can be different from activeSession) */
  streamingSession: string | undefined
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
    pendingBySession: {},
    activeSession: undefined,
    streaming: false,
    streamingSession: undefined,
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
  const turnIdToAssistantMsgId = useRef(new Map<string, string>())
  // turnIds of messages sent by this App instance — used to suppress duplicate SSE echo
  const ownTurnIds = useRef(new Set<string>())
  // Dedup message:failed events (workspace plugin + Core can both emit for the same turnId)
  const failedTurnIds = useRef(new Set<string>())
  // Track whether we had a disconnect so we can reload history on reconnect
  const hadDisconnect = useRef(false)
  const msgCounter = useRef(0)
  const partCounter = useRef(0)
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
    setStore((draft) => { draft.streaming = true; draft.streamingSession = sessionID })
    return msgId
  }

  function findToolPart(parts: MessagePart[], toolCallId: string): ToolCallPart | undefined {
    return parts.find((p) => p.type === "tool_call" && p.toolCallId === toolCallId) as ToolCallPart | undefined
  }

  // ── History loading ─────────────────────────────────────────────────────

  async function loadHistory(sessionID: string) {
    // Snapshot the streaming placeholder ID now. If a new message:processing event fires
    // during the async history fetch it will update assistantMsgId — comparing before vs
    // after the await lets us detect whether a new turn started while we were waiting.
    const streamingPlaceholderAtStart = assistantMsgId.current.get(sessionID)

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
          // Server has fully captured all assistant work — the local streaming placeholder (if any)
          // is superseded by the completed turn in history. Clear it to prevent duplicate rendering.
          // Guard: only reset if assistantMsgId hasn't changed since we started the fetch.
          // A changed ID means a new message:processing arrived during the await — an active
          // turn we must not interrupt.
          if (assistantMsgId.current.get(sessionID) === streamingPlaceholderAtStart) {
            assistantMsgId.current.delete(sessionID)
            setStore((draft) => { draft.streaming = false; draft.streamingSession = undefined })
          }
          // Only keep user messages as in-flight — assistant messages are already
          // in serverMessages (completed turns) and local copies would cause duplicates
          // because handleMessageProcessing sets createdAt: Date.now() (client timestamp)
          // which can be > lastServerTime even for turns the server has captured.
          // Secondary de-dup: lastServerTime is the turn START timestamp, so a recently
          // sent user message (createdAt ≈ send time) can be > lastServerTime even when
          // the server already has it. Exclude inFlight items whose text is already in
          // serverMessages to prevent that duplicate.
          const serverUserTexts = new Set(
            serverMessages
              .filter((m) => m.role === "user")
              .flatMap((m) => m.parts.filter((p) => p.type === "text").map((p) => (p as { content: string }).content))
          )
          const inFlight = local.filter((m) => {
            if (m.createdAt <= lastServerTime || m.role !== "user") return false
            const text = m.parts.find((p) => p.type === "text") as { content: string } | undefined
            return !text || !serverUserTexts.has(text.content)
          })
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
      setStore((draft) => {
        draft.loadingHistory = false
        draft.scrollTrigger++
      })
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
    // apply_patch diff stores the raw patch text as `after`; it surfaces in the Review panel
    // but is never shown in the inline ToolDiffView (which only activates for edit/write kinds)
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

    const pendingText = new Map(textBuffer.current)
    const pendingThought = new Map(thoughtBuffer.current)
    textBuffer.current.clear()
    thoughtBuffer.current.clear()

    if (pendingText.size === 0 && pendingThought.size === 0) return

    // Ensure assistant messages exist before the batched update
    for (const sessionID of pendingText.keys()) ensureAssistantMessage(sessionID)
    for (const sessionID of pendingThought.keys()) ensureAssistantMessage(sessionID)

    // Collect thinking duration info before entering the draft
    const thinkingDurations = new Map<string, number>()
    for (const sessionID of pendingText.keys()) {
      const thinkStart = thinkingStartTime.current.get(sessionID)
      if (thinkStart) {
        thinkingDurations.set(sessionID, Date.now() - thinkStart)
        thinkingStartTime.current.delete(sessionID)
      }
    }

    // Reset the thought charStream for sessions that will create a new thinking block.
    // Same pattern as the text stream reset at tool_call boundaries: without this, a new
    // ThinkingBlockView subscribes to the same stream key and immediately receives all
    // previously-drained chars from the old block, producing duplicate/carry-over content.
    for (const [sessionID, text] of pendingThought) {
      const local = messagesRef.current[sessionID] ?? []
      const msgId = assistantMsgId.current.get(sessionID)
      const msg = local.find((m) => m.id === msgId)
      // msg is expected to exist: ensureAssistantMessage() was called just above.
      // If it's still missing (rare ref sync lag), skip — setStore will create the block fresh.
      if (msg) {
        const lastThinkingIdx = msg.blocks.findLastIndex((b) => b.type === "thinking")
        const hasInterveningBlock = lastThinkingIdx >= 0 &&
          msg.blocks.slice(lastThinkingIdx + 1).some((b) => b.type === "tool" || b.type === "text")
        // INVARIANT: this condition must match the else-branch inside setStore below (~line 452).
        // Both decide whether the current flush batch requires a new thinking block.
        const willCreateNewBlock = lastThinkingIdx < 0 || hasInterveningBlock
        if (willCreateNewBlock) {
          charStream.flush(`${sessionID}:thought`)
          charStream.clearStream(`${sessionID}:thought`)
          charStream.pushChars(`${sessionID}:thought`, text)
        }
      }
    }

    // Single setStore call for ALL text and thought buffer updates.
    // Thought MUST be processed before text so that when both arrive in the same
    // flush batch, the ThinkingBlock is already appended before text logic runs.
    // If text ran first it could push a TextBlock after ThinkingBlock, causing
    // subsequent thought chunks to see an "intervening block" and open a new ThinkingBlock.
    setStore((draft) => {
      // Apply thought buffer updates first
      for (const [sessionID, text] of pendingThought) {
        const msgId = assistantMsgId.current.get(sessionID)
        if (!msgId) continue
        const msgs = draft.messagesBySession[sessionID]
        if (!msgs) continue
        const msg = msgs.find((m) => m.id === msgId)
        if (!msg) continue

        // Update parts
        const existingPart = [...msg.parts].reverse().find((p): p is ThinkingPart => p.type === "thinking")
        if (existingPart) {
          existingPart.content += text
        } else {
          msg.parts.push({ id: nextPartId(), type: "thinking", content: text })
        }

        // Update blocks — append to existing thinking if no tool/text block intervened.
        // INVARIANT: the else-branch (new block creation) must match willCreateNewBlock in
        // the pre-setStore loop above. Keep both in sync when modifying this condition.
        const lastThinkingIdx = msg.blocks.findLastIndex((b) => b.type === "thinking")
        const hasInterveningBlock = lastThinkingIdx >= 0 &&
          msg.blocks.slice(lastThinkingIdx + 1).some((b) => b.type === "tool" || b.type === "text")

        if (lastThinkingIdx >= 0 && !hasInterveningBlock) {
          const existing = msg.blocks[lastThinkingIdx] as ThinkingBlock
          existing.content += text
          existing.isStreaming = true
        } else {
          // Close previous thinking if any
          if (lastThinkingIdx >= 0) {
            const prev = msg.blocks[lastThinkingIdx] as ThinkingBlock
            if (prev.isStreaming) {
              prev.isStreaming = false
              const thinkStart = thinkingStartTime.current.get(sessionID)
              if (thinkStart) {
                prev.durationMs = Date.now() - thinkStart
              }
            }
          }
          thinkingStartTime.current.set(sessionID, Date.now())
          msg.blocks.push({ type: "thinking", id: nextPartId(), content: text, durationMs: null, isStreaming: true })
        }

        syncRef(sessionID, draft)
      }

      // Apply text buffer updates after thought so blocks are correctly positioned
      for (const [sessionID, text] of pendingText) {
        const msgId = assistantMsgId.current.get(sessionID)
        if (!msgId) continue
        const msgs = draft.messagesBySession[sessionID]
        if (!msgs) continue
        const msg = msgs.find((m) => m.id === msgId)
        if (!msg) continue

        // Close thinking block if transitioning to text
        const thinkDuration = thinkingDurations.get(sessionID)
        if (thinkDuration != null) {
          const thinking = [...msg.blocks].reverse().find((b): b is ThinkingBlock => b.type === "thinking" && b.isStreaming)
          if (thinking) {
            thinking.isStreaming = false
            thinking.durationMs = thinkDuration
          }
        }

        // Update parts
        const lastPart = msg.parts[msg.parts.length - 1]
        if (lastPart?.type === "text") {
          lastPart.content += text
        } else {
          msg.parts.push({ id: nextPartId(), type: "text", content: text })
        }

        // Update blocks
        const lastBlock = msg.blocks[msg.blocks.length - 1]
        if (lastBlock?.type === "text") {
          (lastBlock as TextBlock).content += text
        } else if (lastBlock?.type === "thinking") {
          // Thinking block interrupted text mid-stream (e.g. "Chào! Cần " + think + "gì không?").
          // Append to the preceding text block so the sentence isn't split across the boundary.
          // Note: the thinking block may already be closed (isStreaming: false) because
          // thinkingDurations processes the close before this block update runs.
          const prevBlock = msg.blocks.length >= 2 ? msg.blocks[msg.blocks.length - 2] : null
          if (prevBlock?.type === "text") {
            (prevBlock as TextBlock).content += text
          } else {
            msg.blocks.push({ type: "text", id: nextPartId(), content: text })
          }
        } else {
          msg.blocks.push({ type: "text", id: nextPartId(), content: text })
        }

        syncRef(sessionID, draft)
      }
    })
  }

  // ── SSE event handling ──────────────────────────────────────────────────

  function handleAgentEvent(event: AgentEvent) {
    const sessionID = event.sessionId
    if (!sessionID) return
    if (abortedSessions.current.has(sessionID)) return

    // Broadcast for consumers outside chat context (file tree, notifications, etc.)
    window.dispatchEvent(new CustomEvent("agent-event", { detail: event }))

    const turnId = event.turnId
    // Try turnId-based routing first, fall back to session-based.
    // If a specific assistant message is mapped to this turnId, route all events to it.
    const turnTargetMsgId = turnId ? turnIdToAssistantMsgId.current.get(turnId) : undefined
    if (turnTargetMsgId) {
      assistantMsgId.current.set(sessionID, turnTargetMsgId)
    }

    const evt = event.event

    switch (evt.type) {
      case "text": {
        ensureAssistantMessage(sessionID)
        charStream.pushChars(`${sessionID}:text`, evt.content)
        textBuffer.current.set(sessionID, (textBuffer.current.get(sessionID) ?? "") + evt.content)
        scheduleFlush()
        break
      }
      case "thought": {
        ensureAssistantMessage(sessionID)
        charStream.pushChars(`${sessionID}:thought`, evt.content)
        if (!thinkingStartTime.current.has(sessionID)) {
          thinkingStartTime.current.set(sessionID, Date.now())
        }
        thoughtBuffer.current.set(sessionID, (thoughtBuffer.current.get(sessionID) ?? "") + evt.content)
        scheduleFlush()
        break
      }
      case "tool_call": {
        // Flush any buffered text before inserting the tool block.
        // Without this, a rAF-deferred flushBuffers could run after updateAssistantBlocks
        // has already made the tool block the last block, causing subsequent text to be
        // split into a new text block instead of appending to the existing one.
        flushBuffers()
        // Reset the text charStream at tool boundaries. charStream is a continuous buffer for the
        // whole message; the pre-tool TextBlock has streaming=false so it never subscribes.
        // Without clearing here, the post-tool TextBlock would subscribe and immediately receive
        // all pre-tool chars as stale display content, showing duplicate/garbled text.
        charStream.flush(`${sessionID}:text`)
        charStream.clearStream(`${sessionID}:text`)
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
          const input = evt.rawInput ?? null
          const kind = resolveKind(evt.name, evt.kind, evt.displayKind, input)
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
            if (diff) existing.diff = diff
          } else {
            blocks.push({
              type: "tool", id: evt.id, name: evt.name, kind,
              status: (evt.status as ToolBlock["status"]) || "running",
              title, description: extractDescription(input, title),
              command: extractCommand(kind, input), input,
              output: outputStr, diffStats: null, diff,
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
            if (evt.displayKind) existing.kind = evt.displayKind
            // Rebuild title/kind when input or name updates, or when kind is still unresolved.
            // "other" means the initial tool_call lacked rawInput for detection — re-check on any update.
            if (evt.rawInput || evt.name || evt.displayTitle || existing.kind === "other") {
              const kind = resolveKind(existing.name, evt.kind, evt.displayKind, existing.input)
              existing.kind = kind
              existing.title = buildTitle(existing.name, kind, existing.input, evt.displayTitle, evt.displaySummary)
              existing.description = extractDescription(existing.input, existing.title)
              existing.command = extractCommand(kind, existing.input)
            }
            const meta = evt.meta as Record<string, any> | undefined
            if (meta?.diffStats) {
              existing.diffStats = meta.diffStats as { added: number; removed: number }
            }
            if (diff) existing.diff = diff
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
        charStream.flush(`${sessionID}:text`)
        charStream.flush(`${sessionID}:thought`)
        charStream.clearStream(`${sessionID}:text`)
        charStream.clearStream(`${sessionID}:thought`)
        ensureAssistantMessage(sessionID)
        updateAssistantParts(sessionID, (parts) => {
          parts.push({ id: nextPartId(), type: "text", content: `\n\n**Error:** ${evt.content}` })
        })
        updateAssistantBlocks(sessionID, (blocks) => {
          blocks.push({ type: "error", id: nextPartId(), content: evt.content })
        })
        assistantMsgId.current.delete(sessionID)
        setStore((draft) => { draft.streaming = false; draft.streamingSession = undefined })
        break
      }
      case "usage": {
        flushBuffers()
        charStream.flush(`${sessionID}:text`)
        charStream.flush(`${sessionID}:thought`)
        charStream.clearStream(`${sessionID}:text`)
        charStream.clearStream(`${sessionID}:thought`)
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
        // Cleanup turnId maps
        if (turnId) {
          turnIdToAssistantMsgId.current.delete(turnId)
          turnIdToUserMsgId.current.delete(turnId)
        }
        setStore((draft) => { draft.streaming = false; draft.streamingSession = undefined })
        void sessions.refresh()
        const msgs = messagesRef.current[sessionID]
        if (msgs) void cacheMessages(sessionID, [...msgs])
        break
      }
    }
  }

  function handleMessageQueued(ev: MessageQueuedEvent) {
    // Detect old Core: if sender field is absent, fall back to legacy behavior
    if (!('sender' in ev)) {
      // Legacy path — add user message to conversation directly (existing behavior)
      const userMsgId = nextId("usr-ext")
      turnIdToUserMsgId.current.set(ev.turnId, userMsgId)
      const userMsg: Message = {
        id: userMsgId,
        role: "user",
        sessionID: ev.sessionId,
        parts: [{ id: nextPartId(), type: "text", content: ev.text }],
        blocks: [{ type: "text", id: nextPartId(), content: ev.text }],
        createdAt: new Date(ev.timestamp).getTime(),
        sourceAdapterId: ev.sourceAdapterId,
      }
      setStore((draft) => {
        if (!draft.messagesBySession[ev.sessionId]) draft.messagesBySession[ev.sessionId] = []
        draft.messagesBySession[ev.sessionId].push(userMsg)
        draft.messagesBySession[ev.sessionId].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        draft.scrollTrigger++
      })
      // Sync ref so loadHistory's inFlight calculation includes this message
      if (!messagesRef.current[ev.sessionId]) messagesRef.current[ev.sessionId] = []
      messagesRef.current[ev.sessionId] = [
        ...(messagesRef.current[ev.sessionId] || []),
        userMsg,
      ].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      window.dispatchEvent(new CustomEvent("workspace-activity"))
      return
    }

    // New path: add to pending list, NOT to conversation
    const currentPending = store.pendingBySession[ev.sessionId] || []
    console.log('[PendingQueue] message:queued', {
      turnId: ev.turnId,
      sessionId: ev.sessionId,
      text: ev.text?.slice(0, 60),
      pendingCountBefore: currentPending.length,
      ts: new Date().toISOString(),
    })
    setStore((draft) => {
      const pending = draft.pendingBySession[ev.sessionId] ??= []
      pending.push({
        turnId: ev.turnId,
        text: ev.text,
        sender: ev.sender,
        timestamp: ev.timestamp,
      })
      console.log('[PendingQueue] after push, count =', pending.length)
    })
  }

  function handleMessageProcessing(ev: MessageProcessingEvent) {
    const sid = ev.sessionId
    const processingStartedAt = new Date(ev.timestamp).getTime()

    // Remove from pending list
    setStore(draft => {
      const pending = draft.pendingBySession[sid]
      if (pending) {
        const idx = pending.findIndex(p => p.turnId === ev.turnId)
        console.log('[PendingQueue] message:processing, removing turnId', ev.turnId, 'idx', idx, 'pendingCount', pending.length)
        if (idx !== -1) pending.splice(idx, 1)
      }
    })

    if (ownTurnIds.current.has(ev.turnId)) {
      // Self-sent: create both messages only when this turn actually starts processing.
      const userMsgId = nextId("usr")
      const astMsgId = nextId("ast")
      const displayText = ev.finalPrompt || ev.userPrompt || ""
      turnIdToUserMsgId.current.set(ev.turnId, userMsgId)
      assistantMsgId.current.set(sid, astMsgId)
      turnIdToAssistantMsgId.current.set(ev.turnId, astMsgId)
      ownTurnIds.current.delete(ev.turnId)

      setStore((draft) => {
        const msgs = draft.messagesBySession[sid] ??= []
        msgs.push({
          id: userMsgId,
          role: "user",
          sessionID: sid,
          parts: [{ id: nextPartId(), type: "text", content: displayText }],
          blocks: [{ type: "text", id: nextPartId(), content: displayText }],
          createdAt: processingStartedAt,
        })
        msgs.push({
          id: astMsgId,
          role: "assistant",
          sessionID: sid,
          parentID: userMsgId,
          parts: [],
          blocks: [],
          createdAt: Date.now(),
        })
        msgs.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        draft.streaming = true
        draft.streamingSession = sid
        draft.scrollTrigger++
      })
      const refMsgs = messagesRef.current[sid] ??= []
      refMsgs.push({
        id: userMsgId,
        role: "user",
        sessionID: sid,
        parts: [{ id: nextPartId(), type: "text", content: displayText }],
        blocks: [{ type: "text", id: nextPartId(), content: displayText }],
        createdAt: processingStartedAt,
      })
      refMsgs.push({
        id: astMsgId,
        role: "assistant",
        sessionID: sid,
        parentID: userMsgId,
        parts: [],
        blocks: [],
        createdAt: Date.now(),
      })
      refMsgs.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      window.dispatchEvent(new CustomEvent("workspace-activity"))
      return
    }

    // Cross-adapter: create user message + assistant message
    let userMsgId: string | undefined

    if (ev.userPrompt) {
      // New Core: create user message from processing event
      userMsgId = nextId("usr-ext")
      turnIdToUserMsgId.current.set(ev.turnId, userMsgId)
    }
    // else: Legacy Core — user message already added by message:queued fallback

    const astMsgId = nextId("ast-ext")
    assistantMsgId.current.set(sid, astMsgId)
    turnIdToAssistantMsgId.current.set(ev.turnId, astMsgId)

    setStore((draft) => {
      const msgs = draft.messagesBySession[sid] ??= []

      if (userMsgId && ev.userPrompt) {
        // Show finalPrompt (after plugin modifications) to match server history;
        // fall back to userPrompt if finalPrompt is not available (legacy Core).
        const displayText = ev.finalPrompt || ev.userPrompt
        msgs.push({
          id: userMsgId,
          role: "user",
          sessionID: sid,
          parts: [{ id: nextPartId(), type: "text", content: displayText }],
          blocks: [{ type: "text", id: nextPartId(), content: displayText }],
          createdAt: new Date(ev.timestamp).getTime(),
          sourceAdapterId: ev.sourceAdapterId,
        })
      }

      msgs.push({
        id: astMsgId,
        role: "assistant",
        sessionID: sid,
        parentID: userMsgId ?? turnIdToUserMsgId.current.get(ev.turnId),
        parts: [],
        blocks: [],
        createdAt: Date.now(),
      })

      msgs.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      draft.streaming = true
      draft.streamingSession = sid
      draft.scrollTrigger++
    })

    // Sync ref so loadHistory's inFlight calculation includes the new messages
    const refMsgs = messagesRef.current[sid] ??= []
    if (userMsgId && ev.userPrompt) {
      const displayText = ev.finalPrompt || ev.userPrompt
      refMsgs.push({
        id: userMsgId, role: "user", sessionID: sid,
        parts: [{ id: nextPartId(), type: "text", content: displayText }],
        blocks: [{ type: "text", id: nextPartId(), content: displayText }],
        createdAt: new Date(ev.timestamp).getTime(), sourceAdapterId: ev.sourceAdapterId,
      })
    }
    refMsgs.push({
      id: astMsgId, role: "assistant", sessionID: sid,
      parentID: userMsgId ?? turnIdToUserMsgId.current.get(ev.turnId),
      parts: [], blocks: [], createdAt: Date.now(),
    })
    refMsgs.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    window.dispatchEvent(new CustomEvent("workspace-activity"))
  }

  function handleMessageFailed(ev: import("../types").MessageFailedEvent) {
    // Dedup: workspace plugin and Core can both emit message:failed for the same turnId.
    // First event wins (workspace plugin emits first with user-facing message; Core emits
    // second with generic 'PROMPT_BLOCKED'). Subsequent events for the same turnId are no-ops.
    if (failedTurnIds.current.has(ev.turnId)) return
    failedTurnIds.current.add(ev.turnId)

    // Remove from pending — message was blocked by middleware or failed before processing
    setStore(draft => {
      const pending = draft.pendingBySession[ev.sessionId]
      if (pending) {
        const idx = pending.findIndex(p => p.turnId === ev.turnId)
        if (idx !== -1) pending.splice(idx, 1)
      }
      // Add an error message to the conversation so the user knows what happened.
      // Use the reason if it's human-readable (from workspace plugin etc.);
      // skip generic internal codes ('PROMPT_BLOCKED').
      const isGenericCode = !ev.reason || ev.reason === 'PROMPT_BLOCKED'
      const errorContent = isGenericCode
        ? '⚠️ Message could not be sent.'
        : ev.reason
      if (!draft.messagesBySession[ev.sessionId]) draft.messagesBySession[ev.sessionId] = []
      draft.messagesBySession[ev.sessionId].push({
        id: nextId("err"),
        role: "assistant",
        sessionID: ev.sessionId,
        parts: [{ id: nextPartId(), type: "text", content: errorContent }],
        blocks: [{ type: "error", id: nextPartId(), content: errorContent }],
        createdAt: Date.now(),
      })
      draft.scrollTrigger++
    })
    // Clean up own-turn tracking so we don't create orphaned messages
    ownTurnIds.current.delete(ev.turnId)
    turnIdToUserMsgId.current.delete(ev.turnId)
    turnIdToAssistantMsgId.current.delete(ev.turnId)
    console.warn('[Chat] message:failed', ev.turnId, ev.reason)
  }

  const connect = useCallback(() => {
    sseRef.current.connect(workspace.directory, workspace.client.eventsUrl, {
      onAgentEvent: handleAgentEvent,
      onSessionCreated: (s) => sessions.upsert(s),
      onSessionUpdated: (s) => sessions.upsert(s),
      onSessionDeleted: (id) => sessions.delete(id),
      onMessageQueued: handleMessageQueued,
      onMessageProcessing: handleMessageProcessing,
      onMessageFailed: handleMessageFailed,
      onPermissionRequest: onPermissionRequest,
      onPermissionResolved: onPermissionResolved,
      onConnected: () => setStore((d) => { d.sseStatus = 'connected' }),
      onReconnecting: () => setStore((d) => { d.sseStatus = 'reconnecting' }),
      onDisconnected: () => setStore((d) => { d.sseStatus = 'disconnected'; d.streaming = false; d.streamingSession = undefined }),
    })
  }, [workspace.directory, workspace.client.eventsUrl])

  async function doSendPrompt(text: string, attachments?: import("../types").FileAttachment[]): Promise<boolean> {
    // Intercept slash commands typed directly in the composer
    const trimmed = text.trim()
    if (trimmed.startsWith('/') && !attachments?.length) {
      const sessionID = store.activeSession
      if (sessionID) {
        addCommandResponse(sessionID, trimmed, "user")
        try {
          const res = await workspace.client.executeCommand(trimmed, sessionID)
          if (res.error) {
            addCommandResponse(sessionID, `**Error:** ${res.error}`, "assistant")
          } else if (res.result?.type === 'adaptive') {
            const variant = res.result.variants?.['sse'] as { text?: string } | undefined
            addCommandResponse(sessionID, variant?.text ?? res.result.fallback, "assistant")
          } else if (res.result?.type === 'error') {
            addCommandResponse(sessionID, `⚠️ ${res.result.message}`, "assistant")
          } else if (res.result?.text) {
            addCommandResponse(sessionID, res.result.text, "assistant")
          }
        } catch (e: any) {
          addCommandResponse(sessionID, `**Error:** ${e?.message || "Command failed"}`, "assistant")
        }
        return true
      }
    }

    let sessionID = store.activeSession
    if (!sessionID) {
      const session = await sessions.create()
      if (!session) return false
      sessionID = session.id
      setActiveSession(sessionID)
    }

    connect()

    // Generate turnId client-side and register it BEFORE the API call.
    // No optimistic user message here — the message appears in the pending list
    // via message:queued, then moves to the conversation on message:processing.
    // This prevents multiple turns from appearing in the conversation before their
    // predecessors finish, which happened with optimistic UI under rapid sends.
    const turnId = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    ownTurnIds.current.add(turnId)

    try {
      await workspace.client.sendPrompt(sessionID, text, attachments, turnId)
      return true
    } catch {
      ownTurnIds.current.delete(turnId)
      return false
    }
  }

  const sendPrompt = useCallback(async (text: string, attachments?: import("../types").FileAttachment[]): Promise<boolean> => {
    // No blocking guard — App supports queuing multiple messages like Telegram/API adapters.
    // Each send is independent; Core handles serial processing via PromptQueue.
    return await doSendPrompt(text, attachments)
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
    flushBuffers()
    charStream.flush(`${sessionID}:text`)
    charStream.flush(`${sessionID}:thought`)
    charStream.clearStream(`${sessionID}:text`)
    charStream.clearStream(`${sessionID}:thought`)
    // Mark the assistant message as interrupted
    const msgId = assistantMsgId.current.get(sessionID)
    if (msgId) {
      setStore((draft) => {
        const msgs = draft.messagesBySession[sessionID]
        if (msgs) {
          const msg = msgs.find((m) => m.id === msgId)
          if (msg) msg.interrupted = true
        }
        syncRef(sessionID, draft)
      })
    }
    assistantMsgId.current.delete(sessionID)
    setStore((draft) => { draft.streaming = false; draft.streamingSession = undefined })
    // Tell server to actually cancel the agent's prompt
    workspace.client.cancelPrompt(sessionID).catch(() => {})
    setTimeout(() => abortedSessions.current.delete(sessionID), 5000)
  }, [store.activeSession, workspace.client])

  // Connect on mount, disconnect on cleanup
  useEffect(() => {
    connect()
    return () => sseRef.current.disconnectAll()
  }, [connect])

  // Track disconnections so we can reload history after reconnect
  useEffect(() => {
    if (store.sseStatus !== 'connected') {
      hadDisconnect.current = true
    }
  }, [store.sseStatus])

  // Auto-reconnect when SSE permanently disconnects (2s delay to avoid thrashing)
  useEffect(() => {
    if (store.sseStatus === 'disconnected') {
      const timer = setTimeout(() => connect(), 2000)
      return () => clearTimeout(timer)
    }
  }, [store.sseStatus, connect])

  // Reload active session history after SSE reconnects to recover any missed cross-adapter events
  useEffect(() => {
    if (store.sseStatus === 'connected' && hadDisconnect.current) {
      hadDisconnect.current = false
      if (store.activeSession) {
        void loadHistory(store.activeSession)
        // Restore pending queue state
        if (workspace.client.getQueue) {
          workspace.client.getQueue(store.activeSession).then(queueState => {
            setStore(draft => {
              draft.pendingBySession[store.activeSession!] = queueState.pending.map(item => ({
                turnId: item.turnId ?? '',
                text: item.userPrompt,
                sender: null,
                timestamp: '',
              }))
            })
          }).catch(() => {
            // Queue endpoint may not exist on older Core
          })
        }
      }
    }
  }, [store.sseStatus, store.activeSession])

  const value = useMemo((): ChatContext => ({
    messages: () => store.messagesBySession[store.activeSession || ""] || [],
    pending: () => store.pendingBySession[store.activeSession || ""] || [],
    streaming: () => store.streaming,
    streamingSession: () => store.streamingSession,
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
