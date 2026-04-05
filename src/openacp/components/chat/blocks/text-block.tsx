import React, { memo } from "react"
import { Markdown } from "../../ui/markdown"
import type { TextBlock } from "../../../types"

interface TextBlockProps {
  block: TextBlock
  streaming?: boolean
}

export const TextBlockView = memo(function TextBlockView({ block, streaming }: TextBlockProps) {
  const text = block.content.replace(/^\n+/, "")

  return (
    <div className="min-w-0">
      <Markdown
        text={text}
        cacheKey={block.id}
        streaming={streaming}
      />
    </div>
  )
})
