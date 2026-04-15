import React, { useState, useEffect, useRef, useCallback } from "react"
import { Plus } from "@phosphor-icons/react"
import { bundledLanguages, type BundledLanguage } from "shiki"
import { getSharedHighlighter, registerCustomTheme, type ThemeRegistrationResolved } from "@pierre/diffs"
import { Button } from "./button"

// ── Theme (reuses the same OpenACP theme as markdown) ────────────────

const THEME_NAME = "OpenACP-viewer"
let themeRegistered = false

function ensureTheme() {
  if (themeRegistered) return
  themeRegistered = true
  registerCustomTheme(THEME_NAME, () => {
    return Promise.resolve({
      name: THEME_NAME,
      colors: {
        "editor.background": "var(--card)",
        "editor.foreground": "var(--fg-weak)",
      },
      tokenColors: [
        { scope: ["comment", "punctuation.definition.comment", "string.comment"], settings: { foreground: "var(--syntax-comment)" } },
        { scope: ["entity.other.attribute-name"], settings: { foreground: "var(--syntax-property)" } },
        { scope: ["constant", "entity.name.constant", "variable.other.constant", "variable.language", "entity"], settings: { foreground: "var(--syntax-constant)" } },
        { scope: ["entity.name", "meta.export.default", "meta.definition.variable"], settings: { foreground: "var(--syntax-type)" } },
        { scope: ["meta.object.member"], settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["variable.parameter.function", "meta.jsx.children", "meta.block", "meta.tag.attributes", "entity.name.constant", "meta.embedded.expression", "meta.template.expression", "string.other.begin.yaml", "string.other.end.yaml"], settings: { foreground: "var(--syntax-punctuation)" } },
        { scope: ["entity.name.function", "support.type.primitive"], settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["support.class.component"], settings: { foreground: "var(--syntax-type)" } },
        { scope: "keyword", settings: { foreground: "var(--syntax-keyword)" } },
        { scope: ["keyword.operator", "storage.type.function.arrow", "punctuation.separator.key-value.css", "entity.name.tag.yaml", "punctuation.separator.key-value.mapping.yaml"], settings: { foreground: "var(--syntax-operator)" } },
        { scope: ["storage", "storage.type"], settings: { foreground: "var(--syntax-keyword)" } },
        { scope: ["storage.modifier.package", "storage.modifier.import", "storage.type.java"], settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["string", "punctuation.definition.string", "string punctuation.section.embedded source", "entity.name.tag"], settings: { foreground: "var(--syntax-string)" } },
        { scope: "support", settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["support.type.object.module", "variable.other.object", "support.type.property-name.css"], settings: { foreground: "var(--syntax-object)" } },
        { scope: "meta.property-name", settings: { foreground: "var(--syntax-property)" } },
        { scope: "variable", settings: { foreground: "var(--syntax-variable)" } },
        { scope: "variable.other", settings: { foreground: "var(--syntax-variable)" } },
      ],
      semanticTokenColors: {},
    } as unknown as ThemeRegistrationResolved)
  })
}

// ── Language mapping ──────────────────────────────────────────────────

function shikiLanguage(lang: string): BundledLanguage | "text" {
  const map: Record<string, BundledLanguage> = {
    typescript: "typescript",
    tsx: "tsx",
    javascript: "javascript",
    jsx: "jsx",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    markdown: "markdown",
    python: "python",
    rust: "rust",
    yaml: "yaml",
    toml: "toml",
    bash: "bash",
    shell: "bash",
    sql: "sql",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    swift: "swift",
    ruby: "ruby",
    php: "php",
    vue: "vue",
    svelte: "svelte",
    xml: "xml",
  }
  const mapped = map[lang]
  if (mapped && mapped in bundledLanguages) return mapped
  if (lang in bundledLanguages) return lang as BundledLanguage
  return "text"
}

// ── Parse Shiki HTML into line HTML strings ──────────────────────────

function parseShikiLines(html: string): string[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  const lines = doc.querySelectorAll(".line")
  if (lines.length === 0) return [html]
  return Array.from(lines).map(el => el.innerHTML)
}

// ── Inline comment box ───────────────────────────────────────────────

function InlineCommentBox({
  startLine,
  endLine,
  filePath,
  selectedCode,
  onSubmit,
  onCancel,
}: {
  startLine: number
  endLine: number
  filePath?: string
  selectedCode: string
  onSubmit: (comment: string, code: string, lines: [number, number], file?: string) => void
  onCancel: () => void
}) {
  const [comment, setComment] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    if (!comment.trim()) return
    onSubmit(comment.trim(), selectedCode, [startLine, endLine], filePath)
    setComment("")
  }

  return (
    <div className="mx-3 my-1.5 rounded-lg border border-border bg-card p-3">
      <textarea
        ref={textareaRef}
        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-y min-h-[60px] max-h-[120px] focus:outline-none"
        placeholder="Add comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit()
          if (e.key === "Escape") onCancel()
        }}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted-foreground">
          Commenting on line{startLine !== endLine ? `s ${startLine}-${endLine}` : ` ${startLine}`}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={!comment.trim()} onClick={handleSubmit}>Comment</Button>
        </div>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────

interface CodeViewerProps {
  content: string
  language: string
  filePath?: string
  onComment?: (comment: string, code: string, lines: [number, number], file?: string) => void
}

