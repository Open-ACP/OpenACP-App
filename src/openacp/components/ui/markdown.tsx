import React, { useRef, useEffect, useMemo } from "react"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import { marked } from "marked"
import markedKatex from "marked-katex-extension"
import markedShiki from "marked-shiki"
import { bundledLanguages, type BundledLanguage } from "shiki"
import { getSharedHighlighter, registerCustomTheme, type ThemeRegistrationResolved } from "@pierre/diffs"

// Register the theme once
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

// Build parser once
let parserInstance: typeof marked | null = null
function getParser() {
  if (parserInstance) return parserInstance
  ensureTheme()
  parserInstance = marked.use(
    {
      renderer: {
        link({ href, title, text }) {
          const titleAttr = title ? ` title="${title}"` : ""
          return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
        },
      },
    },
    markedKatex({ throwOnError: false, nonStandard: true }),
    markedShiki({
      async highlight(code, lang) {
        const highlighter = await getSharedHighlighter({
          themes: ["OpenACP"],
          langs: [],
          preferredHighlighter: "shiki-wasm",
        })
        if (!(lang in bundledLanguages)) lang = "text"
        if (!highlighter.getLoadedLanguages().includes(lang)) {
          await highlighter.loadLanguage(lang as BundledLanguage)
        }
        return highlighter.codeToHtml(code, { lang: lang || "text", theme: "OpenACP", tabindex: false })
      },
    }),
  )
  return parserInstance
}

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

// Cache for parsed HTML
const cache = new Map<string, { hash: string; html: string }>()
const MAX_CACHE = 200

function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return h.toString(36)
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

  useEffect(() => {
    if (!elRef.current || !text) return
    if (renderingRef.current) return

    const key = cacheKey || "md"
    const hash = hashString(text)
    const cached = cache.get(key)

    if (cached && cached.hash === hash) {
      if (elRef.current.innerHTML !== cached.html) {
        morphdom(elRef.current, `<div data-component="markdown">${cached.html}</div>`, { childrenOnly: true })
      }
      return
    }

    renderingRef.current = true
    const parser = getParser()
    const result = parser.parse(text)

    if (result instanceof Promise) {
      result.then((html) => {
        renderingRef.current = false
        const safe = sanitize(html)
        if (cache.size >= MAX_CACHE) {
          const first = cache.keys().next().value
          if (first) cache.delete(first)
        }
        cache.set(key, { hash, html: safe })
        if (elRef.current) {
          morphdom(elRef.current, `<div data-component="markdown">${safe}</div>`, { childrenOnly: true })
        }
      })
    } else {
      renderingRef.current = false
      const safe = sanitize(result)
      if (cache.size >= MAX_CACHE) {
        const first = cache.keys().next().value
        if (first) cache.delete(first)
      }
      cache.set(key, { hash, html: safe })
      morphdom(elRef.current, `<div data-component="markdown">${safe}</div>`, { childrenOnly: true })
    }
  }, [text, cacheKey])

  return (
    <div
      ref={elRef}
      data-component="markdown"
      className={className}
    />
  )
}
