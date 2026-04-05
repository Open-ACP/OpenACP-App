import React, { useState } from "react"
import { Button } from "../ui/button"

const APP_VERSION = __APP_VERSION__
const GITHUB_URL = "https://github.com/Open-ACP/OpenACP-App"
const DOCS_URL = "https://github.com/Open-ACP/OpenACP-App#readme"

declare const __APP_VERSION__: string

export function SettingsAbout() {
  const [checking, setChecking] = useState(false)

  async function handleCheckForUpdates() {
    setChecking(true)
    try {
      const { check } = await import("@tauri-apps/plugin-updater")
      const update = await check()
      if (update) {
        window.alert(`Update available: ${update.version}`)
      } else {
        window.alert("You are on the latest version.")
      }
    } catch {
      window.alert("Failed to check for updates.")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div data-component="oac-settings" className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg-medium text-foreground mb-1">About</h2>
        <p className="text-sm-regular text-muted-foreground">Application information</p>
      </div>

      <SettingRow label="Version" description="Current application version">
        <span className="text-sm-regular text-foreground-weak font-mono">{APP_VERSION}</span>
      </SettingRow>

      <SettingRow label="GitHub" description="View the source code and report issues">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm-regular text-foreground-weak hover:text-foreground underline underline-offset-2"
        >
          Repository
        </a>
      </SettingRow>

      <SettingRow label="Documentation" description="Read the official documentation">
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm-regular text-foreground-weak hover:text-foreground underline underline-offset-2"
        >
          Docs
        </a>
      </SettingRow>

      <SettingRow label="Updates" description="Check if a newer version is available">
        <Button
          variant="outline"
          size="sm"
          disabled={checking}
          onClick={() => void handleCheckForUpdates()}
        >
          {checking ? "Checking..." : "Check for updates"}
        </Button>
      </SettingRow>
    </div>
  )
}

function SettingRow(props: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border-weak/50 last:border-b-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-md-medium text-foreground">{props.label}</span>
        <span className="text-sm-regular text-muted-foreground">{props.description}</span>
      </div>
      <div className="shrink-0">{props.children}</div>
    </div>
  )
}