export function CodeViewer({ content, language, filePath, onComment }: CodeViewerProps) {
  const [lineHtmls, setLineHtmls] = useState<string[]>([])
  const [hoveredLine, setHoveredLine] = useState<number | null>(null)
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [commenting, setCommenting] = useState(false)
  const selectionAnchor = useRef<number | null>(null)
  const lines = content.split("\n")

  useEffect(() => {
    let cancelled = false
    ensureTheme()

    async function highlight() {
      const highlighter = await getSharedHighlighter({ themes: [THEME_NAME], langs: [], preferredHighlighter: "shiki-wasm" })
      const lang = shikiLanguage(language)

      if (lang !== "text" && !highlighter.getLoadedLanguages().includes(lang)) {
        await highlighter.loadLanguage(lang as BundledLanguage)
      }

      const result = highlighter.codeToHtml(content, {
        lang: lang === "text" ? "text" : lang,
        theme: THEME_NAME,
      })

      if (!cancelled) setLineHtmls(parseShikiLines(result))
    }

    highlight()
    return () => { cancelled = true }
  }, [content, language])

  const handleLineClick = useCallback((lineNum: number, e: React.MouseEvent) => {
    if (e.shiftKey && selectionAnchor.current !== null) {
      const start = Math.min(selectionAnchor.current, lineNum)
      const end = Math.max(selectionAnchor.current, lineNum)
      setSelection({ start, end })
    } else {
      selectionAnchor.current = lineNum
      setSelection({ start: lineNum, end: lineNum })
    }
    setCommenting(false)
  }, [])

  const handleAddComment = useCallback((lineNum: number) => {
    if (!selection) {
      selectionAnchor.current = lineNum
      setSelection({ start: lineNum, end: lineNum })
    }
    setCommenting(true)
  }, [selection])

  const handleCommentSubmit = useCallback((comment: string, code: string, lineRange: [number, number], file?: string) => {
    onComment?.(comment, code, lineRange, file)
    setSelection(null)
    setCommenting(false)
    selectionAnchor.current = null
  }, [onComment])

  const handleCommentCancel = useCallback(() => {
    setCommenting(false)
    setSelection(null)
    selectionAnchor.current = null
  }, [])

  const containerRef = useRef<HTMLDivElement>(null)
  const mouseDown = useRef(false)

  // Detect native text selection → convert to line range
  const handleMouseUp = useCallback(() => {
    mouseDown.current = false
    if (commenting) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !containerRef.current) return

    const range = sel.getRangeAt(0)
    // Find which line elements the selection spans
    const allLineEls = containerRef.current.querySelectorAll("[data-line]")
    let startLine: number | null = null
    let endLine: number | null = null

    for (const el of allLineEls) {
      const ln = Number(el.getAttribute("data-line"))
      if (range.intersectsNode(el)) {
        if (startLine === null) startLine = ln
        endLine = ln
      }
    }

    if (startLine !== null && endLine !== null) {
      setSelection({ start: startLine, end: endLine })
      selectionAnchor.current = startLine
    }
  }, [commenting])

  const isLineSelected = (lineNum: number) =>
    selection !== null && lineNum >= selection.start && lineNum <= selection.end

  const selectedCode = selection
    ? lines.slice(selection.start - 1, selection.end).join("\n")
    : ""

  if (lineHtmls.length === 0) {
    return (
      <div className="h-full w-full p-2">
        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">{content}</pre>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto no-scrollbar oac-code-viewer select-text" onMouseDown={() => { mouseDown.current = true }} onMouseUp={handleMouseUp}>
      <div className="font-mono" style={{ fontSize: "12px", lineHeight: "20px", padding: "8px 0" }}>
        {lineHtmls.map((lineHtml, i) => {
          const lineNum = i + 1
          const selected = isLineSelected(lineNum)
          const isHovered = hoveredLine === lineNum
          const showCommentBox = commenting && selection && lineNum === selection.end

          return (
            <React.Fragment key={i}>
              <div
                data-line={lineNum}
                className={`flex items-stretch hover:bg-accent/30 transition-colors ${selected ? "bg-primary/10" : ""}`}
                onMouseEnter={() => { if (!mouseDown.current) setHoveredLine(lineNum) }}
                onMouseLeave={() => { if (!mouseDown.current) setHoveredLine(null) }}
              >
                {/* Gutter: line number + add button */}
                <div
                  className="shrink-0 select-none cursor-pointer flex items-center justify-end pr-3 relative"
                  style={{ width: "4em" }}
                  onClick={(e) => handleLineClick(lineNum, e)}
                >
                  {onComment && !commenting && (
                    (selected && selection && lineNum === selection.end) || (isHovered && !selection)
                  ) && (
                    <button
                      className="absolute left-0.5 top-1/2 -translate-y-1/2 size-4 flex items-center justify-center rounded-full bg-foreground text-background hover:bg-foreground/80 transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleAddComment(lineNum) }}
                    >
                      <Plus size={10} weight="bold" />
                    </button>
                  )}
                  <span className="text-foreground-weakest">{lineNum}</span>
                </div>
                {/* Code content */}
                <div
                  className="flex-1 min-w-0 whitespace-pre pl-1 pr-3 select-text"
                  dangerouslySetInnerHTML={{ __html: lineHtml }}
                />
              </div>
              {showCommentBox && (
                <InlineCommentBox
                  startLine={selection.start}
                  endLine={selection.end}
                  filePath={filePath}
                  selectedCode={selectedCode}
                  onSubmit={handleCommentSubmit}
                  onCancel={handleCommentCancel}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
