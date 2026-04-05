import React, { useRef, useEffect } from "react"
import { cn } from "../../../lib/utils"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import { marked } from "marked"
import markedKatex from "marked-katex-extension"
import markedShiki from "marked-shiki"
import { bundledLanguages, type BundledLanguage } from "shiki"
import { getSharedHighlighter, registerCustomTheme, type ThemeRegistrationResolved } from "@pierre/diffs"

// ── Theme ────────────────────────────────────────────────────────────────────

let themeRegistered = false
function ensureTheme() {
  if (themeRegistered) return
  themeRegistered = true
  registerCustomTheme("OpenACP", () => {
    return Promise.resolve({
      name: "OpenACP",
      colors: {
        "editor.background": "var(--color-background-stronger)",
        "editor.foreground": "var(--text-base)",
        "gitDecoration.addedResourceForeground": "var(--syntax-diff-add)",
        "gitDecoration.deletedResourceForeground": "var(--syntax-diff-delete)",
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
        { scope: "markup.bold", settings: { fontStyle: "bold", foreground: "var(--text-strong)" } },
        { scope: ["markup.heading", "markup.heading entity.name"], settings: { fontStyle: "bold", foreground: "var(--syntax-info)" } },
      ],
      semanticTokenColors: {},
    } as unknown as ThemeRegistrationResolved)
  })
}

// ── Parsers ──────────────────────────────────────────────────────────────────

const linkRenderer = {
  link({ href, title, text }: { href: string; title?: string | null; text: string }) {
    const titleAttr = title ? ` title="${title}"` : ""
    return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
  },
}

let fullParser: typeof marked | null = null
let fastParser: typeof marked | null = null

function getFullParser() {
  if (fullParser) return fullParser
  ensureTheme()
  fullParser = marked.use(
    { renderer: linkRenderer },
    markedKatex({ throwOnError: false, nonStandard: true }),
    markedShiki({
      async highlight(code, lang) {
        const highlighter = await getSharedHighlighter({ themes: ["OpenACP"], langs: [], preferredHighlighter: "shiki-wasm" })
        if (!(lang in bundledLanguages)) lang = "text"
        if (!highlighter.getLoadedLanguages().includes(lang)) await highlighter.loadLanguage(lang as BundledLanguage)
        return highlighter.codeToHtml(code, { lang: lang || "text", theme: "OpenACP", tabindex: false })
      },
    }),
  )
  return fullParser
}

function getFastParser() {
  if (fastParser) return fastParser
  fastParser = marked.use({ renderer: linkRenderer }, markedKatex({ throwOnError: false, nonStandard: true }))
  return fastParser
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const sanitizeConfig = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, sanitizeConfig)
}

const cache = new Map<string, { hash: string; html: string }>()
const MAX_CACHE = 200

function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return h.toString(36)
}

// ── Component ────────────────────────────────────────────────────────────────
//
// Streaming strategy (single-layer):
//   - Text prop changes arrive from store flush (every rAF ~16ms)
//   - During streaming, we throttle markdown parse+morphdom to every PARSE_INTERVAL
//   - Between parses the DOM stays as-is (no flicker, no layout jump)
//   - When streaming ends, final full render with Shiki highlighting
//   - morphdom handles efficient DOM diffing — only changed nodes update
//
// This avoids the two-layer raw/committed approach which caused height mismatches.

// Cursor-controlled streaming: advance by 1-3 words per tick with random delay.
const TICK_MIN = 5         // ms min delay
const TICK_MAX = 15        // ms max delay
const WORDS_MIN = 1        // min words per tick
const WORDS_MAX = 3        // max words per tick

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function advanceCursor(text: string, cursor: number): number {
  const words = randomInt(WORDS_MIN, WORDS_MAX)
  let pos = cursor
  let counted = 0
  // Skip leading whitespace
  while (pos < text.length && /\s/.test(text[pos]!)) pos++
  // Advance N words
  while (pos < text.length && counted < words) {
    // Consume non-whitespace (word)
    while (pos < text.length && !/\s/.test(text[pos]!)) pos++
    counted++
    // Consume trailing whitespace (include with word)
    while (pos < text.length && /\s/.test(text[pos]!)) pos++
  }
  return pos || Math.min(text.length, cursor + 1)
}

interface MarkdownProps {
  text: string
  cacheKey?: string
  streaming?: boolean
  className?: string
}

export function Markdown({ text, cacheKey, streaming, className }: MarkdownProps) {
  const elRef = useRef<HTMLDivElement>(null)
  const renderingRef = useRef(false)
  const prevStreamingRef = useRef(streaming)
  const lastTextRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textRef = useRef(text)
  const cursorRef = useRef(0) // how many chars are "revealed" to user

  textRef.current = text

  function renderMarkdown(mdText: string, isStreaming: boolean) {
    if (renderingRef.current || !elRef.current) return
    if (mdText === lastTextRef.current) return

    renderingRef.current = true
    lastTextRef.current = mdText

    const parser = isStreaming ? getFastParser() : getFullParser()
    const result = parser.parse(mdText)

    function apply(html: string) {
      renderingRef.current = false
      const safe = sanitize(html)
      const key = cacheKey || "md"

      if (!isStreaming) {
        if (cache.size >= MAX_CACHE) {
          const first = cache.keys().next().value
          if (first) cache.delete(first)
        }
        cache.set(key, { hash: hashString(mdText), html: safe })
      }
      if (elRef.current) {
        morphdom(elRef.current, `<div data-component="markdown">${safe}</div>`, { childrenOnly: true })
      }
    }

    if (result instanceof Promise) result.then(apply)
    else apply(result)
  }

  // Streaming: cursor-based tick loop
  useEffect(() => {
    if (!streaming) return

    function tick() {
      const fullText = textRef.current
      if (cursorRef.current < fullText.length) {
        cursorRef.current = advanceCursor(fullText, cursorRef.current)
      }
      renderMarkdown(fullText.slice(0, cursorRef.current), true)

      if (streamingRef.current || cursorRef.current < textRef.current.length) {
        timerRef.current = setTimeout(tick, randomInt(TICK_MIN, TICK_MAX))
      }
    }

    const streamingRef = { current: true }
    timerRef.current = setTimeout(tick, randomInt(TICK_MIN, TICK_MAX))

    return () => {
      streamingRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [streaming])

  // When streaming ends: final full Shiki render
  useEffect(() => {
    if (prevStreamingRef.current && !streaming) {
      cache.delete(cacheKey || "md")
      lastTextRef.current = ""
      cursorRef.current = 0 // reset cursor for next stream
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      renderMarkdown(text, false)
    }
    prevStreamingRef.current = streaming
  }, [streaming, text, cacheKey])

  // Non-streaming: render on text change
  useEffect(() => {
    if (streaming) return
    if (!elRef.current || !text) return

    const key = cacheKey || "md"
    const hash = hashString(text)
    const cached = cache.get(key)

    if (cached && cached.hash === hash) {
      if (elRef.current.innerHTML !== cached.html) {
        morphdom(elRef.current, `<div data-component="markdown">${cached.html}</div>`, { childrenOnly: true })
      }
      return
    }

    renderMarkdown(text, false)
  }, [text, cacheKey, streaming])

  return (
    <div
      ref={elRef}
      data-component="markdown"
      className={cn("prose prose-sm max-w-none", className)}
    />
  )
}
