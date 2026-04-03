import type { JSX } from "solid-js"

export type StepStatus = "success" | "failure" | "progress" | "default"

interface TimelineStepProps {
  status?: StepStatus
  children: JSX.Element
}

export function TimelineStep(props: TimelineStepProps) {
  const statusClass = () => {
    switch (props.status) {
      case "success": return "oac-step--success"
      case "failure": return "oac-step--failure"
      case "progress": return "oac-step--progress"
      default: return ""
    }
  }

  return (
    <div class={`oac-step ${statusClass()}`}>
      {props.children}
    </div>
  )
}
