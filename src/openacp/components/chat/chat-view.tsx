import { For, Show, createMemo, createSignal, createEffect, on } from "solid-js"
import { useChat } from "../../context/chat"
import { useSessions } from "../../context/sessions"
import { createAutoScroll } from "../../../ui/src/hooks/create-auto-scroll"
import { UserMessage } from "./user-message"
import { MessageTurn } from "./message-turn"

function ChatHeader(props: { onOpenReview?: () => void }) {
  const chat = useChat()
  const sessions = useSessions()

  const session = createMemo(() => {
    const id = chat.activeSession()
    if (!id) return undefined
    return sessions.list().find((s) => s.id === id)
  })

  const title = createMemo(() => session()?.name || "Untitled")

  return (
    <Show when={chat.activeSession()}>
      <div class="flex items-center h-11 px-4 border-b border-border-weaker-base flex-shrink-0">
        <div class="flex-1 min-w-0">
          <span class="text-14-medium text-text-strong truncate block">{title()}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            class="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors"
            title="Review changes"
            onClick={() => props.onOpenReview?.()}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M3.33 4.17h13.34M3.33 8.33h8.34M3.33 12.5h13.34M3.33 16.67h8.34" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
            </svg>
          </button>
          <button
            class="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors"
            title="Context"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>
          <button
            class="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors"
            title="More options"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="4.5" cy="10" r="1.25" fill="currentColor" />
              <circle cx="10" cy="10" r="1.25" fill="currentColor" />
              <circle cx="15.5" cy="10" r="1.25" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </Show>
  )
}

function EmptyState() {
  const chat = useChat()
  const sessions = useSessions()

  const hasSession = () => !!chat.activeSession()
  const [creating, setCreating] = createSignal(false)

  async function handleNewSession() {
    if (creating()) return
    setCreating(true)
    try {
      const session = await sessions.create()
      if (session) {
        chat.setActiveSession(session.id)
      } else {
        const { showToast } = await import("../../../ui/src/components/toast")
        showToast({ description: "Failed to create session. Max sessions may be reached.", variant: "error" })
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div class="h-full flex flex-col items-center justify-center">
      <div class="flex flex-col items-center gap-5">
        <div class="w-10 h-10 rounded-lg bg-surface-raised-base flex items-center justify-center border border-border-weaker-base">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.292 6.04167L16.2503 9.99998L12.292 13.9583M2.91699 9.99998H15.6253M17.0837 3.75V16.25" stroke="currentColor" stroke-linecap="square" class="text-text-weak" />
          </svg>
        </div>

        <div class="text-center">
          <div class="text-14-medium text-text-strong">
            <Show when={hasSession()} fallback="No session selected">
              Ready to chat
            </Show>
          </div>
          <div class="text-13-regular text-text-weak mt-1">
            <Show when={hasSession()} fallback="Create a new session or select one from the sidebar">
              Type a message below to start
            </Show>
          </div>
        </div>

        <Show when={!hasSession()}>
          <button
            class="flex items-center gap-2 px-4 py-2 rounded-lg border border-border-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors active:scale-[0.98] disabled:opacity-50"
            onClick={handleNewSession}
            disabled={creating()}
          >
            <Show when={creating()} fallback={
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M10 4.16699V15.8337M4.16699 10.0003H15.8337" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            }>
              <div class="w-3.5 h-3.5 border-2 rounded-full oac-spinner" style={{ "border-color": "var(--text-weak)", "border-top-color": "transparent" }} />
            </Show>
            <Show when={creating()} fallback="New Session">
              Creating...
            </Show>
          </button>
        </Show>
      </div>
    </div>
  )
}

function ScrollToBottomButton(props: { visible: boolean; onClick: () => void }) {
  return (
    <Show when={props.visible}>
      <div class="absolute bottom-4 left-1/2 z-10" style={{ transform: "translateX(-50%)" }}>
        <button
          class="flex items-center justify-center w-8 h-8 rounded-full border border-border-base text-text-base hover:text-text-strong transition-colors active:scale-95"
          style={{ background: "var(--surface-stronger-non-alpha, var(--background-stronger))", "box-shadow": "0 2px 8px rgba(0,0,0,0.15)" }}
          onClick={props.onClick}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M5.83301 8.33366L9.99967 12.5003L14.1663 8.33366" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </Show>
  )
}

export function ChatView(props: { onOpenReview?: () => void }) {
  const chat = useChat()

  const autoScroll = createAutoScroll({
    working: () => chat.streaming(),
    bottomThreshold: 20,
  })

  // Force scroll to bottom when switching sessions
  createEffect(on(() => chat.activeSession(), () => {
    autoScroll.forceScrollToBottom()
  }))

  const hasMessages = () => chat.activeSession() && chat.messages().length > 0

  return (
    <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
      <ChatHeader onOpenReview={props.onOpenReview} />
      <div class="flex-1 min-h-0 overflow-hidden relative">
        <Show
          when={hasMessages()}
          fallback={<EmptyState />}
        >
          <div
            ref={autoScroll.scrollRef}
            class="h-full overflow-y-auto no-scrollbar pt-3"
            onScroll={autoScroll.handleScroll}
          >
            <div
              ref={autoScroll.contentRef}
              class="px-4 md:max-w-200 md:mx-auto 2xl:max-w-[1000px] pb-32 flex flex-col"
              onClick={autoScroll.handleInteraction}
            >
              <For each={chat.messages()}>
                {(msg, index) => {
                  const isLast = () => index() === chat.messages().length - 1
                  return msg.role === "user" ? (
                    <UserMessage message={msg} />
                  ) : (
                    <MessageTurn
                      message={msg}
                      streaming={chat.streaming() && isLast()}
                    />
                  )
                }}
              </For>
            </div>
          </div>

          <ScrollToBottomButton
            visible={autoScroll.userScrolled()}
            onClick={() => autoScroll.resume()}
          />
        </Show>
      </div>
    </div>
  )
}
