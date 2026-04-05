import React, { memo } from "react"
import type { ErrorBlock } from "../../../types"

interface ErrorBlockProps {
  block: ErrorBlock
}

export const ErrorBlockView = memo(function ErrorBlockView({ block }: ErrorBlockProps) {
  return (
    <div style={{ color: "var(--surface-critical-strong)", fontSize: "13px" }}>
      <strong>Error:</strong> {block.content}
    </div>
  )
})
