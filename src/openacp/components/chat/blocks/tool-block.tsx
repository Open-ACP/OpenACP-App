import { Show, createSignal, createMemo } from "solid-js"
import { TextShimmer } from "../../../../ui/src/components/text-shimmer"
import { kindIcon, kindLabel, formatToolInput } from "../block-utils"
import type { ToolBlock } from "../../../types"

interface ToolBlockProps {
  block: ToolBlock
}

export function ToolBlockView(props: ToolBlockProps) {
  const [expanded, setExpanded] = createSignal(true)
  const isPending = () => props.block.status === "pending" || props.block.status === "running"

  const icon = createMemo(() => kindIcon(props.block.kind))
  const label = createMemo(() => kindLabel(props.block.kind))
  const inputText = createMemo(() => formatToolInput(props.block.input))
  const hasBody = () => !!inputText() || !!props.block.output

  return (
    <div>
      <div
        class="oac-tool-card-title"
        classList={{ "oac-tool-card-shimmer": isPending() }}
        onClick={() => hasBody() && setExpanded(!expanded())}
      >
        <span>{icon()}</span>
        <span style={{ "font-weight": "500" }}>{label()}</span>
        <span style={{ color: "var(--text-weak)" }}>{props.block.title}</span>
        <Show when={props.block.diffStats}>
          {(stats) => (
            <>
              <Show when={stats().added > 0}>
                <span class="oac-diff-stat-add">+{stats().added}</span>
              </Show>
              <Show when={stats().removed > 0}>
                <span class="oac-diff-stat-del">-{stats().removed}</span>
              </Show>
            </>
          )}
        </Show>
        <Show when={isPending()}>
          <TextShimmer text="" active class="" />
        </Show>
      </div>

      <Show when={expanded() && hasBody()}>
        <div class="oac-tool-card-body">
          <div class="oac-tool-card-grid">
            <Show when={inputText()}>
              <div class="oac-tool-card-row">
                <div class="oac-tool-card-row-label">IN</div>
                <div class="oac-tool-card-row-content">{inputText()}</div>
              </div>
            </Show>
            <Show when={props.block.output}>
              <div class="oac-tool-card-row">
                <div class="oac-tool-card-row-label">OUT</div>
                <div class="oac-tool-card-row-content">{props.block.output}</div>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
