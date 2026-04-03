import { For } from "solid-js"
import type { PlanBlock, PlanEntry } from "../../../types"

interface PlanBlockProps {
  block: PlanBlock
}

function PlanIcon(props: { status: PlanEntry["status"] }) {
  switch (props.status) {
    case "completed":
      return <span style={{ color: "#a6e3a1" }}>&#10003;</span>
    case "in_progress":
      return (
        <span
          class="oac-spinner"
          style={{
            display: "inline-block",
            width: "12px",
            height: "12px",
            border: "1.5px solid var(--text-weak)",
            "border-top-color": "transparent",
            "border-radius": "50%",
          }}
        />
      )
    default:
      return <span style={{ color: "var(--text-weaker)" }}>&#9675;</span>
  }
}

export function PlanBlockView(props: PlanBlockProps) {
  return (
    <div>
      <div class="oac-plan-header">Update Todos</div>
      <For each={props.block.entries}>
        {(entry) => (
          <div class="oac-plan-entry">
            <span class="shrink-0"><PlanIcon status={entry.status} /></span>
            <span classList={{
              "oac-plan-entry--completed": entry.status === "completed",
              "oac-plan-entry--in-progress": entry.status === "in_progress",
            }}>{entry.content}</span>
          </div>
        )}
      </For>
    </div>
  )
}
