import React from "react"
import type { ThinkingBlock } from "../../../types"

interface ThinkingBlockProps {
  block: ThinkingBlock
}

export function ThinkingBlockView({ block }: ThinkingBlockProps) {
  const summaryText = (() => {
    if (block.isStreaming) return "Thinking..."
    if (block.durationMs !== null) {
      const seconds = Math.round(block.durationMs / 1000)
      return `Thought for ${seconds}s`
    }
    return "Thinking"
  })()

  const hasContent = !!block.content?.trim()

  if (!hasContent) {
    return (
      <div style={{ fontStyle: "italic", fontSize: "12px", color: "var(--text-weak)" }}>
        {summaryText}
      </div>
    )
  }

  return (
    <details className="oac-thinking">
      <summary>
        <span>{summaryText}</span>
        <span className="oac-thinking-chevron">&#9654;</span>
      </summary>
      <div className="oac-thinking-content">
        {block.content}
      </div>
    </details>
  )
}
