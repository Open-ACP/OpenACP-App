import React, { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog"
import { Button } from "./ui/button"
import { VisuallyHidden } from "radix-ui"
import { BrandIcon } from "./brand-loader"
import { showToast } from "../lib/toast"
import { MIN_CORE_VERSION } from "../lib/version"

type DebugInfo = Record<string, string>

async function fetchDebugInfo(): Promise<DebugInfo> {
  try {
    return await invoke<DebugInfo>("get_debug_info")
  } catch {
    return { error: "Failed to collect debug info" }
  }
}

function formatDebugText(info: DebugInfo): string {
  const lines = [
    `OpenACP Desktop v${info.app_version ?? "unknown"}`,
    `Core: ${info.core_version ?? "Not installed"}`,
  ]
  if (info.core_path) lines.push(`Core path: ${info.core_path}`)
  lines.push(`Node.js: ${info.node_version ?? "Not found"}`)
  if (info.node_path) lines.push(`Node path: ${info.node_path}`)
  lines.push(`OS: ${info.os ?? "unknown"}`)
  lines.push(`Config: ${info.config ?? "unknown"}`)
  if (MIN_CORE_VERSION) lines.push(`MIN_CORE_VERSION: ${MIN_CORE_VERSION}`)
  // Shell env snapshot — added in the shell_env refactor so user bug reports
  // include how PATH resolution played out.
  if (info.shell_env_resolved_via) {
    lines.push(`Shell env resolved via: ${info.shell_env_resolved_via}`)
  }
  if (info.shell_env_vars_count) {
    lines.push(`Shell env vars: ${info.shell_env_vars_count}`)
  }
  if (info.shell_env_path) lines.push(`Shell env PATH: ${info.shell_env_path}`)
  // Launcher info — how we spawn openacp. "explicit node (...)" means we
  // bypass the shebang for determinism; "shim + env node" means fallback.
  if (info.openacp_launcher) {
    lines.push(`openacp launcher: ${info.openacp_launcher}`)
  }
  if (info.openacp_entry) lines.push(`openacp entry: ${info.openacp_entry}`)
  if (info.log_path) lines.push(`Log file: ${info.log_path}`)
  return lines.join("\n")
}

async function fetchRecentLogs(): Promise<string[]> {
  try {
    return await invoke<string[]>("get_recent_logs", { count: 100 })
  } catch {
    return []
  }
}

/** Copy debug info + recent logs to clipboard */
/** Collect debug info + recent logs and format as a single text block. */
async function collectDebugText(): Promise<string> {
  const [info, logs] = await Promise.all([fetchDebugInfo(), fetchRecentLogs()])
  const sections = [formatDebugText(info)]
  if (logs.length > 0) {
    sections.push(`\n--- Recent Logs (last ${logs.length} entries) ---\n${logs.join("\n")}`)
  }
  return sections.join("\n")
}

/** Copy full debug info + logs to clipboard. Exported so the native menu
 * path can share the same implementation as the dialog button. */
export async function copyDebugInfo(): Promise<void> {
  try {
    const text = await collectDebugText()
    await navigator.clipboard.writeText(text)
    showToast({ description: "Debug info copied to clipboard" })
  } catch {
    showToast({ description: "Failed to copy debug info", variant: "error" })
  }
}

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [info, setInfo] = useState<DebugInfo | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      void fetchDebugInfo().then(setInfo)
      setCopied(false)
    }
  }, [open])

  // Dialog's Copy button: include recent logs (not just the info shown in
  // the dialog) so user bug reports have the actual CLI stderr captured
  // by the file logger. Previously this used formatDebugText alone, which
  // stripped logs and made remote debugging much harder.
  async function handleCopy() {
    if (!info) return
    try {
      const text = await collectDebugText()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm p-0 gap-0 overflow-hidden backdrop-blur-xl bg-popover/80">
        <VisuallyHidden.Root>
          <DialogTitle>About OpenACP</DialogTitle>
        </VisuallyHidden.Root>

        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <div className="size-16 mb-4">
            <BrandIcon className="size-16" />
          </div>
          <h2 className="text-base font-medium text-foreground mb-6">OpenACP</h2>

          {info ? (
            <div className="w-full space-y-1.5 text-sm font-mono">
              <InfoRow label="Version" value={info.app_version ?? "unknown"} />
              <InfoRow label="Core" value={info.core_version ?? "Not installed"} />
              {info.core_path && <InfoRow label="Core path" value={info.core_path} />}
              <InfoRow label="Node.js" value={info.node_version ?? "Not found"} />
              {info.node_path && <InfoRow label="Node path" value={info.node_path} />}
              <InfoRow label="OS" value={info.os ?? "unknown"} />
              <InfoRow label="Config" value={info.config ?? "unknown"} />
              {info.shell_env_resolved_via && (
                <InfoRow
                  label="Shell env"
                  value={`${info.shell_env_resolved_via} (${info.shell_env_vars_count ?? "?"} vars)`}
                />
              )}
              {info.openacp_launcher && (
                <InfoRow label="Launcher" value={info.openacp_launcher} />
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4">Loading...</div>
          )}
        </div>

        <div className="flex gap-2 px-6 pb-6 pt-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            OK
          </Button>
          <Button
            className="flex-1"
            onClick={handleCopy}
            disabled={!info}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="text-fg-weak break-all">{value}</span>
    </div>
  )
}
