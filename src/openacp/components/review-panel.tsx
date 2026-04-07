import React, { useState, useMemo } from "react";
import { X } from "@phosphor-icons/react";
import { structuredPatch } from "diff";
import { ResizeHandle } from "./ui/resize-handle";
import { useChat } from "../context/chat";
import type { ToolCallPart, FileDiff as FileDiffData } from "../types";
import { Button } from "./ui/button";
import { CodeViewer } from "./ui/code-viewer";

const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 320;
const MAX_WIDTH = 800;

interface DiffLine {
  type: "add" | "del" | "normal" | "hunk";
  content: string;
  oldNum?: number;
  newNum?: number;
}

function computeDiffLines(
  before: string,
  after: string,
  path: string,
): DiffLine[] {
  const patch = structuredPatch(path, path, before, after, "", "", {
    context: 3,
  });
  const lines: DiffLine[] = [];
  for (const hunk of patch.hunks) {
    lines.push({
      type: "hunk",
      content: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    });
    let oldNum = hunk.oldStart;
    let newNum = hunk.newStart;
    for (const line of hunk.lines) {
      if (line.startsWith("+"))
        lines.push({ type: "add", content: line.slice(1), newNum: newNum++ });
      else if (line.startsWith("-"))
        lines.push({ type: "del", content: line.slice(1), oldNum: oldNum++ });
      else
        lines.push({
          type: "normal",
          content: line.slice(1),
          oldNum: oldNum++,
          newNum: newNum++,
        });
    }
  }
  return lines;
}

function DiffStats({ before, after }: { before: string; after: string }) {
  const stats = useMemo(() => {
    const patch = structuredPatch("", "", before, after);
    let add = 0,
      del = 0;
    for (const hunk of patch.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) add++;
        else if (line.startsWith("-")) del++;
      }
    }
    return { add, del };
  }, [before, after]);
  return (
    <span className="flex items-center gap-1.5 text-sm leading-lg font-mono">
      {stats.add > 0 && (
        <span style={{ color: "var(--syntax-diff-add, #2da44e)" }}>
          +{stats.add}
        </span>
      )}
      {stats.del > 0 && (
        <span style={{ color: "var(--syntax-diff-delete, #cf222e)" }}>
          -{stats.del}
        </span>
      )}
    </span>
  );
}

function DiffView({
  before,
  after,
  path,
}: {
  before: string;
  after: string;
  path: string;
}) {
  const lines = useMemo(
    () => computeDiffLines(before, after, path),
    [before, after, path],
  );
  return (
    <div className="oac-diff-view font-mono" style={{ fontSize: "12px" }}>
      {lines.map((line, i) => (
        <div
          key={i}
          className={`oac-diff-line ${line.type === "add" ? "oac-diff-add" : line.type === "del" ? "oac-diff-del" : line.type === "hunk" ? "oac-diff-hunk" : ""}`}
        >
          <span className="oac-diff-gutter oac-diff-gutter-old">
            {line.oldNum ?? ""}
          </span>
          <span className="oac-diff-gutter oac-diff-gutter-new">
            {line.newNum ?? ""}
          </span>
          <span className="oac-diff-sign">
            {line.type === "add"
              ? "+"
              : line.type === "del"
                ? "-"
                : line.type === "hunk"
                  ? ""
                  : " "}
          </span>
          <span className="oac-diff-content">{line.content}</span>
        </div>
      ))}
    </div>
  );
}

export interface OpenFile {
  path: string
  content: string
  language: string
}

export function ReviewPanel({ onClose, openFiles, onCloseFile }: {
  onClose: () => void
  openFiles?: OpenFile[]
  onCloseFile?: (path: string) => void
}) {
  const chat = useChat();
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);

  const fileDiffs = useMemo(() => {
    const diffs = new Map<string, FileDiffData>();
    for (const msg of chat.messages()) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (part.type !== "tool_call") continue;
        const tool = part as ToolCallPart;
        if (!tool.diff?.path) continue;
        diffs.set(tool.diff.path, tool.diff);
      }
    }
    return Array.from(diffs.entries()).map(([path, diff]) => ({ path, diff }));
  }, [chat.messages()]);

  // Build unified tab list: open files first (newest first), then diffs
  type Tab = { type: "diff"; path: string; diff: FileDiffData } | { type: "file"; path: string; content: string; language: string }
  const allTabs = useMemo((): Tab[] => {
    const tabs: Tab[] = []
    // Open files first (reversed so newest is first)
    for (const f of [...(openFiles ?? [])].reverse()) {
      tabs.push({ type: "file", path: f.path, content: f.content, language: f.language })
    }
    // Then diffs (skip if already open as file)
    for (const d of fileDiffs) {
      if (!tabs.some(t => t.path === d.path)) {
        tabs.push({ type: "diff" as const, path: d.path, diff: d.diff })
      }
    }
    return tabs
  }, [fileDiffs, openFiles])

  // Auto-select newest open file when new file added
  const lastOpenFile = openFiles?.[openFiles.length - 1]?.path
  React.useEffect(() => {
    if (lastOpenFile) setSelectedTab(lastOpenFile)
  }, [lastOpenFile])

  const activeTab = selectedTab && allTabs.some(t => t.path === selectedTab)
    ? selectedTab
    : allTabs[0]?.path ?? null
  const currentTab = allTabs.find(t => t.path === activeTab) ?? null

  const fileName = (path: string) => path.split("/").pop() || path;

  return (
    <div
      className="relative flex flex-col h-full bg-card border-l border-border-weak"
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
      <div className="shrink-0 flex items-center px-3 h-9 border-b border-border-weak">
        <span className="text-sm font-medium text-foreground">Review</span>
        {allTabs.length > 0 && (
          <span className="text-sm text-muted-foreground ml-2">
            {allTabs.length} file{allTabs.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {allTabs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-sm leading-lg text-muted-foreground">
              No file changes yet
            </div>
            <div className="text-sm leading-lg text-foreground-weaker mt-1">
              Changes will appear as the agent edits files
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-weak overflow-x-auto no-scrollbar flex-shrink-0">
            {allTabs.map((tab) => {
              const isSelected = activeTab === tab.path;
              const isFileTab = tab.type === "file";
              return (
                <button
                  key={tab.path}
                  className={`flex items-center gap-1 h-6 px-2 rounded text-xs whitespace-nowrap transition-colors ${isSelected ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
                  onClick={() => setSelectedTab(tab.path)}
                >
                  <span>{fileName(tab.path)}</span>
                  {tab.type === "diff" && (
                    <DiffStats before={tab.diff.before ?? ""} after={tab.diff.after} />
                  )}
                  {isFileTab && (
                    <span
                      className="ml-0.5 hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); onCloseFile?.(tab.path) }}
                    >
                      <X size={10} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {currentTab?.type === "diff" && (
              <DiffView
                path={currentTab.path}
                before={currentTab.diff.before ?? ""}
                after={currentTab.diff.after}
              />
            )}
            {currentTab?.type === "file" && (
              <FileContentView content={currentTab.content} language={currentTab.language} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FileContentView({ content, language }: { content: string; language: string }) {
  return <CodeViewer content={content} language={language} />
}
