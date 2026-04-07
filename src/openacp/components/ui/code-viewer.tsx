import React, { useRef, useEffect } from "react"
import * as monaco from "monaco-editor"

// ── Monaco worker setup (offline, no CDN) ────────────────────────────

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker"
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker"

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "typescript" || label === "javascript") return new tsWorker()
    if (label === "json") return new jsonWorker()
    if (label === "css" || label === "scss" || label === "less") return new cssWorker()
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker()
    return new editorWorker()
  },
}

// ── Theme ─────────────────────────────────────────────────────────────

const THEME_NAME = "openacp-dark"
let themeRegistered = false

function ensureTheme() {
  if (themeRegistered) return
  themeRegistered = true
  monaco.editor.defineTheme(THEME_NAME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0a0a0a",
      "editor.foreground": "#c0c0c0",
      "editorLineNumber.foreground": "#555555",
      "editorLineNumber.activeForeground": "#888888",
      "editor.lineHighlightBackground": "#ffffff08",
      "editor.selectionBackground": "#ffffff15",
      "editorWidget.background": "#1a1a1a",
      "scrollbarSlider.background": "#ffffff10",
      "scrollbarSlider.hoverBackground": "#ffffff20",
    },
  })
}

// ── Language mapping ──────────────────────────────────────────────────

function monacoLanguage(lang: string): string {
  const map: Record<string, string> = {
    typescript: "typescript",
    tsx: "typescript",
    javascript: "javascript",
    jsx: "javascript",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    markdown: "markdown",
    python: "python",
    rust: "rust",
    yaml: "yaml",
    toml: "ini",
    bash: "shell",
    shell: "shell",
    sql: "sql",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    swift: "swift",
    ruby: "ruby",
    php: "php",
    vue: "html",
    svelte: "html",
    xml: "xml",
  }
  return map[lang] ?? "plaintext"
}

// ── Component ─────────────────────────────────────────────────────────

interface CodeViewerProps {
  content: string
  language: string
}

export function CodeViewer({ content, language }: CodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    ensureTheme()

    const editor = monaco.editor.create(containerRef.current, {
      value: content,
      language: monacoLanguage(language),
      theme: THEME_NAME,
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: "on",
      fontSize: 12,
      fontFamily: "var(--font-family-mono)",
      lineHeight: 18,
      padding: { top: 8, bottom: 8 },
      renderLineHighlight: "line",
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      scrollbar: {
        vertical: "auto",
        horizontal: "auto",
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      contextmenu: false,
      folding: true,
      wordWrap: "off",
      automaticLayout: true,
      domReadOnly: true,
      cursorStyle: "line",
      cursorBlinking: "solid",
    })

    editorRef.current = editor

    return () => {
      editor.dispose()
      editorRef.current = null
    }
  }, [content, language])

  return <div ref={containerRef} className="h-full w-full" />
}
