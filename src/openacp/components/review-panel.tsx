import { For, Show, createSignal, createMemo } from "solid-js"
import { FileDiff } from "@pierre/diffs"
import { useChat } from "../context/chat"
import type { Message, ToolCallPart, FileDiff as FileDiffData } from "../types"

export function ReviewPanel(props: { onClose: () => void }) {
  const chat = useChat()
  const [selectedFile, setSelectedFile] = createSignal<string | null>(null)

  // Collect all file diffs from current session messages
  const fileDiffs = createMemo(() => {
    const diffs = new Map<string, FileDiffData>()
    for (const msg of chat.messages()) {
      if (msg.role !== "assistant") continue
      for (const part of msg.parts) {
        if (part.type !== "tool_call") continue
        const tool = part as ToolCallPart
        if (!tool.diff?.path) continue
        // Latest diff for each file wins
        diffs.set(tool.diff.path, tool.diff)
      }
    }
    return Array.from(diffs.entries()).map(([path, diff]) => ({ path, diff }))
  })

  const selectedDiff = createMemo(() => {
    const path = selectedFile()
    if (!path) {
      // Auto-select first file
      const first = fileDiffs()[0]
      return first ?? null
    }
    return fileDiffs().find((d) => d.path === path) ?? null
  })

  const fileName = (path: string) => path.split("/").pop() || path

  return (
    <div class="flex flex-col h-full bg-background-base border-l border-border-weaker-base">
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
        <div class="flex items-center gap-0 px-2 py-1 border-b border-border-weaker-base overflow-x-auto no-scrollbar flex-shrink-0">
          <For each={fileDiffs()}>
            {(item) => {
              const isSelected = () => (selectedFile() ?? fileDiffs()[0]?.path) === item.path
              return (
                <button
                  class="px-2.5 py-1 rounded text-12-medium whitespace-nowrap transition-colors"
                  classList={{
                    "bg-surface-raised-base text-text-strong": isSelected(),
                    "text-text-base hover:text-text-strong hover:bg-surface-raised-base-hover": !isSelected(),
                  }}
                  onClick={() => setSelectedFile(item.path)}
                >
                  {fileName(item.path)}
                  <Show when={item.diff.before != null}>
                    <span class="ml-1 text-text-weaker">M</span>
                  </Show>
                  <Show when={item.diff.before == null}>
                    <span class="ml-1 text-text-weaker">A</span>
                  </Show>
                </button>
              )
            }}
          </For>
        </div>

        {/* Diff view */}
        <div class="flex-1 min-h-0 overflow-auto">
          <Show when={selectedDiff()}>
            {(item) => (
              <div class="p-2">
                <div class="text-12-regular text-text-weak mb-2 font-mono truncate px-1">{item().path}</div>
                <FileDiff
                  before={{ name: item().path, contents: item().diff.before ?? "" }}
                  after={{ name: item().path, contents: item().diff.after }}
                />
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}
