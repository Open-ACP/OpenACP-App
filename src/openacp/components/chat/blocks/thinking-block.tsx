import React, { memo, useState, useRef, useEffect } from "react"
import { Markdown } from "../../ui/markdown"
import * as charStream from "../../../lib/char-stream"
import type { ThinkingBlock } from "../../../types"

interface ThinkingBlockProps {
  block: ThinkingBlock
  sessionID?: string
}

export const ThinkingBlockView = memo(function ThinkingBlockView({ block, sessionID }: ThinkingBlockProps) {
  const [streamText, setStreamText] = useState("")

  // During streaming: subscribe CharStream
  useEffect(() => {
    if (!block.isStreaming || !sessionID) return
    const unsub = charStream.subscribeDisplay(`${sessionID}:thought`, (displayText) => {
      setStreamText(displayText)
    })
    return unsub
  }, [block.isStreaming, sessionID])

  const summaryText = (() => {
    if (block.isStreaming) return "Thinking..."
    if (block.durationMs !== null) {
      const seconds = Math.round(block.durationMs / 1000)
      return `Thought for ${seconds}s`
    }
    return "Thinking"
  })()

  const content = block.isStreaming ? streamText : block.content
  const hasContent = !!content?.trim()

  if (!hasContent && !block.isStreaming) {
    return (
      <div style={{ fontStyle: "italic", fontSize: "12px", color: "var(--muted-foreground)" }}>
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
        <Markdown
          text={content || ""}
          cacheKey={block.isStreaming ? undefined : block.id}
          streaming={block.isStreaming}
        />
      </div>
    </details>
  )
})
