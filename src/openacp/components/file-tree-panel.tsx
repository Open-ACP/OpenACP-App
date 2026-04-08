import React, { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ResizeHandle } from "./ui/resize-handle"
import { TreeNode, type FileNode } from "./file-tree/tree-node"
import { GitDiff, Files } from "@phosphor-icons/react"

const DEFAULT_WIDTH = 280
const MIN_WIDTH = 200
const MAX_WIDTH = 480

interface FileChange {
  path: string
  status: "modified" | "added" | "deleted" | "untracked"
}

interface FileTreePanelProps {
  workspacePath: string
  onOpenFile: (path: string, content: string, language: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  modified: "text-yellow-400",
  added: "text-green-400",
  deleted: "text-red-400",
  untracked: "text-muted-foreground",
}

const STATUS_LABELS: Record<string, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  untracked: "?",
}

export function FileTreePanel({ workspacePath, onOpenFile }: FileTreePanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [mode, setMode] = useState<"files" | "changes">("files")
  const [rootNodes, setRootNodes] = useState<FileNode[]>([])
  const [changes, setChanges] = useState<FileChange[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspacePath) return
    setLoading(true)
    if (mode === "files") {
      invoke<FileNode[]>("read_directory", { path: workspacePath })
        .then(setRootNodes)
        .catch(() => setRootNodes([]))
        .finally(() => setLoading(false))
    } else {
      invoke<FileChange[]>("get_workspace_changes", { path: workspacePath })
        .then(setChanges)
        .catch(() => setChanges([]))
        .finally(() => setLoading(false))
    }
  }, [workspacePath, mode])

  const handleOpenFile = useCallback(async (path: string) => {
    try {
      const result = await invoke<{ content: string; language: string }>("read_file_content", { path })
      onOpenFile(path, result.content, result.language)
    } catch (e) {
      console.error("[file-tree] failed to read file:", e)
    }
  }, [onOpenFile])

  const handleOpenChange = useCallback(async (filePath: string) => {
    const absPath = filePath.startsWith("/") ? filePath : `${workspacePath}/${filePath}`
    await handleOpenFile(absPath)
  }, [workspacePath, handleOpenFile])

  return (
    <div
      className="relative flex flex-col min-h-0 bg-background border-l border-border-weak shrink-0 h-full"
      style={{ width: `${width}px` }}
    >
      <ResizeHandle
        direction="horizontal"
        edge="start"
        size={width}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        onResize={setWidth}
      />

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 h-9 border-b border-border-weak">
        <span className="text-sm font-medium text-foreground">Files</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={`p-1 rounded transition-colors ${mode === "files" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="All files"
            onClick={() => setMode("files")}
          >
            <Files size={14} />
          </button>
          <button
            type="button"
            className={`p-1 rounded transition-colors ${mode === "changes" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Changes"
            onClick={() => setMode("changes")}
          >
            <GitDiff size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 py-1">
        {loading ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">Loading...</div>
        ) : mode === "files" ? (
          rootNodes.length > 0 ? (
            rootNodes.map((node) => (
              <TreeNode key={node.path} node={node} depth={0} onOpenFile={handleOpenFile} />
            ))
          ) : (
            <div className="px-3 py-4 text-sm text-muted-foreground">No files found</div>
          )
        ) : changes.length > 0 ? (
          <div className="flex flex-col">
            {changes.map((change) => (
              <button
                key={change.path}
                type="button"
                className="flex items-center gap-2 w-full text-left px-3 py-[3px] hover:bg-accent rounded-sm transition-colors text-sm"
                onClick={() => handleOpenChange(change.path)}
                title={change.path}
              >
                <span className={`text-2xs font-mono shrink-0 w-3 ${STATUS_COLORS[change.status]}`}>
                  {STATUS_LABELS[change.status]}
                </span>
                <span className="truncate text-foreground-weak">{change.path}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3 py-4 text-sm text-muted-foreground">No changes</div>
        )}
      </div>
    </div>
  )
}
