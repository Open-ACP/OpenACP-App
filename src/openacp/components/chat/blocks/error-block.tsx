import React from "react"
import type { ErrorBlock } from "../../../types"

interface ErrorBlockProps {
  block: ErrorBlock
}

export function ErrorBlockView({ block }: ErrorBlockProps) {
  return (
    <div style={{ color: "var(--surface-critical-strong)", fontSize: "13px" }}>
      <strong>Error:</strong> {block.content}
    </div>
  )
}
