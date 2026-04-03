import React from "react"

export type StepStatus = "success" | "failure" | "progress" | "default"

interface TimelineStepProps {
  status?: StepStatus
  children: React.ReactNode
}

export function TimelineStep({ status, children }: TimelineStepProps) {
  const statusClass = (() => {
    switch (status) {
      case "success": return "oac-step--success"
      case "failure": return "oac-step--failure"
      case "progress": return "oac-step--progress"
      default: return ""
    }
  })()

  return (
    <div className={`oac-step ${statusClass}`}>
      {children}
    </div>
  )
}
