import React, { useRef, useEffect } from "react"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import { checksum } from "@openacp/util/encode"
import { stream } from "../../lib/markdown-stream"

type Entry = {
  hash: string
  html: string
}

const MAX_CACHE = 200
const cache = new Map<string, Entry>()

if (typeof window !== "undefined" && DOMPurify.isSupported) {
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (!(node instanceof HTMLAnchorElement)) return
    if (node.target !== "_blank") return
    const rel = node.getAttribute("rel") ?? ""
    const set = new Set(rel.split(/\s+/).filter(Boolean))
    set.add("noopener")
    set.add("noreferrer")
    node.setAttribute("rel", Array.from(set).join(" "))
  })
}

const purifyConfig = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

const iconPaths = {
  copy: '<path d="M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z" stroke="currentColor" stroke-linecap="round"/>',
  check: '<path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-linecap="square"/>',
}

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, purifyConfig)
}

function escape(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function fallback(markdown: string) {
  return escape(markdown).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>")
}

type CopyLabels = { copy: string; copied: string }

const urlPattern = /^https?:\/\/[^\s<>()`"']+$/

function codeUrl(text: string) {
  const href = text.trim().replace(/[),.;!?]+$/, "")
  if (!urlPattern.test(href)) return
  try {
    return new URL(href).toString()
  } catch {
    return
  }
}

function createIcon(path: string, slot: string) {
  const icon = document.createElement("div")
  icon.setAttribute("data-component", "icon")
  icon.setAttribute("data-size", "small")
  icon.setAttribute("data-slot", slot)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("data-slot", "icon-svg")
  svg.setAttribute("fill", "none")
  svg.setAttribute("viewBox", "0 0 20 20")
  svg.setAttribute("aria-hidden", "true")
  svg.innerHTML = path
  icon.appendChild(svg)
  return icon
}

function createCopyButton(labels: CopyLabels) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-component", "icon-button")
  button.setAttribute("data-variant", "secondary")
  button.setAttribute("data-size", "small")
  button.setAttribute("data-slot", "markdown-copy-button")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
  button.appendChild(createIcon(iconPaths.copy, "copy-icon"))
  button.appendChild(createIcon(iconPaths.check, "check-icon"))
  return button
}

function setCopyState(button: HTMLButtonElement, labels: CopyLabels, copied: boolean) {
  if (copied) {
    button.setAttribute("data-copied", "true")
    button.setAttribute("aria-label", labels.copied)
    button.setAttribute("data-tooltip", labels.copied)
    return
  }
  button.removeAttribute("data-copied")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
}

function ensureCodeWrapper(block: HTMLPreElement, labels: CopyLabels) {
  const parent = block.parentElement
  if (!parent) return
  const wrapped = parent.getAttribute("data-component") === "markdown-code"
  if (!wrapped) {
    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-component", "markdown-code")
    parent.replaceChild(wrapper, block)
    wrapper.appendChild(block)
    wrapper.appendChild(createCopyButton(labels))
    return
  }

  const buttons = Array.from(
    parent.querySelectorAll('[data-slot="markdown-copy-button"]'),
  ).filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement)

  if (buttons.length === 0) {
    parent.appendChild(createCopyButton(labels))
    return
  }
  for (const button of buttons.slice(1)) {
    button.remove()
  }
}

function markCodeLinks(root: HTMLDivElement) {
  const codeNodes = Array.from(root.querySelectorAll(":not(pre) > code"))
  for (const code of codeNodes) {
    const href = codeUrl(code.textContent ?? "")
    const parentLink =
      code.parentElement instanceof HTMLAnchorElement &&
      code.parentElement.classList.contains("external-link")
        ? code.parentElement
        : null

    if (!href) {
      if (parentLink) parentLink.replaceWith(code)
      continue
    }

    if (parentLink) {
      parentLink.href = href
      continue
    }

    const link = document.createElement("a")
    link.href = href
    link.className = "external-link"
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    code.parentNode?.replaceChild(link, code)
    link.appendChild(code)
  }
}

function decorate(root: HTMLDivElement, labels: CopyLabels) {
  const blocks = Array.from(root.querySelectorAll("pre"))
  for (const block of blocks) {
    ensureCodeWrapper(block, labels)
  }
  markCodeLinks(root)
}

function setupCodeCopy(root: HTMLDivElement, getLabels: () => CopyLabels) {
  const timeouts = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>()

  const handleClick = async (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('[data-slot="markdown-copy-button"]')
    if (!(button instanceof HTMLButtonElement)) return
    const code = button.closest('[data-component="markdown-code"]')?.querySelector("code")
    const content = code?.textContent ?? ""
    if (!content) return
    const clipboard = navigator?.clipboard
    if (!clipboard) return
    await clipboard.writeText(content)
    const labels = getLabels()
    setCopyState(button, labels, true)
    const existing = timeouts.get(button)
    if (existing) clearTimeout(existing)
    const timeout = setTimeout(() => setCopyState(button, labels, false), 2000)
    timeouts.set(button, timeout)
  }

  root.addEventListener("click", handleClick)

  return () => {
    root.removeEventListener("click", handleClick)
    for (const timeout of timeouts.values()) {
      clearTimeout(timeout)
    }
  }
}

function touch(key: string, value: Entry) {
  cache.delete(key)
  cache.set(key, value)
  if (cache.size <= MAX_CACHE) return
  const first = cache.keys().next().value
  if (!first) return
  cache.delete(first)
}

export interface MarkdownParser {
  parse(markdown: string): string | Promise<string>
}

interface MarkdownProps extends React.HTMLAttributes<HTMLDivElement> {
  text: string
  cacheKey?: string
  streaming?: boolean
  /** Markdown parser instance (e.g. from marked context). */
  parser: MarkdownParser
  /** Labels for copy button. Defaults to English. */
  copyLabels?: CopyLabels
}

const defaultCopyLabels: CopyLabels = { copy: "Copy", copied: "Copied" }

export function Markdown({
  text,
  cacheKey,
  streaming = false,
  parser,
  copyLabels = defaultCopyLabels,
  className,
  ...rest
}: MarkdownProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const copyCleanupRef = useRef<(() => void) | null>(null)
  const copyLabelsRef = useRef(copyLabels)
  copyLabelsRef.current = copyLabels

  useEffect(() => {
    let cancelled = false
    const container = rootRef.current
    if (!container) return

    if (!text) {
      container.innerHTML = ""
      return
    }

    const base = cacheKey ?? checksum(text)

    Promise.all(
      stream(text, streaming).map(async (block, index) => {
        const hash = checksum(block.raw)
        const key = base ? `${base}:${index}:${block.mode}` : hash

        if (key && hash) {
          const cached = cache.get(key)
          if (cached && cached.hash === hash) {
            touch(key, cached)
            return cached.html
          }
        }

        const next = await Promise.resolve(parser.parse(block.src))
        const safe = sanitize(next)
        if (key && hash) touch(key, { hash, html: safe })
        return safe
      }),
    )
      .then((list) => list.join(""))
      .catch(() => fallback(text))
      .then((html) => {
        if (cancelled) return
        if (!container) return

        const labels = copyLabelsRef.current

        if (!html) {
          container.innerHTML = ""
          return
        }

        const temp = document.createElement("div")
        temp.innerHTML = html
        decorate(temp, labels)

        morphdom(container, temp, {
          childrenOnly: true,
          onBeforeElUpdated: (fromEl, toEl) => {
            if (
              fromEl instanceof HTMLButtonElement &&
              toEl instanceof HTMLButtonElement &&
              fromEl.getAttribute("data-slot") === "markdown-copy-button" &&
              toEl.getAttribute("data-slot") === "markdown-copy-button" &&
              fromEl.getAttribute("data-copied") === "true"
            ) {
              setCopyState(toEl, labels, true)
            }
            if (fromEl.isEqualNode(toEl)) return false
            return true
          },
        })

        if (!copyCleanupRef.current) {
          copyCleanupRef.current = setupCodeCopy(container, () => copyLabelsRef.current)
        }
      })

    return () => {
      cancelled = true
    }
  }, [text, cacheKey, streaming, parser])

  // Cleanup copy handler on unmount
  useEffect(() => {
    return () => {
      if (copyCleanupRef.current) {
        copyCleanupRef.current()
        copyCleanupRef.current = null
      }
    }
  }, [])

  return <div ref={rootRef} data-component="markdown" className={className} {...rest} />
}
