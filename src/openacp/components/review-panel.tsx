import { For, Show, createSignal, createMemo } from "solid-js"
import { structuredPatch } from "diff"
import { ResizeHandle } from "@openacp/ui/resize-handle"
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

function DiffStats(props: { before: string; after: string }) {
  const stats = createMemo(() => {
    const patch = structuredPatch("", "", props.before, props.after)
    let add = 0, del = 0
    for (const hunk of patch.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) add++
        else if (line.startsWith("-")) del++
      }
    }
    return { add, del }
  })

  return (
    <span class="flex items-center gap-1.5 text-12-regular font-mono">
      <Show when={stats().add > 0}>
        <span style={{ color: "var(--syntax-diff-add, #2da44e)" }}>+{stats().add}</span>
      </Show>
      <Show when={stats().del > 0}>
        <span style={{ color: "var(--syntax-diff-delete, #cf222e)" }}>-{stats().del}</span>
      </Show>
    </span>
  )
}

function DiffView(props: { before: string; after: string; path: string }) {
  const lines = createMemo(() => computeDiffLines(props.before, props.after, props.path))

  return (
    <div class="oac-diff-view font-mono" style={{ "font-size": "12px" }}>
      <For each={lines()}>
        {(line) => (
          <div
            class="oac-diff-line"
            classList={{
              "oac-diff-add": line.type === "add",
              "oac-diff-del": line.type === "del",
              "oac-diff-hunk": line.type === "hunk",
            }}
          >
            <span class="oac-diff-gutter oac-diff-gutter-old">{line.oldNum ?? ""}</span>
            <span class="oac-diff-gutter oac-diff-gutter-new">{line.newNum ?? ""}</span>
            <span class="oac-diff-sign">
              {line.type === "add" ? "+" : line.type === "del" ? "-" : line.type === "hunk" ? "" : " "}
            </span>
            <span class="oac-diff-content">{line.content}</span>
          </div>
        )}
      </For>
    </div>
  )
}

export function ReviewPanel(props: { onClose: () => void }) {
  const chat = useChat()
  const [selectedFile, setSelectedFile] = createSignal<string | null>(null)
  const [panelWidth, setPanelWidth] = createSignal(DEFAULT_WIDTH)

  const fileDiffs = createMemo(() => {
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
  })

  const selectedDiff = createMemo(() => {
    const path = selectedFile()
    if (!path) return fileDiffs()[0] ?? null
    return fileDiffs().find((d) => d.path === path) ?? null
  })

  const fileName = (path: string) => path.split("/").pop() || path

  return (
    <div
      class="relative flex flex-col h-full bg-background-base border-l border-border-weaker-base"
      style={{ width: `${panelWidth()}px` }}
    >
      <ResizeHandle
        direction="horizontal"
        edge="start"
        size={panelWidth()}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        onResize={setPanelWidth}
      />

      {/* Header */}
      <div class="flex items-center justify-between px-3 h-11 border-b border-border-weaker-base flex-shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-14-medium text-text-strong">Review</span>
          <Show when={fileDiffs().length > 0}>
            <span class="text-12-regular text-text-weak">{fileDiffs().length} file{fileDiffs().length !== 1 ? "s" : ""}</span>
          </Show>
        </div>
        <button
          class="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors"
          onClick={props.onClose}
          title="Close"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <Show when={fileDiffs().length === 0}>
        <div class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <div class="text-13-regular text-text-weak">No file changes yet</div>
            <div class="text-12-regular text-text-weaker mt-1">Changes will appear as the agent edits files</div>
          </div>
        </div>
      </Show>

      <Show when={fileDiffs().length > 0}>
        {/* File tabs */}
        <div class="flex items-center gap-0 px-2 py-1.5 border-b border-border-weaker-base overflow-x-auto no-scrollbar flex-shrink-0">
          <For each={fileDiffs()}>
            {(item) => {
              const isSelected = () => (selectedFile() ?? fileDiffs()[0]?.path) === item.path
              return (
                <button
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded text-12-medium whitespace-nowrap transition-colors"
                  classList={{
                    "bg-surface-raised-base text-text-strong": isSelected(),
                    "text-text-base hover:text-text-strong hover:bg-surface-raised-base-hover": !isSelected(),
                  }}
                  onClick={() => setSelectedFile(item.path)}
                >
                  {fileName(item.path)}
                  <DiffStats before={item.diff.before ?? ""} after={item.diff.after} />
                </button>
              )
            }}
          </For>
        </div>

        {/* Diff view */}
        <div class="flex-1 min-h-0 overflow-auto">
          <Show when={selectedDiff()}>
            {(item) => (
              <DiffView
                path={item().path}
                before={item().diff.before ?? ""}
                after={item().diff.after}
              />
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}
