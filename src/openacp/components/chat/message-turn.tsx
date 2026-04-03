import { useMemo } from "react"
import { TextShimmer } from "../ui/text-shimmer"
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

function renderBlock(block: MessageBlock, streaming: boolean | undefined, isLastBlock: boolean) {
  switch (block.type) {
    case "text":
      return <TextBlockView block={block as TextBlock} streaming={streaming && isLastBlock} />
    case "thinking":
      return <ThinkingBlockView block={block as ThinkingBlock} />
    case "tool":
      return <ToolBlockView block={block as ToolBlock} />
    case "plan":
      return <PlanBlockView block={block as PlanBlock} />
    case "error":
      return <ErrorBlockView block={block as ErrorBlock} />
    default:
      return null
  }
}

export function MessageTurn({ message, streaming }: MessageTurnProps) {
  const blocks = useMemo(() => message.blocks ?? [], [message.blocks])
  const isEmpty = blocks.length === 0
  const renderItems = useMemo(() => groupBlocks(blocks), [blocks])

  return (
    <div data-component="oac-assistant-message" className="px-1">
      {isEmpty ? (
        streaming ? (
          <div className="oac-timeline">
            <div className="oac-step oac-step--progress">
              <TextShimmer text="Thinking" active className="text-14-regular text-text-weak" style={{ fontStyle: "italic" }} />
            </div>
          </div>
        ) : null
      ) : (
        <div className="oac-timeline">
          <div className="oac-timeline-line" />
          {renderItems.map((item, idx) => {
            if (item.kind === "noise-group") {
              return <ToolGroup key={`ng-${idx}`} tools={item.tools} />
            }
            const blockItem = item as { kind: "block"; block: MessageBlock; index: number }
            const block = blockItem.block
            const isLastBlock = blockItem.index === blocks.length - 1
            return (
              <TimelineStep key={`b-${idx}`} status={blockStatus(block)}>
                {renderBlock(block, streaming, isLastBlock)}
              </TimelineStep>
            )
          })}
        </div>
      )}
    </div>
  )
}
