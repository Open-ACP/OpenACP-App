import React, { memo } from "react"
import type { ErrorBlock } from "../../../types"

interface ErrorBlockProps {
  block: ErrorBlock
}

export const ErrorBlockView = memo(function ErrorBlockView({ block }: ErrorBlockProps) {
  return (
    <div style={{ color: "var(--destructive)", fontSize: "13px" }}>
      <strong>Error:</strong> {block.content}
    </div>
  )
})
