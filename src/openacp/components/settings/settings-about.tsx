import React, { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Button } from "../ui/button"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"
import { useUpdateCheck } from "../../hooks/use-update-check"

const APP_VERSION = __APP_VERSION__
const GITHUB_URL = "https://github.com/Open-ACP/OpenACP-App"
const DOCS_URL = "https://github.com/Open-ACP/OpenACP-App#readme"

declare const __APP_VERSION__: string

function InfoValue({ value, mono }: { value: string | null; mono?: boolean }) {
  return (
    <span className={`text-sm text-fg-weak ${mono ? "font-mono" : ""} max-w-[280px] truncate block text-right`}>
      {value ?? "—"}
    </span>
  )
}

export function SettingsAbout({ onViewed }: { onViewed?: () => void }) {
  const { state, checkAll, updateCore, installAppUpdate } = useUpdateCheck()
  const [nodeVersion, setNodeVersion] = useState<string | null>(null)
  const [nodePath, setNodePath] = useState<string | null>(null)
  const [openacpPath, setOpenacpPath] = useState<string | null>(null)

  // Notify parent that user viewed the About section (clears badge)
  useEffect(() => { onViewed?.() }, [onViewed])

  // Fetch system info on mount
  useEffect(() => {
    void invoke<[string, string] | null>("get_node_info").then((info) => {
      if (info) {
        setNodeVersion(info[0])
        setNodePath(info[1])
      }
    }).catch(() => {})
    void invoke<string | null>("get_openacp_binary_path").then(setOpenacpPath).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="Version">
        <SettingRow label="App" description="OpenACP Desktop application">
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-weak font-mono">{APP_VERSION}</span>
            {state.appUpdateAvailable && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">v{state.appLatestVersion} available</span>
                {state.appDownloading ? (
                  <span className="text-xs text-muted-foreground">{state.appProgress}%</span>
                ) : (
                  <Button size="sm" onClick={installAppUpdate}>
                    {state.appUpdateError ? "Retry" : "Install and restart"}
                  </Button>
                )}
              </div>
            )}
          </div>
          {state.appUpdateError && <p className="text-xs text-destructive mt-1">{state.appUpdateError}</p>}
        </SettingRow>
        <SettingRow label="Core" description="OpenACP CLI / server engine">
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-weak font-mono">
              {state.coreVersion ?? "Not installed"}
            </span>
            {state.coreUpdateAvailable && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">v{state.coreLatestVersion} available</span>
                <Button size="sm" disabled={state.coreUpdating} onClick={updateCore}>
                  {state.coreUpdating ? "Installing..." : state.coreUpdateError ? "Retry" : "Update"}
                </Button>
              </div>
            )}
          </div>
          {state.coreUpdateError && <p className="text-xs text-destructive mt-1">{state.coreUpdateError}</p>}
        </SettingRow>
        <SettingRow label="Node.js" description="Runtime version">
          <InfoValue value={nodeVersion} mono />
        </SettingRow>
        <SettingRow label="" description="">
          <Button
            variant="outline"
            size="sm"
            disabled={state.checking}
            onClick={() => void checkAll()}
          >
            {state.checking ? "Checking..." : "Check for Updates"}
          </Button>
        </SettingRow>
      </SettingCard>

      <SettingCard title="Paths">
        <SettingRow label="OpenACP binary" description="Resolved path to openacp CLI">
          <InfoValue value={openacpPath} mono />
        </SettingRow>
        <SettingRow label="Node.js binary" description="Resolved path to node runtime">
          <InfoValue value={nodePath} mono />
        </SettingRow>
      </SettingCard>

      <SettingCard title="Links">
        <SettingRow label="GitHub" description="View the source code and report issues">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-fg-weak hover:text-foreground underline underline-offset-2"
          >
            Repository
          </a>
        </SettingRow>
        <SettingRow label="Documentation" description="Read the official documentation">
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-fg-weak hover:text-foreground underline underline-offset-2"
          >
            Docs
          </a>
        </SettingRow>
      </SettingCard>
    </div>
  )
}
