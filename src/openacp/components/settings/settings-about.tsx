import React, { useState } from "react"
import { Button } from "../ui/button"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"
import { showToast } from "../../lib/toast"

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
        // Dispatch event so UpdateNotification picks it up
        window.dispatchEvent(new CustomEvent("app-update-available", {
          detail: { version: update.version, update }
        }))
        showToast({ description: `Update available: v${update.version}` })
      } else {
        showToast({ description: "You are on the latest version." })
      }
    } catch (e) {
      console.error("[settings] update check failed:", e)
      showToast({ description: "Failed to check for updates." })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="Application">
        <SettingRow label="Version" description="Current application version">
          <span className="text-sm text-foreground-weak font-mono">{APP_VERSION}</span>
        </SettingRow>
        <SettingRow label="GitHub" description="View the source code and report issues">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-foreground-weak hover:text-foreground underline underline-offset-2"
          >
            Repository
          </a>
        </SettingRow>
        <SettingRow label="Documentation" description="Read the official documentation">
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-foreground-weak hover:text-foreground underline underline-offset-2"
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
      </SettingCard>
    </div>
  )
}
