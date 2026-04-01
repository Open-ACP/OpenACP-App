import { For, Show, createEffect } from "solid-js"
import { useChat } from "../context/chat"
import { MessageBubble } from "./message"

export function ChatView() {
  const chat = useChat()
  let scrollRef: HTMLDivElement | undefined

  // Auto-scroll to bottom when new messages arrive
  createEffect(() => {
    const msgs = chat.messages()
    if (msgs.length && scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight
      })
    }
  })

  return (
    <div class="flex-1 min-h-0 overflow-hidden">
      <Show
        when={chat.activeSession() && chat.messages().length > 0}
        fallback={
          <div class="h-full flex flex-col items-center justify-center gap-4">
            <div class="text-center">
              <div class="text-16-medium text-text-strong mb-1">OpenACP</div>
              <div class="text-14-regular text-text-weak">
                <Show when={chat.activeSession()} fallback="Start a conversation">
                  Send a message to begin
                </Show>
              </div>
            </div>
          </div>
        }
      >
        <div
          ref={scrollRef}
          class="h-full overflow-y-auto no-scrollbar"
        >
          <div class="md:max-w-200 md:mx-auto 2xl:max-w-[1000px] py-6">
            <For each={chat.messages()}>
              {(msg) => <MessageBubble message={msg} />}
            </For>
          </div>
        </div>
      </Show>
    </div>
  )
}
