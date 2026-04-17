import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { X, CaretRight, CaretDown, CaretLeft } from "@phosphor-icons/react";
import { ResizeHandle } from "./ui/resize-handle";
import { useChat } from "../context/chat";
import type { ToolCallPart, FileDiff as FileDiffData } from "../types";
import { PierreFile } from "./pierre/pierre-file";
import { PierreDiff } from "./pierre/pierre-diff";

const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 320;
const MAX_WIDTH = 800;

function FileTabsBar({ tabs, activeView, fileName, onSelect, onMiddleClick, onClose }: {
  tabs: OpenFile[]
  activeView: string
  fileName: (path: string) => string
  onSelect: (path: string) => void
  onMiddleClick: (e: React.MouseEvent, path: string) => void
  onClose?: (path: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    checkScroll()
    el.addEventListener("scroll", checkScroll)
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    return () => { el.removeEventListener("scroll", checkScroll); ro.disconnect() }
  }, [checkScroll, tabs.length])

  // Auto-scroll active tab into view
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const activeBtn = el.querySelector(`[data-tab-path="${CSS.escape(activeView)}"]`) as HTMLElement | null
    activeBtn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
  }, [activeView])

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -120 : 120, behavior: "smooth" })
  }

  return (
    <div className="flex-1 min-w-0 flex items-center relative overflow-hidden">
      {canScrollLeft && (
        <button
          className="shrink-0 size-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => scroll("left")}
        >
          <CaretLeft size={12} />
        </button>
      )}
      <div
        ref={scrollRef}
        className="flex-1 min-w-0 flex items-center gap-1 px-1 overflow-x-auto no-scrollbar"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((file) => {
          const isSelected = activeView === file.path;
          return (
            <button
              key={file.path}
              data-tab-path={file.path}
              className={`flex items-center gap-1 h-6 px-2 rounded text-xs whitespace-nowrap transition-colors shrink-0 ${isSelected ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
              onClick={() => onSelect(file.path)}
              onMouseDown={(e) => onMiddleClick(e, file.path)}
            >
              <span>{fileName(file.path)}</span>
              <span
                className="ml-0.5 hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); onClose?.(file.path) }}
              >
                <X size={10} />
              </span>
            </button>
          );
        })}
      </div>
      {canScrollRight && (
        <button
          className="shrink-0 size-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => scroll("right")}
        >
          <CaretRight size={12} />
        </button>
      )}
    </div>
  )
}

export interface OpenFile {
  path: string
  content: string
  language: string
}

export function ReviewPanel({ onClose, openFiles, onCloseFile, requestedTab, onRequestedTabHandled }: {
  onClose: () => void
  openFiles?: OpenFile[]
  onCloseFile?: (path: string)=> void
  requestedTab?: string | null
  onRequestedTabHandled?: () => void
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

  const openFileTabs = openFiles ?? [];

  // Handle requested tab from parent (always switch, even if already in list)
  React.useEffect(() => {
    if (requestedTab) {
      setSelectedTab(requestedTab)
      onRequestedTabHandled?.()
    }
  }, [requestedTab, onRequestedTabHandled])

  // "review" = built-in review tab, or a file path for open file tabs
  const activeView = selectedTab ?? "review";
  const currentFile = openFileTabs.find(f => f.path === activeView);
  // Which diffs are expanded inside the review tab (multiple allowed)
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());

  const toggleDiff = (path: string) => {
    setExpandedDiffs(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const fileName = (path: string) => path.split("/").pop() || path;

  const handleCodeComment = useCallback((comment: string, code: string, lines: [number, number], file?: string) => {
    window.dispatchEvent(new CustomEvent("add-code-snippet", {
      detail: { comment, code, lines, filePath: file },
    }));
  }, []);

  const handleMiddleClick = (e: React.MouseEvent, path: string) => {
    if (e.button === 1) {
      e.preventDefault();
      onCloseFile?.(path);
    }
  };

  return (
    <div
      className="relative flex flex-col h-full bg-background border-l border-border-weak"
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

      {/* Tab bar: Review fixed + file tabs scrollable */}
      <div className="shrink-0 flex items-center h-9 border-b border-border-weak overflow-hidden">
        <button
          className={`flex items-center gap-1.5 px-3 shrink-0 transition-colors ${activeView === "review" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setSelectedTab(null)}
        >
          <span className="text-sm font-medium">Review</span>
          {fileDiffs.length > 0 && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-secondary text-foreground">{fileDiffs.length}</span>
          )}
        </button>
        {openFileTabs.length > 0 && (
          <FileTabsBar
            tabs={openFileTabs}
            activeView={activeView}
            fileName={fileName}
            onSelect={setSelectedTab}
            onMiddleClick={handleMiddleClick}
            onClose={onCloseFile}
          />
        )}
      </div>

      {/* Review tab content */}
      {activeView === "review" && (
        <>
          {fileDiffs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-sm leading-lg text-muted-foreground">
                  No file changes yet
                </div>
                <div className="text-sm leading-lg text-fg-weakest mt-1">
                  Changes will appear as the agent edits files
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
              {/* Expand all / Collapse all */}
              <div className="sticky top-0 z-10 flex items-center px-3 h-8 bg-background border-b border-border-weak">
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
                  onClick={() => {
                    if (expandedDiffs.size === fileDiffs.length) {
                      setExpandedDiffs(new Set());
                    } else {
                      setExpandedDiffs(new Set(fileDiffs.map(d => d.path)));
                    }
                  }}
                >
                  {expandedDiffs.size === fileDiffs.length ? "Collapse all" : "Expand all"}
                </button>
              </div>
              {fileDiffs.map(({ path, diff }) => {
                const isExpanded = expandedDiffs.has(path);
                return (
                  <div key={path} className="border-b border-border-weak">
                    <button
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors hover:bg-accent ${isExpanded ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => toggleDiff(path)}
                    >
                      {isExpanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
                      <span className="truncate flex-1 text-left">{fileName(path)}</span>
                    </button>
                    {isExpanded && (
                      <PierreDiff
                        oldContent={diff.before ?? ""}
                        newContent={diff.after}
                        filePath={path}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Open file tab content */}
      {activeView !== "review" && currentFile && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <PierreFile
            content={currentFile.content}
            language={currentFile.language}
            filePath={currentFile.path}
            onComment={handleCodeComment}
          />
        </div>
      )}
    </div>
  );
}
