import { Markdown } from "../../../../ui/src/components/markdown"
import { createPacedValue } from "../../../hooks/create-paced-value"
import type { TextBlock } from "../../../types"

interface TextBlockProps {
  block: TextBlock
  streaming?: boolean
}

export function TextBlockView(props: TextBlockProps) {
  const pacedText = createPacedValue(
    () => props.block.content,
    () => props.streaming ?? false,
  )

  return (
    <div class="min-w-0">
      <Markdown
        text={pacedText()}
        cacheKey={props.block.id}
        streaming={props.streaming}
      />
    </div>
  )
}
