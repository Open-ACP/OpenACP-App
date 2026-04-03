import type { ErrorBlock } from "../../../types"

interface ErrorBlockProps {
  block: ErrorBlock
}

export function ErrorBlockView(props: ErrorBlockProps) {
  return (
    <div style={{ color: "var(--surface-critical-strong)", "font-size": "13px" }}>
      <strong>Error:</strong> {props.block.content}
    </div>
  )
}
