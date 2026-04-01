import { Show } from "solid-js"
import type { Message } from "../types"

export function MessageBubble(props: { message: Message; streaming?: boolean }) {
  const isUser = () => props.message.role === "user"
  const isEmpty = () => !props.message.content

  return (
    <div
      data-component="message"
      data-role={props.message.role}
      class="px-4 py-3"
    >
      <Show when={isUser()}>
        <div class="text-14-regular text-text-strong whitespace-pre-wrap break-words">
          {props.message.content}
        </div>
      </Show>

      <Show when={!isUser()}>
        <Show when={!isEmpty()} fallback={
          <div class="text-14-regular text-text-weak animate-pulse">Thinking...</div>
        }>
          <div class="text-14-regular text-text-base whitespace-pre-wrap break-words">
            {props.message.content}
          </div>
        </Show>
      </Show>
    </div>
  )
}
