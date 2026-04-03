import React, { useMemo, useState, useEffect } from "react"
import { useChat } from "../../context/chat"
import { useSessions } from "../../context/sessions"
import { useAutoScroll } from "../../hooks/use-auto-scroll"
import { UserMessage } from "./user-message"
import { MessageTurn } from "./message-turn"
import { showToast } from "../../lib/toast"
import type { Message } from "../../types"

function ChatHeader({ onOpenReview }: { onOpenReview?: () => void }) {
  const chat = useChat()
  const sessions = useSessions()

  const session = useMemo(() => {
    const id = chat.activeSession()
    if (!id) return undefined
    return sessions.list().find((s) => s.id === id)
  }, [chat.activeSession(), sessions.list()])

  const title = session?.name || "Untitled"

  if (!chat.activeSession()) return null

  return (
    <div className="flex items-center h-11 px-4 border-b border-border-weaker-base flex-shrink-0">
      <div className="flex-1 min-w-0">
        <span className="text-14-medium text-text-strong truncate block">{title}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          className="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors"
          title="Review changes"
          onClick={() => onOpenReview?.()}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M3.33 4.17h13.34M3.33 8.33h8.34M3.33 12.5h13.34M3.33 16.67h8.34" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors" title="Context">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors" title="More options">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="4.5" cy="10" r="1.25" fill="currentColor" /><circle cx="10" cy="10" r="1.25" fill="currentColor" /><circle cx="15.5" cy="10" r="1.25" fill="currentColor" /></svg>
        </button>
      </div>
    </div>
  )
}

function EmptyState() {
  const chat = useChat()
  const sessions = useSessions()
  const hasSession = !!chat.activeSession()
  const [creating, setCreating] = useState(false)

  async function handleNewSession() {
    if (creating) return
    setCreating(true)
    try {
      const session = await sessions.create()
      if (session) {
        chat.setActiveSession(session.id)
      } else {
        showToast({ description: "Failed to create session. Max sessions may be reached.", variant: "error" })
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <div className="w-10 h-10 rounded-lg bg-surface-raised-base flex items-center justify-center border border-border-weaker-base">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.292 6.04167L16.2503 9.99998L12.292 13.9583M2.91699 9.99998H15.6253M17.0837 3.75V16.25" stroke="currentColor" strokeLinecap="square" className="text-text-weak" />
          </svg>
        </div>
        <div className="text-center">
          <div className="text-14-medium text-text-strong">
            {hasSession ? "Ready to chat" : "No session selected"}
          </div>
          <div className="text-13-regular text-text-weak mt-1">
            {hasSession ? "Type a message below to start" : "Create a new session or select one from the sidebar"}
          </div>
        </div>
        {!hasSession && (
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors active:scale-[0.98] disabled:opacity-50"
            onClick={handleNewSession}
            disabled={creating}
          >
            {creating ? (
              <div className="w-3.5 h-3.5 border-2 rounded-full oac-spinner" style={{ borderColor: "var(--text-weak)", borderTopColor: "transparent" }} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M10 4.16699V15.8337M4.16699 10.0003H15.8337" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
            {creating ? "Creating..." : "New Session"}
          </button>
        )}
      </div>
    </div>
  )
}

function ScrollToBottomButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  if (!visible) return null
  return (
    <div className="absolute bottom-4 left-1/2 z-10" style={{ transform: "translateX(-50%)" }}>
      <button
        className="flex items-center justify-center w-8 h-8 rounded-full border border-border-base text-text-base hover:text-text-strong transition-colors active:scale-95"
        style={{ background: "var(--surface-stronger-non-alpha, var(--background-stronger))", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
        onClick={onClick}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M5.83301 8.33366L9.99967 12.5003L14.1663 8.33366" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

export function ChatView({ onOpenReview }: { onOpenReview?: () => void }) {
  const chat = useChat()

  const autoScroll = useAutoScroll({
    working: chat.streaming(),
    bottomThreshold: 20,
  })

  // Force scroll to bottom when switching sessions
  useEffect(() => {
    autoScroll.forceScrollToBottom()
  }, [chat.activeSession()])

  const hasMessages = chat.activeSession() && chat.messages().length > 0

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      <ChatHeader onOpenReview={onOpenReview} />
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {hasMessages ? (
          <>
            <div
              ref={autoScroll.scrollRef}
              className="h-full overflow-y-auto no-scrollbar pt-3"
              onScroll={autoScroll.handleScroll}
            >
              <div
                ref={autoScroll.contentRef}
                className="px-6 md:max-w-200 md:mx-auto 2xl:max-w-[1000px] pb-32 flex flex-col"
                onClick={autoScroll.handleInteraction}
              >
                {(() => {
                  const messages = chat.messages()
                  const groups: { user: Message; assistants: Message[] }[] = []
                  let current: { user: Message; assistants: Message[] } | null = null

                  for (const msg of messages) {
                    if (msg.role === "user") {
                      current = { user: msg, assistants: [] }
                      groups.push(current)
                    } else if (current) {
                      current.assistants.push(msg)
                    } else {
                      // assistant without preceding user (edge case)
                      groups.push({ user: null as any, assistants: [msg] })
                    }
                  }

                  return groups.map((group, gi) => {
                    const isLastGroup = gi === groups.length - 1
                    if (!group.user) {
                      // Orphan assistant messages
                      return group.assistants.map((msg, ai) => (
                        <div key={msg.id} style={{ marginTop: gi === 0 && ai === 0 ? "0px" : "20px" }}>
                          <MessageTurn
                            message={msg}
                            streaming={chat.streaming() && isLastGroup && ai === group.assistants.length - 1}
                          />
                        </div>
                      ))
                    }
                    return (
                      <div key={group.user.id} style={{ marginTop: gi === 0 ? "0px" : "28px" }}>
                        <div className="oac-sticky-user" style={{ position: "sticky", top: 0, zIndex: 2, paddingBottom: 12 }}>
                          <UserMessage message={group.user} />
                        </div>
                        {group.assistants.map((msg, ai) => (
                          <div key={msg.id} style={{ marginTop: "20px" }}>
                            <MessageTurn
                              message={msg}
                              streaming={chat.streaming() && isLastGroup && ai === group.assistants.length - 1}
                            />
                          </div>
                        ))}
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
            <ScrollToBottomButton
              visible={autoScroll.userScrolled()}
              onClick={() => autoScroll.resume()}
            />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}
