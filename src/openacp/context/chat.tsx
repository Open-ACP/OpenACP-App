import { createContext, useContext, onCleanup, onMount, type ParentProps } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useWorkspace } from "./workspace"
import { useSessions } from "./sessions"
import { createSSEManager } from "../api/sse"
import type { AgentEvent, Message } from "../types"

interface ChatContext {
  /** Messages for active session */
  messages: () => Message[]
  /** Is assistant currently streaming */
  streaming: () => boolean
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
}

const Ctx = createContext<ChatContext>()

export function useChat() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useChat must be used within ChatProvider")
  return ctx
}

export function ChatProvider(props: ParentProps) {
  const workspace = useWorkspace()
  const sessions = useSessions()
  const sse = createSSEManager()

  const [store, setStore] = createStore({
    // sessionID → messages
    messagesBySession: {} as Record<string, Message[]>,
    activeSession: undefined as string | undefined,
    streaming: false,
  })

  // Track accumulated text per session for streaming
  const abortedSessions = new Set<string>()
  const textAccum = new Map<string, string>()
  // Track assistant message/part IDs per session
  const assistantState = new Map<string, { msgId: string; partId: string; parentId?: string }>()
  // Message ID counter
  let msgCounter = 0

  function nextMsgId() {
    return `msg-${Date.now()}-${++msgCounter}`
  }

  function addMessage(sessionID: string, msg: Message) {
    setStore("messagesBySession", sessionID, (prev) => {
      const msgs = prev || []
      return [...msgs, msg]
    })
  }

  function updateLastAssistantContent(sessionID: string, content: string) {
    setStore("messagesBySession", sessionID, produce((msgs) => {
      if (!msgs) return
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs[i].content = content
          break
        }
      }
    }))
  }

  function handleAgentEvent(event: AgentEvent) {
    const sessionID = event.sessionId
    if (!sessionID) return
    if (abortedSessions.has(sessionID)) return

    const evt = event.event
    const type = evt.type
    const content = evt.content || ""

    // Get or create assistant state for this session
    let state = assistantState.get(sessionID)
    if (!state && type === "text") {
      // First text event — create assistant message
      const msgId = nextMsgId()
      state = { msgId, partId: `${msgId}-part` }
      assistantState.set(sessionID, state)

      addMessage(sessionID, {
        id: msgId,
        role: "assistant",
        sessionID,
        content: "",
        createdAt: Date.now(),
        parentID: state.parentId,
      })
      setStore("streaming", true)
    }

    if (!state) return

    switch (type) {
      case "text": {
        const prev = textAccum.get(sessionID) ?? ""
        const next = prev + content
        textAccum.set(sessionID, next)
        updateLastAssistantContent(sessionID, next)
        break
      }
      case "usage": {
        // Response complete — refresh session list to pick up renamed session
        textAccum.delete(sessionID)
        assistantState.delete(sessionID)
        setStore("streaming", false)
        void sessions.refresh()
        break
      }
      case "error": {
        // Append error to message
        const prev = textAccum.get(sessionID) ?? ""
        updateLastAssistantContent(sessionID, prev + `\n\n**Error:** ${content}`)
        textAccum.delete(sessionID)
        assistantState.delete(sessionID)
        setStore("streaming", false)
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
      // Auto-create session
      const session = await sessions.create()
      if (!session) return false
      sessionID = session.id
      setStore("activeSession", sessionID)
    }

    // Add optimistic user message
    const userMsgId = nextMsgId()
    addMessage(sessionID, {
      id: userMsgId,
      role: "user",
      sessionID,
      content: text,
      createdAt: Date.now(),
    })

    // Create assistant message placeholder (SSE will fill content)
    const astMsgId = nextMsgId()
    assistantState.set(sessionID, {
      msgId: astMsgId,
      partId: `part-${Date.now()}`,
      parentId: userMsgId,
    })
    addMessage(sessionID, {
      id: astMsgId,
      role: "assistant",
      sessionID,
      content: "",
      createdAt: Date.now(),
      parentID: userMsgId,
    })
    setStore("streaming", true)

    // Ensure SSE connected
    connect()

    try {
      await workspace.client.sendPrompt(sessionID, text)
      return true
    } catch {
      return false
    }
  }

  // Connect SSE on mount
  onMount(() => connect())

  onCleanup(() => {
    sse.disconnectAll()
  })

  function abort() {
    const sessionID = store.activeSession
    if (!sessionID) return
    // Ignore further SSE events for this session
    abortedSessions.add(sessionID)
    textAccum.delete(sessionID)
    assistantState.delete(sessionID)
    setStore("streaming", false)
    // Clear aborted flag after a delay (allow new prompts)
    setTimeout(() => abortedSessions.delete(sessionID), 2000)
  }

  const value: ChatContext = {
    messages: () => store.messagesBySession[store.activeSession || ""] || [],
    streaming: () => store.streaming,
    activeSession: () => store.activeSession,
    setActiveSession: (id: string) => setStore("activeSession", id),
    sendPrompt,
    abort,
    connect,
  }

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
