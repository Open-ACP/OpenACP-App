import React, { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { File } from "@pierre/diffs/react"
import { Plus } from "@phosphor-icons/react"
import type { FileContents, SelectedLineRange, LineAnnotation, GetHoveredLineResult } from "@pierre/diffs"
import { Button } from "../ui/button"

interface CommentAnnotation {
  lineNumber: number
  startLine: number
  endLine: number
}

interface PierreFileProps {
  content: string
  language: string
  filePath: string
  onComment?: (comment: string, code: string, lines: [number, number], file?: string) => void
}

export function PierreFile({ content, language, filePath, onComment }: PierreFileProps) {
  const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(null)
  const [commenting, setCommenting] = useState(false)
  const [commentText, setCommentText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const file: FileContents = useMemo(() => ({
    name: filePath,
    contents: content,
    lang: language === "text" ? undefined : language,
  }), [filePath, content, language])

  const annotations = useMemo<LineAnnotation<CommentAnnotation>[]>(() => {
    if (!commenting || !selectedLines) return []
    return [{
      lineNumber: selectedLines.end,
      metadata: {
        lineNumber: selectedLines.end,
        startLine: selectedLines.start,
        endLine: selectedLines.end,
      },
    }]
  }, [commenting, selectedLines])

  const handleLineSelected = useCallback((range: SelectedLineRange | null) => {
    setSelectedLines(range)
    if (range) setCommenting(false)
  }, [])

  const handleSubmitComment = useCallback(() => {
    if (!commentText.trim() || !selectedLines) return
    const lines = content.split("\n")
    const code = lines.slice(selectedLines.start - 1, selectedLines.end).join("\n")
    onComment?.(commentText.trim(), code, [selectedLines.start, selectedLines.end], filePath)
    setCommentText("")
    setCommenting(false)
    setSelectedLines(null)
  }, [commentText, selectedLines, content, filePath, onComment])

  useEffect(() => {
    if (commenting) textareaRef.current?.focus()
  }, [commenting])

  const renderAnnotation = useCallback((annotation: LineAnnotation<CommentAnnotation>) => {
    return (
      <div className="mx-3 my-1.5 rounded-lg border border-border bg-card p-3">
        <textarea
          ref={textareaRef}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-y min-h-[60px] max-h-[120px] focus:outline-none"
          placeholder="Add comment"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmitComment()
            if (e.key === "Escape") {
              setCommenting(false)
              setSelectedLines(null)
            }
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {annotation.metadata?.startLine !== annotation.metadata?.endLine
              ? `Lines ${annotation.metadata?.startLine}-${annotation.metadata?.endLine}`
              : `Line ${annotation.metadata?.lineNumber}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setCommenting(false); setSelectedLines(null) }}>Cancel</Button>
            <Button size="sm" disabled={!commentText.trim()} onClick={handleSubmitComment}>Comment</Button>
          </div>
        </div>
      </div>
    )
  }, [commentText, handleSubmitComment])

  const renderGutterUtility = useCallback((getHoveredLine: () => GetHoveredLineResult<"file"> | undefined) => {
    if (!onComment || commenting) return null
    const hovered = getHoveredLine()
    if (!hovered) return null

    return (
      <button
        className="size-4 flex items-center justify-center rounded-full bg-foreground text-background hover:bg-foreground/80 transition-colors"
        onClick={() => {
          if (!selectedLines) {
            setSelectedLines({ start: hovered.lineNumber, end: hovered.lineNumber })
          }
          setCommenting(true)
        }}
      >
        <Plus size={10} weight="bold" />
      </button>
    )
  }, [onComment, commenting, selectedLines])

  return (
    <div className="h-full w-full overflow-auto no-scrollbar">
      <File
        file={file}
        selectedLines={selectedLines}
        lineAnnotations={annotations}
        renderAnnotation={renderAnnotation}
        renderGutterUtility={onComment ? renderGutterUtility : undefined}
        options={{
          enableLineSelection: true,
          enableGutterUtility: !!onComment,
          onLineSelected: handleLineSelected,
        }}
        metrics={{
          lineHeight: 20,
          hunkSeparatorHeight: 24,
          hunkLineCount: 0,
          diffHeaderHeight: 0,
          fileGap: 0,
        }}
        className="select-text"
        style={{ fontSize: "12px" }}
      />
    </div>
  )
}
