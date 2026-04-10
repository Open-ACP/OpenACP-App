import React, { useMemo, useState, useCallback } from "react"
import { Copy, Check } from "@phosphor-icons/react"
import { TextShimmer } from "../ui/text-shimmer"
import { TimelineStep, type StepStatus } from "./timeline-step"
import { TextBlockView } from "./blocks/text-block"
import { ThinkingBlockView } from "./blocks/thinking-block"
import { ToolBlockView } from "./blocks/tool-block"
import { PlanBlockView } from "./blocks/plan-block"
import { ErrorBlockView } from "./blocks/error-block"
import { ToolGroup } from "./blocks/tool-group"
import { usePermissions } from "../../context/permissions"
import { UsageBar } from "./usage-bar"
import type { Message, MessageBlock, ToolBlock, TextBlock, ThinkingBlock, PlanBlock, ErrorBlock } from "../../types"

interface MessageTurnProps {
  message: Message
  streaming?: boolean
}

export type RenderItem =
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

export function groupBlocks(blocks: MessageBlock[]): RenderItem[] {
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

const REJECTION_PATTERNS = [
  "user doesn't want to proceed",
  "tool use was rejected",
  "User refused permission",
]

function isToolRejected(block: MessageBlock): boolean {
  if (block.type !== "tool" || !block.output) return false
  return REJECTION_PATTERNS.some((p) => block.output!.includes(p))
}

function blockStatus(block: MessageBlock): StepStatus {
  if (block.type === "tool") {
    if (block.status === "error" || isToolRejected(block)) return "failure"
    if (block.status === "pending" || block.status === "running") return "progress"
    if (block.status === "completed") return "success"
  }
  if (block.type === "error") return "failure"
  if (block.type === "thinking" && block.isStreaming) return "progress"
  return "default"
}

function MessageFooter({ usage, textContent }: { usage?: import("../../types").UsageInfo; textContent?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    if (!textContent) return
    navigator.clipboard.writeText(textContent).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [textContent])

  return (
    <div className="flex items-center gap-3 mt-2" style={{ paddingLeft: 30 }}>
      {usage && <UsageBar usage={usage} />}
      {textContent && (
        <button
          type="button"
          className="flex items-center justify-center size-[18px] rounded hover:bg-accent transition-colors"
          title="Copy message"
          onClick={handleCopy}
        >
          {copied ? (
            <Check size={12} style={{ color: 'var(--icon-weak)' }} />
          ) : (
            <Copy size={12} style={{ color: 'var(--icon-weak)' }} />
          )}
        </button>
      )}
    </div>
  )
}

// Isolated wrapper so only this component re-renders on permissions context changes,
// not the entire MessageTurn tree.
function ToolBlockWithFeedback({ block, sessionID }: { block: ToolBlock; sessionID: string }) {
  const permissions = usePermissions()
  const feedbackReason = permissions.lastFeedback(sessionID)
  return <ToolBlockView block={block} feedbackReason={feedbackReason} />
}

// ── Flat block rendering ─────────────────────────────────────────────────────
//
// These are used by chat-view.tsx for block-level Virtuoso virtualization.
// Each assistant message's blocks are flattened into individual Virtuoso items,
// so Virtuoso only mounts the blocks that are currently in view.

interface AssistantBlockRowProps {
  message: Message
  renderItem: RenderItem
  isFirstBlock: boolean
  isLastBlock: boolean
  /** True only for the last block of the last streaming message */
  streaming: boolean
}

export function AssistantBlockRow({ message, renderItem, isFirstBlock, isLastBlock, streaming }: AssistantBlockRowProps) {
  // Only needed for MessageFooter on the last block; computed once per row but cheap.
  const textContent = useMemo(() =>
    message.blocks?.filter((b): b is TextBlock => b.type === "text").map(b => b.content).join("\n").trim() ?? "",
    [message.blocks]
  )

  let stepContent: React.ReactNode
  if (renderItem.kind === "noise-group") {
    // ToolGroup manages its own TimelineStep internally
    stepContent = (
      <ToolGroup tools={renderItem.tools} isFirst={isFirstBlock} isLast={isLastBlock} />
    )
  } else {
    const block = renderItem.block
    stepContent = (
      <TimelineStep status={blockStatus(block)} isFirst={isFirstBlock} isLast={isLastBlock}>
        {block.type === "text" ? (
          <TextBlockView block={block as TextBlock} streaming={streaming} sessionID={message.sessionID} />
        ) : block.type === "thinking" ? (
          <ThinkingBlockView block={block as ThinkingBlock} sessionID={message.sessionID} />
        ) : block.type === "tool" ? (
          <ToolBlockWithFeedback block={block as ToolBlock} sessionID={message.sessionID} />
        ) : block.type === "plan" ? (
          <PlanBlockView block={block as PlanBlock} />
        ) : block.type === "error" ? (
          <ErrorBlockView block={block as ErrorBlock} />
        ) : null}
      </TimelineStep>
    )
  }

  return (
    <div data-component="oac-assistant-message" className="px-1">
      <div className="oac-timeline">
        {stepContent}
      </div>
      {isLastBlock && !streaming && (message.usage || textContent) && (
        <MessageFooter usage={message.usage} textContent={textContent || undefined} />
      )}
      {isLastBlock && !streaming && message.interrupted && (
        <div className="oac-interrupted" style={{ paddingLeft: 30 }}>
          <span className="oac-interrupted-label">Interrupted</span>
        </div>
      )}
    </div>
  )
}

/** Renders the empty/loading state for an assistant message with no blocks yet */
export function AssistantEmptyRow({ streaming }: { streaming: boolean }) {
  if (streaming) {
    return (
      <div data-component="oac-assistant-message" className="px-1">
        <div className="oac-timeline">
          {/* Single step with no connecting line */}
          <div className="oac-step oac-step--progress oac-step--no-line">
            <TextShimmer text="Thinking" active className="text-base font-normal text-muted-foreground" style={{ fontStyle: "italic" }} />
          </div>
        </div>
      </div>
    )
  }
  return <div data-component="oac-assistant-message" className="px-1" />
}

// ── Legacy full-message renderer ─────────────────────────────────────────────
// Kept for reference; the main chat view uses AssistantBlockRow instead.

export const MessageTurn = React.memo(function MessageTurn({ message, streaming }: MessageTurnProps) {
  const blocks = useMemo(() => message.blocks ?? [], [message.blocks])
  const isEmpty = blocks.length === 0
  const renderItems = useMemo(() => groupBlocks(blocks), [blocks])
  const textContent = useMemo(() =>
    blocks.filter((b): b is TextBlock => b.type === "text").map(b => b.content).join("\n").trim(),
    [blocks]
  )

  if (isEmpty) {
    if (streaming) {
      return (
        <div data-component="oac-assistant-message" className="px-1">
          <div className="oac-timeline">
            <div className="oac-step oac-step--progress">
              <TextShimmer text="Thinking" active className="text-base font-normal text-muted-foreground" style={{ fontStyle: "italic" }} />
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
          return (
            <TimelineStep key={block.type === "tool" ? block.id : `b-${idx}`} status={blockStatus(block)} isFirst={isFirst} isLast={isLast}>
              {block.type === "text" ? (
                <TextBlockView block={block as TextBlock} streaming={streaming && isLast} sessionID={message.sessionID} />
              ) : block.type === "thinking" ? (
                <ThinkingBlockView block={block as ThinkingBlock} sessionID={message.sessionID} />
              ) : block.type === "tool" ? (
                <ToolBlockWithFeedback block={block as ToolBlock} sessionID={message.sessionID} />
              ) : block.type === "plan" ? (
                <PlanBlockView block={block as PlanBlock} />
              ) : block.type === "error" ? (
                <ErrorBlockView block={block as ErrorBlock} />
              ) : null}
            </TimelineStep>
          )
        })}
      </div>
      {!streaming && (message.usage || textContent) && (
        <MessageFooter usage={message.usage} textContent={textContent} />
      )}
      {!streaming && message.interrupted && (
        <div className="oac-interrupted" style={{ paddingLeft: 30 }}>
          <span className="oac-interrupted-label">Interrupted</span>
        </div>
      )}
    </div>
  )
}, (prev, next) => {
  // Always re-render if streaming (this is the active message)
  if (next.streaming) return false
  // Otherwise only re-render if message or streaming flag changed
  return prev.message === next.message && prev.streaming === next.streaming
})
