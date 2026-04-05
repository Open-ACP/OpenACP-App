import React, { useState } from "react"

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
        <h2 className="text-16-medium text-text-strong mb-1">About</h2>
        <p className="text-13-regular text-text-weak">Application information</p>
      </div>

      <SettingRow label="Version" description="Current application version">
        <span className="text-13-regular text-text-base font-mono">{APP_VERSION}</span>
      </SettingRow>

      <SettingRow label="GitHub" description="View the source code and report issues">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-13-regular text-text-base hover:text-text-strong underline underline-offset-2"
        >
          Repository
        </a>
      </SettingRow>

      <SettingRow label="Documentation" description="Read the official documentation">
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-13-regular text-text-base hover:text-text-strong underline underline-offset-2"
        >
          Docs
        </a>
      </SettingRow>

      <SettingRow label="Updates" description="Check if a newer version is available">
        <button
          className="h-8 rounded-md border border-border-base bg-background-base px-3 text-12-medium text-text-base hover:bg-surface-raised-base-hover transition-colors disabled:opacity-50"
          disabled={checking}
          onClick={() => void handleCheckForUpdates()}
        >
          {checking ? "Checking..." : "Check for updates"}
        </button>
      </SettingRow>
    </div>
  )
}

function SettingRow(props: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border-weaker-base last:border-b-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-14-medium text-text-strong">{props.label}</span>
        <span className="text-12-regular text-text-weak">{props.description}</span>
      </div>
      <div className="shrink-0">{props.children}</div>
    </div>
  )
}
