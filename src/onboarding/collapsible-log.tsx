import React, { useRef, useEffect, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { CaretDown, Copy, Check } from "@phosphor-icons/react"
import AnsiToHtml from "ansi-to-html"

const ansiConverter = new AnsiToHtml({ escapeXML: true, newline: false })

function toHtml(line: string): string {
  try {
    return ansiConverter.toHtml(line)
  } catch {
    return line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
  }
}

function stripAnsi(line: string): string {
  return line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
}

interface Props {
  lines: string[]
  isRunning?: boolean
  maxCollapsedLines?: number
  onCopy?: () => void
}

export function CollapsibleLog({ lines, isRunning = false, maxCollapsedLines = 1 }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    }
  }, [lines.length, expanded])

  const copyLogs = async () => {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager")
    await writeText(lines.map(stripAnsi).join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (lines.length === 0) return null

  const latestLines = lines.slice(-maxCollapsedLines)

  return (
    <div className="w-full overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-900/50">
      {/* Header — always visible, click to toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-800/30"
      >
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-zinc-600"
        >
          <CaretDown size={12} weight="bold" />
        </motion.div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
          Output
        </span>
        <span className="text-[11px] tabular-nums text-zinc-700">
          {lines.length} {lines.length === 1 ? "line" : "lines"}
        </span>
        <div className="flex-1" />
        {lines.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              copyLogs()
            }}
            className="flex items-center gap-1 text-[11px] text-zinc-600 transition-colors hover:text-zinc-400"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </button>

      {/* Collapsed: show latest line */}
      <AnimatePresence initial={false}>
        {!expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-t border-zinc-800/40"
          >
            <div className="px-3 py-2 font-mono text-xs leading-relaxed text-zinc-500">
              {latestLines.map((line, i) => (
                <div key={i} dangerouslySetInnerHTML={{ __html: toHtml(line) }} />
              ))}
              {isRunning && <span className="animate-pulse text-zinc-700">|</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded: full scrollable log */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 200, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-t border-zinc-800/40"
          >
            <div
              ref={scrollRef}
              className="h-[200px] overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed text-zinc-500"
            >
              {lines.map((line, i) => (
                <div key={i} dangerouslySetInnerHTML={{ __html: toHtml(line) }} />
              ))}
              {isRunning && <span className="animate-pulse text-zinc-700">|</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
