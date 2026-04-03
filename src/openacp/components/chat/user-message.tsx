import { createMemo, createSignal, Show } from "solid-js"
import type { Message, TextBlock, TextPart } from "../../types"

function formatTime(timestamp: number): string {
  return new Date(timestamp)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase()
}

function CopyButton(props: { text: string }) {
  const [copied, setCopied] = createSignal(false)

  async function handleCopy(e: MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(props.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <button class="oac-copy-btn" onClick={handleCopy} title={copied() ? "Copied" : "Copy"}>
      <Show when={copied()} fallback={
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z" stroke="currentColor" stroke-linecap="round"/>
        </svg>
      }>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-linecap="square"/>
        </svg>
      </Show>
    </button>
  )
}

function getUserText(msg: Message): string {
  if (msg.blocks?.length > 0) {
    return msg.blocks
      .filter((b): b is TextBlock => b.type === "text")
      .map((b) => b.content)
      .join("\n")
  }
  return msg.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.content)
    .join("\n")
}

export function UserMessage(props: { message: Message }) {
  const timeStr = createMemo(() => formatTime(props.message.createdAt))
  const text = createMemo(() => getUserText(props.message))

  return (
    <div
      data-component="oac-user-message"
      class="sticky top-0 z-10 rounded-md border border-border-base bg-background-stronger shadow-sm"
      style={{ padding: "8px 12px" }}
    >
      <div class="text-14-regular text-text-strong whitespace-pre-wrap break-words leading-relaxed">
        {text()}
      </div>
      <div class="flex items-center gap-2 mt-1" style={{ "justify-content": "flex-end" }}>
        <span class="text-12-regular text-text-weak select-none">{timeStr()}</span>
        <CopyButton text={text()} />
      </div>
    </div>
  )
}
