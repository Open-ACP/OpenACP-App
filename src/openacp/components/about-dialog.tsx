import React, { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { type as osType, arch } from "@tauri-apps/plugin-os"
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog"
import { Button } from "./ui/button"
import { VisuallyHidden } from "radix-ui"
import { BrandIcon } from "./brand-loader"

const APP_VERSION = __APP_VERSION__
declare const __APP_VERSION__: string

interface SystemInfo {
  appVersion: string
  coreVersion: string | null
  corePath: string | null
  nodeVersion: string | null
  nodePath: string | null
  os: string
}

async function gatherSystemInfo(): Promise<SystemInfo> {
  const [coreVersion, corePath, nodeInfo] = await Promise.all([
    invoke<string | null>("check_openacp_installed").catch(() => null),
    invoke<string | null>("get_openacp_binary_path").catch(() => null),
    invoke<[string, string] | null>("get_node_info").catch(() => null),
  ])

  let osInfo: string
  try {
    const osName = osType()
    const osArch = arch()
    osInfo = `${osName} ${osArch}`
  } catch {
    osInfo = "Unknown"
  }

  return {
    appVersion: APP_VERSION,
    coreVersion,
    corePath,
    nodeVersion: nodeInfo?.[0] ?? null,
    nodePath: nodeInfo?.[1] ?? null,
    os: osInfo,
  }
}

function formatInfoText(info: SystemInfo): string {
  const lines = [
    `Version: ${info.appVersion}`,
    `Core: ${info.coreVersion ?? "Not installed"}`,
  ]
  if (info.corePath) lines.push(`Core path: ${info.corePath}`)
  if (info.nodeVersion) lines.push(`Node.js: ${info.nodeVersion}`)
  if (info.nodePath) lines.push(`Node path: ${info.nodePath}`)
  lines.push(`OS: ${info.os}`)
  return lines.join("\n")
}

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      void gatherSystemInfo().then(setInfo)
      setCopied(false)
    }
  }, [open])

  async function handleCopy() {
    if (!info) return
    try {
      await navigator.clipboard.writeText(formatInfoText(info))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm p-0 gap-0 overflow-hidden">
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
              <InfoRow label="Version" value={info.appVersion} />
              <InfoRow label="Core" value={info.coreVersion ?? "Not installed"} />
              {info.corePath && <InfoRow label="Core path" value={info.corePath} />}
              {info.nodeVersion && <InfoRow label="Node.js" value={info.nodeVersion} />}
              {info.nodePath && <InfoRow label="Node path" value={info.nodePath} />}
              <InfoRow label="OS" value={info.os} />
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
