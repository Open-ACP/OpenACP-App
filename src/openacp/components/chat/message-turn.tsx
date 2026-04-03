import React, { useMemo } from "react"
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

function isBlockVisible(block: MessageBlock): boolean {
  if (block.type === "text" && !block.content.trim()) return false
  return true
}

/** Merge thinking blocks that are near each other (possibly separated by short text) */
function mergeThinkingBlocks(blocks: MessageBlock[]): MessageBlock[] {
  const result: MessageBlock[] = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.type === "thinking") {
      // Look back: can we merge with previous thinking?
      // Check if last item is thinking, or last item is short text preceded by thinking
      let mergeTarget = -1
      if (result.length > 0 && result[result.length - 1].type === "thinking") {
        mergeTarget = result.length - 1
      } else if (
        result.length >= 2 &&
        result[result.length - 1].type === "text" &&
        (result[result.length - 1] as any).content.trim().length < 80 &&
        result[result.length - 2].type === "thinking"
      ) {
        // Short text between two thinking blocks — absorb the text into the thinking
        mergeTarget = result.length - 2
        result.splice(result.length - 1, 1) // remove the short text
      }

      if (mergeTarget >= 0) {
        const prev = result[mergeTarget] as import("../../types").ThinkingBlock
        result[mergeTarget] = {
          ...prev,
          content: (prev.content + "\n\n" + block.content).trim(),
          durationMs: (prev.durationMs ?? 0) + (block.durationMs ?? 0) || null,
          isStreaming: block.isStreaming,
        }
        continue
      }
    }
    result.push(block)
  }
  return result
}

function groupBlocks(blocks: MessageBlock[]): RenderItem[] {
  const merged = mergeThinkingBlocks(blocks)
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

  for (let i = 0; i < merged.length; i++) {
    const block = merged[i]
    if (!isBlockVisible(block)) continue
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

export function MessageTurn({ message, streaming }: MessageTurnProps) {
  const blocks = useMemo(() => message.blocks ?? [], [message.blocks])
  const isEmpty = blocks.length === 0
  const renderItems = useMemo(() => groupBlocks(blocks), [blocks])

  if (isEmpty) {
    if (streaming) {
      return (
        <div data-component="oac-assistant-message" className="px-1">
          <div className="oac-timeline">
            <div className="oac-step oac-step--progress">
              <TextShimmer text="Thinking" active className="text-14-regular text-text-weak" style={{ fontStyle: "italic" }} />
            </div>
          </div>
        </div>
      )
    }
    return <div data-component="oac-assistant-message" className="px-1" />
  }

  return (
    <div data-component="oac-assistant-message" className="px-1">
      <div className="oac-timeline">
        {renderItems.map((item, idx) => {
          const isFirst = idx === 0
          const isLast = idx === renderItems.length - 1
          if (item.kind === "noise-group") {
            return <ToolGroup key={`ng-${idx}`} tools={item.tools} isFirst={isFirst} isLast={isLast} />
          }
          const blockItem = item as { kind: "block"; block: MessageBlock; index: number }
          const block = blockItem.block
          const isLastBlock = blockItem.index === blocks.length - 1
          return (
            <TimelineStep key={block.type === "tool" ? block.id : `b-${idx}`} status={blockStatus(block)} isFirst={isFirst} isLast={isLast}>
              {block.type === "text" ? (
                <TextBlockView block={block as TextBlock} streaming={streaming && isLastBlock} />
              ) : block.type === "thinking" ? (
                <ThinkingBlockView block={block as ThinkingBlock} />
              ) : block.type === "tool" ? (
                <ToolBlockView block={block as ToolBlock} />
              ) : block.type === "plan" ? (
                <PlanBlockView block={block as PlanBlock} />
              ) : block.type === "error" ? (
                <ErrorBlockView block={block as ErrorBlock} />
              ) : null}
            </TimelineStep>
          )
        })}
      </div>
    </div>
  )
}
