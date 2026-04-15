import React, { useState, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { CaretRight, Folder, FolderOpen, File, FileTs, FileCss, FileJs, FileHtml } from "@phosphor-icons/react"

export interface FileNode {
  name: string
  path: string
  type: "file" | "directory"
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "ts": case "tsx": return <FileTs size={14} className="text-blue-400" />
    case "js": case "jsx": return <FileJs size={14} className="text-yellow-400" />
    case "css": case "scss": return <FileCss size={14} className="text-purple-400" />
    case "html": return <FileHtml size={14} className="text-orange-400" />
    default: return <File size={14} className="text-muted-foreground" />
  }
}

interface TreeNodeProps {
  node: FileNode
  depth: number
  onOpenFile: (path: string) => void
}

export function TreeNode({ node, depth, onOpenFile }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileNode[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = useCallback(async () => {
    if (node.type !== "directory") return
    if (expanded) {
      setExpanded(false)
      return
    }
    if (!children) {
      setLoading(true)
      try {
        const result = await invoke<FileNode[]>("read_directory", { path: node.path })
        setChildren(result)
      } catch {
        setChildren([])
      }
      setLoading(false)
    }
    setExpanded(true)
  }, [node, expanded, children])

  const handleClick = useCallback(() => {
    if (node.type === "directory") {
      toggle()
    } else {
      onOpenFile(node.path)
    }
  }, [node, toggle, onOpenFile])

  const isDir = node.type === "directory"

  return (
    <>
      <button
        type="button"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const el = e.currentTarget
          const startX = e.clientX
          const startY = e.clientY
          let didDrag = false

          function onMove(ev: PointerEvent) {
            if (!didDrag && (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)) {
              didDrag = true
              document.body.style.cursor = "copy"
              window.dispatchEvent(new CustomEvent("file-tree-drag-start", { detail: { path: node.path } }))
            }
          }
          function onUp(ev: PointerEvent) {
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("pointerup", onUp)
            document.body.style.cursor = ""
            if (didDrag) {
              window.dispatchEvent(new CustomEvent("file-tree-drag-end"))
              const target = document.elementFromPoint(ev.clientX, ev.clientY)
              const composerInput = target?.closest('[data-component="prompt-input"]')
                ?? target?.closest('[data-component="composer-area"]')
              if (composerInput) {
                window.dispatchEvent(new CustomEvent("file-tree-drop", { detail: { path: node.path } }))
              }
              // Prevent click from firing after drag
              function blockClick(ce: MouseEvent) { ce.stopPropagation(); ce.preventDefault() }
              el.addEventListener("click", blockClick, { capture: true, once: true })
            }
          }
          window.addEventListener("pointermove", onMove)
          window.addEventListener("pointerup", onUp)
        }}
        className="flex items-center gap-1 w-full text-left py-[3px] pr-2 hover:bg-accent rounded-sm transition-colors text-sm"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        title={node.path}
      >
        {isDir ? (
          <>
            <CaretRight
              size={10}
              className="shrink-0 text-muted-foreground transition-transform duration-100"
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
            />
            {expanded ? (
              <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
            ) : (
              <Folder size={14} className="shrink-0 text-muted-foreground" />
            )}
          </>
        ) : (
          <>
            <span className="w-[10px] shrink-0" />
            {fileIcon(node.name)}
          </>
        )}
        <span className="truncate text-fg-weak">{node.name}</span>
        {loading && <span className="text-2xs text-muted-foreground ml-auto">...</span>}
      </button>
      {isDir && expanded && children && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onOpenFile={onOpenFile}
            />
          ))}
          {children.length === 0 && (
            <div
              className="text-2xs text-muted-foreground py-1"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              Empty
            </div>
          )}
        </div>
      )}
    </>
  )
}
