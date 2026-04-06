import React, { memo, useRef, useEffect } from "react"
import * as charStream from "../../../lib/char-stream"
import type { ThinkingBlock } from "../../../types"

interface ThinkingBlockProps {
  block: ThinkingBlock
  sessionID?: string
}

export const ThinkingBlockView = memo(function ThinkingBlockView({ block, sessionID }: ThinkingBlockProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  // During streaming: subscribe CharStream and write directly to DOM
  useEffect(() => {
    if (!block.isStreaming || !sessionID) return
    const unsub = charStream.subscribeDisplay(`${sessionID}:thought`, (displayText) => {
      if (contentRef.current) {
        contentRef.current.textContent = displayText
      }
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

  const hasContent = !!block.content?.trim()

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
      <div ref={contentRef} className="oac-thinking-content">
        {/* During streaming: contentRef written directly by CharStream subscription */}
        {/* After streaming: block.content rendered normally */}
        {!block.isStreaming ? block.content : null}
      </div>
    </details>
  )
})
