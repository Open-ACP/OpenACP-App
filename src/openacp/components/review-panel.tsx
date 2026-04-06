import React, { useState, useMemo } from "react";
import { X } from "@phosphor-icons/react";
import { structuredPatch } from "diff";
import { ResizeHandle } from "./ui/resize-handle";
import { useChat } from "../context/chat";
import type { ToolCallPart, FileDiff as FileDiffData } from "../types";
import { Button } from "./ui/button";

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

export function ReviewPanel({ onClose }: { onClose: () => void }) {
  const chat = useChat();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
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

  const selectedDiff = useMemo(() => {
    const path = selectedFile;
    if (!path) return fileDiffs[0] ?? null;
    return fileDiffs.find((d) => d.path === path) ?? null;
  }, [selectedFile, fileDiffs]);

  const fileName = (path: string) => path.split("/").pop() || path;

  return (
    <div
      className="relative flex flex-col h-full bg-background border-l border-t border-border-weak"
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
      <div className="flex items-center justify-between px-3 h-11 border-b border-border-weak flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-md-medium text-foreground truncate block">
            Review
          </span>
          {fileDiffs.length > 0 && (
            <span className="text-sm leading-lg text-muted-foreground">
              {fileDiffs.length} file{fileDiffs.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title="Close"
        >
          <X size={16} />
        </Button>
      </div>
      {fileDiffs.length === 0 ? (
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
          <div className="flex items-center gap-0 px-2 py-1.5 border-b border-border-weak/50 overflow-x-auto no-scrollbar flex-shrink-0">
            {fileDiffs.map((item) => {
              const isSelected =
                (selectedFile ?? fileDiffs[0]?.path) === item.path;
              return (
                <button
                  key={item.path}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-medium leading-lg whitespace-nowrap transition-colors ${isSelected ? "bg-secondary text-foreground" : "text-foreground-weak hover:text-foreground hover:bg-accent"}`}
                  onClick={() => setSelectedFile(item.path)}
                >
                  {fileName(item.path)}
                  <DiffStats
                    before={item.diff.before ?? ""}
                    after={item.diff.after}
                  />
                </button>
              );
            })}
          </div>
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
  );
}
