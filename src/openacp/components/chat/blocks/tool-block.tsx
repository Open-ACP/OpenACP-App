import React, { memo, useState, useMemo } from "react"
import { motion, AnimatePresence } from "motion/react"
import { ArrowsOut, CaretRight } from "@phosphor-icons/react"
import { TextShimmer } from "../../ui/text-shimmer"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog"
import { kindIcon, kindLabel, formatToolInput } from "../block-utils"
import type { ToolBlock } from "../../../types"

const MAX_VISIBLE_LINES = 3
const MAX_VISIBLE_CHARS = 200

function truncateLines(text: string, max: number): { visible: string; hiddenCount: number } {
  const lines = text.split("\n")
  const linesCapped = lines.length > max
  const visible = linesCapped ? lines.slice(0, max).join("\n") : text
  // Also cap by character length to prevent very long lines from taking too much space
  if (visible.length > MAX_VISIBLE_CHARS) {
    return { visible: visible.slice(0, MAX_VISIBLE_CHARS) + "…", hiddenCount: lines.length - (linesCapped ? max : 0) }
  }
  return { visible, hiddenCount: linesCapped ? lines.length - max : 0 }
}

const REJECTION_PATTERNS = [
  "user doesn't want to proceed",
  "tool use was rejected",
  "User refused permission",
]

function isRejectionOutput(output: string | null): boolean {
  if (!output) return false
  return REJECTION_PATTERNS.some((p) => output.includes(p))
}

interface ToolBlockProps {
  block: ToolBlock
  feedbackReason?: string
}

export const ToolBlockView = memo(function ToolBlockView({ block, feedbackReason }: ToolBlockProps) {
  const [expanded, setExpanded] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const isPending = block.status === "pending" || block.status === "running"
  const isRejected = isRejectionOutput(block.output)

  const icon = useMemo(() => kindIcon(block.kind), [block.kind])
  const label = useMemo(() => kindLabel(block.kind), [block.kind])
  const inputText = useMemo(() => formatToolInput(block.input), [block.input])
  const truncatedInput = useMemo(
    () => (inputText ? truncateLines(inputText, MAX_VISIBLE_LINES) : null),
    [inputText]
  )
  const truncatedOutput = useMemo(
    () => (block.output && !isRejected ? truncateLines(block.output, MAX_VISIBLE_LINES) : null),
    [block.output, isRejected]
  )
  const reason = feedbackReason && isRejected ? feedbackReason : undefined
  const hasBody = !!inputText || (!!block.output && !isRejected) || !!reason

  return (
    <div>
      <div
        className={`oac-tool-card-title${isPending ? " oac-tool-card-shimmer" : ""}`}
        onClick={() => hasBody && setExpanded(!expanded)}
      >
        <span className="shrink-0">{icon}</span>
        <span className="shrink-0" style={{ fontWeight: "500" }}>{label}</span>
        <span
          className="truncate min-w-0 hover:underline cursor-pointer"
          style={{ color: isRejected ? "var(--text-critical-base, #dc2626)" : "var(--muted-foreground)" }}
          onClick={(e) => {
            e.stopPropagation()
            const filePath = block.input?.file_path ?? block.input?.filePath ?? block.input?.path
            if (typeof filePath === "string" && filePath) {
              window.dispatchEvent(new CustomEvent("open-file-in-review", { detail: { path: filePath } }))
            }
          }}
          title={block.title}
        >
          {block.title}
        </span>
        {isRejected && (
          <span className="text-2xs-regular" style={{ color: "var(--text-critical-base, #dc2626)" }}>
            rejected
          </span>
        )}
        {block.diffStats && !isRejected && (
          <>
            {block.diffStats.added > 0 && (
              <span className="oac-diff-stat-add">+{block.diffStats.added}</span>
            )}
            {block.diffStats.removed > 0 && (
              <span className="oac-diff-stat-del">-{block.diffStats.removed}</span>
            )}
          </>
        )}
        {isPending && <TextShimmer text="" active className="" />}
        {hasBody && !isPending && (
          <CaretRight
            size={10}
            className="shrink-0 text-muted-foreground transition-transform duration-150"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          />
        )}
      </div>

      {reason && (
        <div className="oac-tool-card-collapse oac-tool-card-collapse--open">
          <div className="oac-tool-card-body">
            <div className="flex items-center gap-1.5 text-sm-regular" style={{ color: "var(--text-critical-base, #dc2626)" }}>
              <span style={{ fontWeight: 500 }}>Reason:</span>
              <span style={{ color: "var(--foreground-weak)" }}>{reason}</span>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {hasBody && !reason && expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="oac-tool-card-body relative group/toolbody">
              <button
                type="button"
                className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover/toolbody:opacity-100 hover:bg-accent transition-opacity z-10"
                title="Expand"
                onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
              >
                <ArrowsOut size={12} className="text-muted-foreground" />
              </button>
              <div className="oac-tool-card-grid">
                {truncatedInput && (
                  <div className="oac-tool-card-row">
                    <div className="oac-tool-card-row-label">IN</div>
                    <div className="oac-tool-card-row-content">
                      {truncatedInput.visible}
                      {truncatedInput.hiddenCount > 0 && (
                        <button
                          type="button"
                          className="flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
                        >
                          + {truncatedInput.hiddenCount} more lines <ArrowsOut size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {truncatedOutput && (
                  <div className="oac-tool-card-row">
                    <div className="oac-tool-card-row-label">OUT</div>
                    <div className="oac-tool-card-row-content">
                      {truncatedOutput.visible}
                      {truncatedOutput.hiddenCount > 0 && (
                        <button
                          type="button"
                          className="flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
                        >
                          + {truncatedOutput.hiddenCount} more lines <ArrowsOut size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col [backface-visibility:hidden]">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2 text-sm min-w-0">
              <span className="shrink-0">{icon}</span>
              <span className="shrink-0">{label}</span>
              <span className="text-muted-foreground font-normal truncate">{block.title}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            <div className="oac-tool-card-grid border border-border-weak rounded-md overflow-hidden">
              {inputText && (
                <div className="oac-tool-card-row">
                  <div className="oac-tool-card-row-label">IN</div>
                  <div className="oac-tool-card-row-content oac-tool-card-row-content--expanded select-text">{inputText}</div>
                </div>
              )}
              {block.output && !isRejected && (
                <div className="oac-tool-card-row">
                  <div className="oac-tool-card-row-label">OUT</div>
                  <div className="oac-tool-card-row-content oac-tool-card-row-content--expanded select-text">{block.output}</div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})
