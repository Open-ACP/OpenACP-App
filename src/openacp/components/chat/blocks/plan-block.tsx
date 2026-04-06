import React, { memo } from "react"
import { motion } from "motion/react"
import type { PlanBlock, PlanEntry } from "../../../types"

interface PlanBlockProps {
  block: PlanBlock
}

function PlanIcon({ status }: { status: PlanEntry["status"] }) {
  switch (status) {
    case "completed":
      return <span style={{ color: "#a6e3a1" }}>&#10003;</span>
    case "in_progress":
      return (
        <span
          className="oac-spinner"
          style={{
            display: "inline-block",
            width: "12px",
            height: "12px",
            border: "1.5px solid var(--text-weak)",
            borderTopColor: "transparent",
            borderRadius: "50%",
          }}
        />
      )
    default:
      return <span style={{ color: "var(--text-weaker)" }}>&#9675;</span>
  }
}

export const PlanBlockView = memo(function PlanBlockView({ block }: PlanBlockProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="oac-plan-header">Update Todos</div>
      {block.entries.map((entry, i) => (
        <div key={i} className="oac-plan-entry">
          <span className="shrink-0"><PlanIcon status={entry.status} /></span>
          <span className={
            entry.status === "completed" ? "oac-plan-entry--completed" :
            entry.status === "in_progress" ? "oac-plan-entry--in-progress" : ""
          }>{entry.content}</span>
        </div>
      ))}
    </motion.div>
  )
})
