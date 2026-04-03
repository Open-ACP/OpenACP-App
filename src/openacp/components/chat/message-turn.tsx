import { For, Match, Show, Switch, createMemo } from "solid-js"
import { TextShimmer } from "../../../ui/src/components/text-shimmer"
import { TimelineStep, type StepStatus } from "./timeline-step"
import { TextBlockView } from "./blocks/text-block"
import { ThinkingBlockView } from "./blocks/thinking-block"
import { ToolBlockView } from "./blocks/tool-block"
import { PlanBlockView } from "./blocks/plan-block"
import { ErrorBlockView } from "./blocks/error-block"
import { ToolGroup } from "./blocks/tool-group"
import type { Message, MessageBlock, ToolBlock, TextBlock, ThinkingBlock, PlanBlock, ErrorBlock } from "../../types"

interface MessageTurnProps {
  message: Message
  streaming?: boolean
}

type RenderItem =
  | { kind: "block"; block: MessageBlock; index: number }
  | { kind: "noise-group"; tools: ToolBlock[] }

function groupBlocks(blocks: MessageBlock[]): RenderItem[] {
  const items: RenderItem[] = []
  let noiseBuffer: ToolBlock[] = []

  function flushNoise() {
    if (noiseBuffer.length === 0) return
    if (noiseBuffer.length === 1) {
      items.push({ kind: "block", block: noiseBuffer[0], index: -1 })
    } else {
      items.push({ kind: "noise-group", tools: [...noiseBuffer] })
    }
    noiseBuffer = []
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.type === "tool" && block.isNoise) {
      noiseBuffer.push(block)
    } else {
      flushNoise()
      items.push({ kind: "block", block, index: i })
    }
  }
  flushNoise()
  return items
}

function blockStatus(block: MessageBlock): StepStatus {
  if (block.type === "tool") {
    if (block.status === "error") return "failure"
    if (block.status === "pending" || block.status === "running") return "progress"
    if (block.status === "completed") return "success"
  }
  if (block.type === "error") return "failure"
  if (block.type === "thinking" && block.isStreaming) return "progress"
  return "default"
}

export function MessageTurn(props: MessageTurnProps) {
  const blocks = createMemo(() => props.message.blocks ?? [])
  const isEmpty = () => blocks().length === 0
  const renderItems = createMemo(() => groupBlocks(blocks()))

  return (
    <div data-component="oac-assistant-message" class="px-1">
      <Show when={!isEmpty()} fallback={
        <Show when={props.streaming}>
          <div class="oac-timeline">
            <div class="oac-step oac-step--progress">
              <TextShimmer text="Thinking" active class="text-14-regular text-text-weak" style={{ "font-style": "italic" }} />
            </div>
          </div>
        </Show>
      }>
        <div class="oac-timeline">
          <div class="oac-timeline-line" />
          <For each={renderItems()}>
            {(item) => (
              <Switch>
                <Match when={item.kind === "noise-group"}>
                  <ToolGroup tools={(item as { kind: "noise-group"; tools: ToolBlock[] }).tools} />
                </Match>
                <Match when={item.kind === "block"}>
                  {(() => {
                    const blockItem = item as { kind: "block"; block: MessageBlock; index: number }
                    const block = blockItem.block
                    const isLastBlock = () => blockItem.index === blocks().length - 1
                    return (
                      <TimelineStep status={blockStatus(block)}>
                        <Switch>
                          <Match when={block.type === "text"}>
                            <TextBlockView
                              block={block as TextBlock}
                              streaming={props.streaming && isLastBlock()}
                            />
                          </Match>
                          <Match when={block.type === "thinking"}>
                            <ThinkingBlockView block={block as ThinkingBlock} />
                          </Match>
                          <Match when={block.type === "tool"}>
                            <ToolBlockView block={block as ToolBlock} />
                          </Match>
                          <Match when={block.type === "plan"}>
                            <PlanBlockView block={block as PlanBlock} />
                          </Match>
                          <Match when={block.type === "error"}>
                            <ErrorBlockView block={block as ErrorBlock} />
                          </Match>
                        </Switch>
                      </TimelineStep>
                    )
                  })()}
                </Match>
              </Switch>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
