import { For, Show, createSignal, createMemo } from "solid-js"
import { TimelineStep, type StepStatus } from "../timeline-step"
import { ToolBlockView } from "./tool-block"
import type { ToolBlock } from "../../../types"

interface ToolGroupProps {
  tools: ToolBlock[]
}

export function ToolGroup(props: ToolGroupProps) {
  const [expanded, setExpanded] = createSignal(false)

  const groupStatus = createMemo((): StepStatus => {
    const tools = props.tools
    if (tools.some((t) => t.status === "error")) return "failure"
    if (tools.some((t) => t.status === "pending" || t.status === "running")) return "progress"
    if (tools.every((t) => t.status === "completed")) return "success"
    return "default"
  })

  const label = () => {
    const count = props.tools.length
    return `${count} tool call${count !== 1 ? "s" : ""}`
  }

  return (
    <TimelineStep status={groupStatus()}>
      <div classList={{ "oac-tool-group--open": expanded() }}>
        <div class="oac-tool-group-header" onClick={() => setExpanded(!expanded())}>
          <span class="oac-tool-group-chevron">&#9654;</span>
          <span>{label()}</span>
        </div>
        <Show when={expanded()}>
          <div style={{ "margin-top": "8px" }}>
            <For each={props.tools}>
              {(tool) => (
                <div style={{ "margin-bottom": "8px" }}>
                  <ToolBlockView block={tool} />
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </TimelineStep>
  )
}
