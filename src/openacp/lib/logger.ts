import { invoke } from "@tauri-apps/api/core"

/**
 * Frontend logger — intercepts console methods and forwards to Tauri file logger.
 * Call initLogger() once at app boot (main.tsx).
 *
 * - Preserves original console behavior (DevTools still works)
 * - Writes to ~/.openacp/logs/desktop.log via Tauri command
 * - Debounces writes to avoid flooding during rapid logging
 */

const originals = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

let buffer: Array<{ level: string; message: string }> = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 500 // ms

function flush() {
  if (buffer.length === 0) return
  const batch = buffer.splice(0)
  for (const entry of batch) {
    invoke("write_fe_log", entry).catch(() => {})
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, FLUSH_INTERVAL)
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a
      try { return JSON.stringify(a) } catch { return String(a) }
    })
    .join(" ")
}

function intercept(level: string, original: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    original.apply(console, args)
    const message = formatArgs(args)
    buffer.push({ level, message })
    scheduleFlush()
  }
}

let initialized = false

export function initLogger() {
  if (initialized) return
  initialized = true

  console.log = intercept("INFO", originals.log) as typeof console.log
  console.info = intercept("INFO", originals.info) as typeof console.info
  console.warn = intercept("WARN", originals.warn) as typeof console.warn
  console.error = intercept("ERROR", originals.error) as typeof console.error

  // Capture unhandled errors
  window.addEventListener("error", (e) => {
    buffer.push({ level: "ERROR", message: `[unhandled] ${e.message} at ${e.filename}:${e.lineno}` })
    scheduleFlush()
  })

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason)
    buffer.push({ level: "ERROR", message: `[unhandled-promise] ${reason}` })
    scheduleFlush()
  })

  // Flush on page unload
  window.addEventListener("beforeunload", flush)
}
