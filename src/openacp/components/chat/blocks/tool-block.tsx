import React, { memo, useState, useMemo } from "react"
import { motion } from "motion/react"
import { TextShimmer } from "../../ui/text-shimmer"
import { kindIcon, kindLabel, formatToolInput } from "../block-utils"
import type { ToolBlock } from "../../../types"

const REJECTION_PATTERNS = [
  "user doesn't want to proceed",
  "tool use was rejected",
  "User refused permission",
]

function isRejectionOutput(output: string | null): boolean {
  if (!output) return false
  return REJECTION_PATTERNS.some((p) => output.includes(p))
}

interface ToolBlockProps {
  block: ToolBlock
  feedbackReason?: string
}

export const ToolBlockView = memo(function ToolBlockView({ block, feedbackReason }: ToolBlockProps) {
  const [expanded, setExpanded] = useState(true)
  const isPending = block.status === "pending" || block.status === "running"
  const isRejected = isRejectionOutput(block.output)

  const icon = useMemo(() => kindIcon(block.kind), [block.kind])
  const label = useMemo(() => kindLabel(block.kind), [block.kind])
  const inputText = useMemo(() => formatToolInput(block.input), [block.input])
  const reason = feedbackReason && isRejected ? feedbackReason : undefined
  const hasBody = !!inputText || (!!block.output && !isRejected) || !!reason

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div
        className={`oac-tool-card-title${isPending ? " oac-tool-card-shimmer" : ""}`}
        onClick={() => hasBody && setExpanded(!expanded)}
      >
        <span>{icon}</span>
        <span style={{ fontWeight: "500" }}>{label}</span>
        <span style={{ color: isRejected ? "var(--text-critical-base, #dc2626)" : "var(--text-weak)" }}>
          {isRejected ? block.title : block.title}
        </span>
        {isRejected && (
          <span className="text-11-regular" style={{ color: "var(--text-critical-base, #dc2626)" }}>
            rejected
          </span>
        )}
        {block.diffStats && !isRejected && (
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

      {reason && (
        <div className="oac-tool-card-collapse oac-tool-card-collapse--open">
          <div className="oac-tool-card-body">
            <div className="flex items-center gap-1.5 text-12-regular" style={{ color: "var(--text-critical-base, #dc2626)" }}>
              <span style={{ fontWeight: 500 }}>Reason:</span>
              <span style={{ color: "var(--text-base)" }}>{reason}</span>
            </div>
          </div>
        </div>
      )}

      {hasBody && !reason && (
        <div className={`oac-tool-card-collapse ${expanded ? "oac-tool-card-collapse--open" : ""}`}>
          <div className="oac-tool-card-body">
            <div className="oac-tool-card-grid">
              {inputText && (
                <div className="oac-tool-card-row">
                  <div className="oac-tool-card-row-label">IN</div>
                  <div className="oac-tool-card-row-content">{inputText}</div>
                </div>
              )}
              {block.output && !isRejected && (
                <div className="oac-tool-card-row">
                  <div className="oac-tool-card-row-label">OUT</div>
                  <div className="oac-tool-card-row-content">{block.output}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
})
