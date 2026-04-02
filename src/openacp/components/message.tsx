import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js"
import { createPacedValue } from "../hooks/create-paced-value"
import { Markdown } from "../../ui/src/components/markdown"
import { BasicTool } from "../../ui/src/components/basic-tool"
import { TextShimmer } from "../../ui/src/components/text-shimmer"
import type { Message, MessagePart, TextPart, ThinkingPart, ToolCallPart } from "../types"

// ── Tool helpers ────────────────────────────────────────────────────────────

function toolLabel(input?: Record<string, unknown>): string | undefined {
  const keys = ["description", "file_path", "filePath", "path", "pattern", "command", "query", "url", "name"]
  for (const key of keys) {
    const val = input?.[key]
    if (typeof val === "string" && val.length > 0) return val
  }
}

function toolArgs(input?: Record<string, unknown>): string[] {
  if (!input) return []
  const skip = new Set(["description", "file_path", "filePath", "path", "pattern", "command", "query", "url", "name", "content", "new_string", "old_string"])
  return Object.entries(input)
    .filter(([key]) => !skip.has(key))
    .flatMap(([key, value]) => {
      if (typeof value === "string") return [`${key}=${value}`]
      if (typeof value === "number") return [`${key}=${value}`]
      if (typeof value === "boolean") return [`${key}=${value}`]
      return []
    })
    .slice(0, 3)
}

// ── Status dot ──────────────────────────────────────────────────────────────

type DotVariant = "normal" | "success" | "error"

function StatusDot(props: { variant?: DotVariant; pulse?: boolean }) {
  const color = () => {
    switch (props.variant) {
      case "success": return "rgba(45, 186, 38, 0.6)"
      case "error": return "var(--surface-critical-strong)"
      default: return "var(--text-weaker)"
    }
  }

  return (
    <div
      class="w-[7px] h-[7px] rounded-full flex-shrink-0"
      classList={{ "animate-pulse": props.pulse }}
      style={{ background: color() }}
    />
  )
}

// ── Copy button ─────────────────────────────────────────────────────────────

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
    <button
      class="oac-copy-btn"
      onClick={handleCopy}
      aria-label={copied() ? "Copied" : "Copy"}
      title={copied() ? "Copied" : "Copy"}
    >
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

// ── Time formatting ─────────────────────────────────────────────────────────

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase()
}

// ── Part Renderers ──────────────────────────────────────────────────────────

function TextPartView(props: { part: TextPart; streaming?: boolean }) {
  const pacedText = createPacedValue(
    () => props.part.content,
    () => props.streaming ?? false,
  )

  return (
    <div class="flex gap-2.5 items-start">
      <div class="mt-[9px] flex-shrink-0">
        <StatusDot variant="normal" />
      </div>
      <div class="min-w-0 flex-1">
        <Markdown
          text={pacedText()}
          cacheKey={props.part.id}
          streaming={props.streaming}
        />
        <div class="mt-1">
          <CopyButton text={props.part.content} />
        </div>
      </div>
    </div>
  )
}

function ThinkingPartView(props: { part: ThinkingPart; streaming?: boolean }) {
  return (
    <div class="flex gap-2.5 items-center h-8">
      <div class="flex-shrink-0">
        <StatusDot variant="normal" pulse={props.streaming} />
      </div>
      <span class="text-14-regular text-text-weak">Thinking</span>
    </div>
  )
}

function ToolCallPartView(props: { part: ToolCallPart }) {
  const label = createMemo(() => toolLabel(props.part.input))
  const args = createMemo(() => toolArgs(props.part.input))
  const isPending = createMemo(() => props.part.status === "pending" || props.part.status === "running")
  const isError = createMemo(() => props.part.status === "error")
  const dotVariant = createMemo((): DotVariant => {
    if (isError()) return "error"
    if (isPending()) return "normal"
    return "success"
  })

  return (
    <div class="flex gap-2.5 items-start">
      <div class="mt-[12px] flex-shrink-0">
        <StatusDot variant={dotVariant()} pulse={isPending()} />
      </div>
      <div class="min-w-0 flex-1">
        <BasicTool
          icon="mcp"
          status={props.part.status}
          trigger={{
            title: props.part.name,
            subtitle: label(),
            args: args(),
          }}
          animated
          hideDetails={!props.part.output}
          defer
        >
          <Show when={props.part.output}>
            <div class="oac-tool-output">
              <pre class="oac-tool-output-pre">{props.part.output}</pre>
            </div>
          </Show>
        </BasicTool>
      </div>
    </div>
  )
}

// ── User Message ────────────────────────────────────────────────────────────

function UserMessage(props: { message: Message }) {
  const timeStr = createMemo(() => formatTime(props.message.createdAt))

  return (
    <div
      data-component="oac-user-message"
      class="sticky top-0 z-10 rounded-md border border-border-base bg-background-stronger shadow-sm"
      style={{ padding: "8px 12px" }}
    >
      <div class="text-14-regular text-text-strong whitespace-pre-wrap break-words leading-relaxed">
        {getUserText(props.message)}
      </div>

      <div class="flex items-center justify-content gap-2 mt-1" style={{ "justify-content": "flex-end" }}>
        <span class="text-12-regular text-text-weak select-none">{timeStr()}</span>
        <CopyButton text={getUserText(props.message)} />
      </div>
    </div>
  )
}

// ── Assistant Message ───────────────────────────────────────────────────────

function AssistantMessage(props: { message: Message; streaming?: boolean }) {
  const isEmpty = () => props.message.parts.length === 0

  return (
    <div data-component="oac-assistant-message" class="px-1">
      <Show when={!isEmpty()} fallback={
        <Show when={props.streaming}>
          <div class="flex gap-2.5 items-center h-8">
            <StatusDot variant="normal" pulse />
            <TextShimmer text="Thinking" active class="text-14-regular text-text-weak" />
          </div>
        </Show>
      }>
        <div class="flex flex-col" style={{ gap: "16px" }}>
          <For each={props.message.parts}>
            {(part, index) => (
              <PartRenderer
                part={part}
                streaming={props.streaming && index() === props.message.parts.length - 1}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

// ── Entry ───────────────────────────────────────────────────────────────────

export function MessageBubble(props: { message: Message; streaming?: boolean; isFirst?: boolean }) {
  const isUser = () => props.message.role === "user"

  return (
    <>
      <Show when={!props.isFirst}>
        <div style={{ height: isUser() ? "28px" : "14px" }} />
      </Show>
      <Show when={isUser()} fallback={
        <AssistantMessage message={props.message} streaming={props.streaming} />
      }>
        <UserMessage message={props.message} />
      </Show>
    </>
  )
}

function PartRenderer(props: { part: MessagePart; streaming?: boolean }) {
  return (
    <Switch>
      <Match when={props.part.type === "text"}>
        <TextPartView part={props.part as TextPart} streaming={props.streaming} />
      </Match>
      <Match when={props.part.type === "thinking"}>
        <ThinkingPartView part={props.part as ThinkingPart} streaming={props.streaming} />
      </Match>
      <Match when={props.part.type === "tool_call"}>
        <ToolCallPartView part={props.part as ToolCallPart} />
      </Match>
    </Switch>
  )
}

function getUserText(msg: Message): string {
  return msg.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.content)
    .join("\n")
}
