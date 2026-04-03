import React, { useState, useMemo } from "react"
import { TextShimmer } from "../../ui/text-shimmer"
import { kindIcon, kindLabel, formatToolInput } from "../block-utils"
import type { ToolBlock } from "../../../types"

interface ToolBlockProps {
  block: ToolBlock
}

export function ToolBlockView({ block }: ToolBlockProps) {
  const [expanded, setExpanded] = useState(true)
  const isPending = block.status === "pending" || block.status === "running"

  const icon = useMemo(() => kindIcon(block.kind), [block.kind])
  const label = useMemo(() => kindLabel(block.kind), [block.kind])
  const inputText = useMemo(() => formatToolInput(block.input), [block.input])
  const hasBody = !!inputText || !!block.output

  return (
    <div>
      <div
        className={`oac-tool-card-title${isPending ? " oac-tool-card-shimmer" : ""}`}
        onClick={() => hasBody && setExpanded(!expanded)}
      >
        <span>{icon}</span>
        <span style={{ fontWeight: "500" }}>{label}</span>
        <span style={{ color: "var(--text-weak)" }}>{block.title}</span>
        {block.diffStats && (
          <>
            {block.diffStats.added > 0 && (
              <span className="oac-diff-stat-add">+{block.diffStats.added}</span>
            )}
            {block.diffStats.removed > 0 && (
              <span className="oac-diff-stat-del">-{block.diffStats.removed}</span>
            )}
          </>
        )}
        {isPending && <TextShimmer text="" active className="" />}
      </div>

      {hasBody && (
        <div className={`oac-tool-card-collapse ${expanded ? "oac-tool-card-collapse--open" : ""}`}>
          <div className="oac-tool-card-body">
            <div className="oac-tool-card-grid">
              {inputText && (
                <div className="oac-tool-card-row">
                  <div className="oac-tool-card-row-label">IN</div>
                  <div className="oac-tool-card-row-content">{inputText}</div>
                </div>
              )}
              {block.output && (
                <div className="oac-tool-card-row">
                  <div className="oac-tool-card-row-label">OUT</div>
                  <div className="oac-tool-card-row-content">{block.output}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
