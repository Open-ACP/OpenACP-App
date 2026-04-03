import { Show } from "solid-js"
import type { ThinkingBlock } from "../../../types"

interface ThinkingBlockProps {
  block: ThinkingBlock
}

export function ThinkingBlockView(props: ThinkingBlockProps) {
  const summaryText = () => {
    if (props.block.isStreaming) return "Thinking..."
    if (props.block.durationMs !== null) {
      const seconds = Math.round(props.block.durationMs / 1000)
      return `Thought for ${seconds}s`
    }
    return "Thinking"
  }

  const hasContent = () => !!props.block.content?.trim()

  return (
    <Show
      when={hasContent()}
      fallback={
        <div style={{ "font-style": "italic", "font-size": "12px", color: "var(--text-weak)" }}>
          {summaryText()}
        </div>
      }
    >
      <details class="oac-thinking">
        <summary>
          <span>{summaryText()}</span>
          <span class="oac-thinking-chevron">▶</span>
        </summary>
        <div class="oac-thinking-content">
          {props.block.content}
        </div>
      </details>
    </Show>
  )
}
