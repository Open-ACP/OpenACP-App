import { useState, useMemo } from "react"
import { structuredPatch } from "diff"
import { ResizeHandle } from "./ui/resize-handle"
import { useChat } from "../context/chat"
import type { ToolCallPart, FileDiff as FileDiffData } from "../types"

const DEFAULT_WIDTH = 480
const MIN_WIDTH = 320
const MAX_WIDTH = 800

interface DiffLine {
  type: "add" | "del" | "normal" | "hunk"
  content: string
  oldNum?: number
  newNum?: number
}

function computeDiffLines(before: string, after: string, path: string): DiffLine[] {
  const patch = structuredPatch(path, path, before, after, "", "", { context: 3 })
  const lines: DiffLine[] = []

  for (const hunk of patch.hunks) {
    lines.push({ type: "hunk", content: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@` })

    let oldNum = hunk.oldStart
    let newNum = hunk.newStart
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        lines.push({ type: "add", content: line.slice(1), newNum: newNum++ })
      } else if (line.startsWith("-")) {
        lines.push({ type: "del", content: line.slice(1), oldNum: oldNum++ })
      } else {
        lines.push({ type: "normal", content: line.slice(1), oldNum: oldNum++, newNum: newNum++ })
      }
    }
  }
  return lines
}

function DiffStats({ before, after }: { before: string; after: string }) {
  const stats = useMemo(() => {
    const patch = structuredPatch("", "", before, after)
    let add = 0, del = 0
    for (const hunk of patch.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) add++
        else if (line.startsWith("-")) del++
      }
    }
    return { add, del }
  }, [before, after])

  return (
    <span className="flex items-center gap-1.5 text-12-regular font-mono">
      {stats.add > 0 && (
        <span style={{ color: "var(--syntax-diff-add, #2da44e)" }}>+{stats.add}</span>
      )}
      {stats.del > 0 && (
        <span style={{ color: "var(--syntax-diff-delete, #cf222e)" }}>-{stats.del}</span>
      )}
    </span>
  )
}

function DiffView({ before, after, path }: { before: string; after: string; path: string }) {
  const lines = useMemo(() => computeDiffLines(before, after, path), [before, after, path])

  return (
    <div className="oac-diff-view font-mono" style={{ fontSize: "12px" }}>
      {lines.map((line, i) => (
        <div
          key={i}
          className={`oac-diff-line ${
            line.type === "add" ? "oac-diff-add" :
            line.type === "del" ? "oac-diff-del" :
            line.type === "hunk" ? "oac-diff-hunk" : ""
          }`}
        >
          <span className="oac-diff-gutter oac-diff-gutter-old">{line.oldNum ?? ""}</span>
          <span className="oac-diff-gutter oac-diff-gutter-new">{line.newNum ?? ""}</span>
          <span className="oac-diff-sign">
            {line.type === "add" ? "+" : line.type === "del" ? "-" : line.type === "hunk" ? "" : " "}
          </span>
          <span className="oac-diff-content">{line.content}</span>
        </div>
      ))}
    </div>
  )
}

export function ReviewPanel({ onClose }: { onClose: () => void }) {
  const chat = useChat()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)

  const fileDiffs = useMemo(() => {
    const diffs = new Map<string, FileDiffData>()
    for (const msg of chat.messages()) {
      if (msg.role !== "assistant") continue
      for (const part of msg.parts) {
        if (part.type !== "tool_call") continue
        const tool = part as ToolCallPart
        if (!tool.diff?.path) continue
        diffs.set(tool.diff.path, tool.diff)
      }
    }
    return Array.from(diffs.entries()).map(([path, diff]) => ({ path, diff }))
  }, [chat.messages()])

  const selectedDiff = useMemo(() => {
    const path = selectedFile
    if (!path) return fileDiffs[0] ?? null
    return fileDiffs.find((d) => d.path === path) ?? null
  }, [selectedFile, fileDiffs])

  const fileName = (path: string) => path.split("/").pop() || path

  return (
    <div
      className="relative flex flex-col h-full bg-background-base border-l border-border-weaker-base"
      style={{ width: `${panelWidth}px` }}
    >
      <ResizeHandle
        direction="horizontal"
        edge="start"
        size={panelWidth}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        onResize={setPanelWidth}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 h-11 border-b border-border-weaker-base flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-14-medium text-text-strong">Review</span>
          {fileDiffs.length > 0 && (
            <span className="text-12-regular text-text-weak">{fileDiffs.length} file{fileDiffs.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        <button
          className="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors"
          onClick={onClose}
          title="Close"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {fileDiffs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-13-regular text-text-weak">No file changes yet</div>
            <div className="text-12-regular text-text-weaker mt-1">Changes will appear as the agent edits files</div>
          </div>
        </div>
      ) : (
        <>
          {/* File tabs */}
          <div className="flex items-center gap-0 px-2 py-1.5 border-b border-border-weaker-base overflow-x-auto no-scrollbar flex-shrink-0">
            {fileDiffs.map((item) => {
              const isSelected = (selectedFile ?? fileDiffs[0]?.path) === item.path
              return (
                <button
                  key={item.path}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-12-medium whitespace-nowrap transition-colors ${
                    isSelected
                      ? "bg-surface-raised-base text-text-strong"
                      : "text-text-base hover:text-text-strong hover:bg-surface-raised-base-hover"
                  }`}
                  onClick={() => setSelectedFile(item.path)}
                >
                  {fileName(item.path)}
                  <DiffStats before={item.diff.before ?? ""} after={item.diff.after} />
                </button>
              )
            })}
          </div>

          {/* Diff view */}
          <div className="flex-1 min-h-0 overflow-auto">
            {selectedDiff && (
              <DiffView
                path={selectedDiff.path}
                before={selectedDiff.diff.before ?? ""}
                after={selectedDiff.diff.after}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
