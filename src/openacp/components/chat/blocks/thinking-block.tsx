import React, { memo, useState, useEffect } from "react"
import { Markdown } from "../../ui/markdown"
import type { ThinkingBlock } from "../../../types"

interface ThinkingBlockProps {
  block: ThinkingBlock
  sessionID?: string
}

export const ThinkingBlockView = memo(function ThinkingBlockView({ block, sessionID }: ThinkingBlockProps) {
  // Default open during streaming so content is visible as it streams in.
  // After streaming ends, stays in whatever state the user left it.
  const [open, setOpen] = useState(block.isStreaming)

  // Auto-open when a new streaming session starts
  useEffect(() => {
    if (block.isStreaming) setOpen(true)
  }, [block.isStreaming])

  const summaryText = (() => {
    if (block.isStreaming) return "Thinking..."
    if (block.durationMs !== null) {
      const seconds = Math.round(block.durationMs / 1000)
      return `Thought for ${seconds}s`
    }
    return "Thinking"
  })()

  // streamId lets Markdown subscribe to charStream directly, same pattern as TextBlockView.
  // Without streamId, Markdown ignores streaming=true and renders nothing (all effects skip).
  const streamId = block.isStreaming && sessionID ? `${sessionID}:thought` : undefined

  const hasContent = !!block.content?.trim()

  if (!hasContent && !block.isStreaming) {
    return (
      <div style={{ fontStyle: "italic", fontSize: "12px", color: "var(--muted-foreground)" }}>
        {summaryText}
      </div>
    )
  }

  return (
    <details
      className="oac-thinking"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <span>{summaryText}</span>
        <span className="oac-thinking-chevron">&#9654;</span>
      </summary>
      <div className="oac-thinking-content">
        <Markdown
          text={block.content || ""}
          cacheKey={block.isStreaming ? undefined : block.id}
          streamId={streamId}
          streaming={block.isStreaming}
          noGate
        />
      </div>
    </details>
  )
})
