import React, { useState, useMemo } from "react"
import { TimelineStep, type StepStatus } from "../timeline-step"
import { ToolBlockView } from "./tool-block"
import type { ToolBlock } from "../../../types"

interface ToolGroupProps {
  tools: ToolBlock[]
  isFirst?: boolean
  isLast?: boolean
}

export function ToolGroup({ tools, isFirst, isLast }: ToolGroupProps) {
  const [expanded, setExpanded] = useState(false)

  const groupStatus = useMemo((): StepStatus => {
    if (tools.some((t) => t.status === "error")) return "failure"
    if (tools.some((t) => t.status === "pending" || t.status === "running")) return "progress"
    if (tools.every((t) => t.status === "completed")) return "success"
    return "default"
  }, [tools])

  const label = `${tools.length} tool call${tools.length !== 1 ? "s" : ""}`

  return (
    <TimelineStep status={groupStatus} isFirst={isFirst} isLast={isLast}>
      <div className={expanded ? "oac-tool-group--open" : ""}>
        <div className="oac-tool-group-header" onClick={() => setExpanded(!expanded)}>
          <span className="oac-tool-group-chevron">&#9654;</span>
          <span>{label}</span>
        </div>
        {expanded && (
          <div style={{ marginTop: "8px" }}>
            {tools.map((tool) => (
              <div key={tool.id} style={{ marginBottom: "8px" }}>
                <ToolBlockView block={tool} />
              </div>
            ))}
          </div>
        )}
      </div>
    </TimelineStep>
  )
}
