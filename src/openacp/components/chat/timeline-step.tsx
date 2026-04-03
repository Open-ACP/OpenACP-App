import type { ReactNode } from "react"

export type StepStatus = "success" | "failure" | "progress" | "default"

interface TimelineStepProps {
  status?: StepStatus
  isFirst?: boolean
  isLast?: boolean
  children: ReactNode
}

export function TimelineStep({ status, isFirst, isLast, children }: TimelineStepProps) {
  const statusClass = (() => {
    switch (status) {
      case "success": return "oac-step--success"
      case "failure": return "oac-step--failure"
      case "progress": return "oac-step--progress"
      default: return ""
    }
  })()

  const lineClass = isFirst && isLast
    ? "oac-step--no-line"
    : isFirst
    ? "oac-step--first"
    : isLast
    ? "oac-step--last"
    : ""

  return (
    <div className={`oac-step ${statusClass} ${lineClass}`}>
      {children}
    </div>
  )
}
