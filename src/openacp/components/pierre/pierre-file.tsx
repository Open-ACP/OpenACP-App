import React, { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { File } from "@pierre/diffs/react"
import { Plus } from "@phosphor-icons/react"
import type { FileContents, SelectedLineRange } from "@pierre/diffs"
import { Button } from "../ui/button"

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
  const [hoveredLine, setHoveredLine] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const file: FileContents = useMemo(() => ({
    name: filePath,
    contents: content,
    lang: language === "text" ? undefined : language,
  }), [filePath, content, language])

  // Track hovered line via pointer events on the diffs-container shadow DOM
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function findLineNumber(el: HTMLElement): number | null {
      let current: HTMLElement | null = el
      while (current && current !== container) {
        const lineAttr = current.getAttribute("data-line-number")
        if (lineAttr) return parseInt(lineAttr, 10)
        current = current.parentElement
      }
      return null
    }

    function onPointerMove(e: PointerEvent) {
      const target = e.target as HTMLElement
      // Look inside shadow DOM
      const diffsEl = container?.querySelector("diffs-container")
      if (!diffsEl?.shadowRoot) return
      const elementsAtPoint = diffsEl.shadowRoot.elementsFromPoint(e.clientX, e.clientY)
      for (const el of elementsAtPoint) {
        const lineAttr = (el as HTMLElement).getAttribute?.("data-line-number")
        if (lineAttr) {
          setHoveredLine(parseInt(lineAttr, 10))
          return
        }
      }
      setHoveredLine(null)
    }

    function onPointerLeave() {
      setHoveredLine(null)
    }

    container.addEventListener("pointermove", onPointerMove)
    container.addEventListener("pointerleave", onPointerLeave)
    return () => {
      container.removeEventListener("pointermove", onPointerMove)
      container.removeEventListener("pointerleave", onPointerLeave)
    }
  }, [])

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

  // Determine gutter button position
  const showGutterBtn = onComment && !commenting && hoveredLine !== null
  const gutterBtnLine = selectedLines
    ? (hoveredLine !== null && hoveredLine >= selectedLines.start && hoveredLine <= selectedLines.end
        ? selectedLines.end
        : hoveredLine)
    : hoveredLine

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto no-scrollbar relative">
      <File
        file={file}
        selectedLines={selectedLines}
        options={{
          enableLineSelection: true,
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

      {/* Comment box — rendered as overlay after the selected line range */}
      {commenting && selectedLines && (
        <div
          className="absolute left-0 right-0 z-10 px-2"
          style={{ top: `${selectedLines.end * 20 + 8}px` }}
        >
          <div className="rounded-lg border border-border bg-card p-3 shadow-md">
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
                  setCommentText("")
                }
              }}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                {selectedLines.start !== selectedLines.end
                  ? `Lines ${selectedLines.start}-${selectedLines.end}`
                  : `Line ${selectedLines.start}`}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setCommenting(false); setSelectedLines(null); setCommentText("") }}>Cancel</Button>
                <Button size="sm" disabled={!commentText.trim()} onClick={handleSubmitComment}>Comment</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gutter "+" button — React overlay positioned by line number */}
      {showGutterBtn && gutterBtnLine !== null && (
        <button
          className="absolute z-10 size-4 flex items-center justify-center rounded-full bg-foreground text-background hover:bg-foreground/80 transition-colors"
          style={{
            left: "4px",
            top: `${(gutterBtnLine - 1) * 20 + 10}px`,
            transform: "translateY(-50%)",
          }}
          onClick={() => {
            if (!selectedLines) {
              setSelectedLines({ start: gutterBtnLine, end: gutterBtnLine })
            }
            setCommenting(true)
          }}
        >
          <Plus size={10} weight="bold" />
        </button>
      )}
    </div>
  )
}
