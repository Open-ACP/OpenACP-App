import React from "react"
import { Markdown } from "../../ui/markdown"
import { usePacedValue } from "../../../hooks/use-paced-value"
import type { TextBlock } from "../../../types"

interface TextBlockProps {
  block: TextBlock
  streaming?: boolean
}

export function TextBlockView({ block, streaming }: TextBlockProps) {
  const pacedText = usePacedValue(block.content, streaming ?? false)
  const trimmedText = pacedText.replace(/^\n+/, "")

  return (
    <div className="min-w-0">
      <Markdown
        text={trimmedText}
        cacheKey={block.id}
        streaming={streaming}
      />
    </div>
  )
}
