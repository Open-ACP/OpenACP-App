import React, { memo, useState, useEffect, useRef } from "react"
import { Markdown } from "../../ui/markdown"
import type { ThinkingBlock } from "../../../types"

interface ThinkingBlockProps {
  block: ThinkingBlock
  sessionID?: string
}

export const ThinkingBlockView = memo(function ThinkingBlockView({ block, sessionID }: ThinkingBlockProps) {
  // Default open during streaming so content is visible as it streams in.
  // After streaming ends, collapses automatically unless user manually toggled it.
  const [open, setOpen] = useState(block.isStreaming)
  const userToggledRef = useRef(false)

  useEffect(() => {
    if (block.isStreaming) {
      // New streaming session — reset toggle tracking and open
      userToggledRef.current = false
      setOpen(true)
    } else {
      // Streaming ended — collapse unless user explicitly toggled during streaming
      if (!userToggledRef.current) {
        setOpen(false)
      }
    }
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
      onToggle={(e) => {
        userToggledRef.current = true
        setOpen((e.currentTarget as HTMLDetailsElement).open)
      }}
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
