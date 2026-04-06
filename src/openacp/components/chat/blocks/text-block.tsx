import React, { memo } from "react"
import { Markdown } from "../../ui/markdown"
import type { TextBlock } from "../../../types"

interface TextBlockProps {
  block: TextBlock
  streaming?: boolean
  sessionID?: string
}

export const TextBlockView = memo(function TextBlockView({ block, streaming, sessionID }: TextBlockProps) {
  const text = block.content.replace(/^\n+/, "")

  return (
    <div className="min-w-0">
      <Markdown
        text={text}
        cacheKey={block.id}
        streamId={streaming && sessionID ? `${sessionID}:text` : undefined}
        streaming={streaming}
      />
    </div>
  )
})
