import React, { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Button } from "../ui/button"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"
import { showToast } from "../../lib/toast"

const APP_VERSION = __APP_VERSION__
const GITHUB_URL = "https://github.com/Open-ACP/OpenACP-App"
const DOCS_URL = "https://github.com/Open-ACP/OpenACP-App#readme"

declare const __APP_VERSION__: string

interface CoreUpdateInfo {
  current: string
  latest: string
}

export function SettingsAbout() {
  const [checkingApp, setCheckingApp] = useState(false)
  const [checkingCore, setCheckingCore] = useState(false)
  const [coreVersion, setCoreVersion] = useState<string | null>(null)
  const [corePath, setCorePath] = useState<string | null>(null)
  const [coreLoading, setCoreLoading] = useState(true)

  const loadCoreInfo = () => {
    setCoreLoading(true)
    Promise.all([
      invoke<string | null>("check_openacp_installed").catch(() => null),
      invoke<string | null>("get_openacp_binary_path").catch(() => null),
    ]).then(([version, path]) => {
      setCoreVersion(version ?? null)
      setCorePath(path ?? null)
    }).finally(() => setCoreLoading(false))
  }

  useEffect(() => { loadCoreInfo() }, [])

  // Refresh core info after install
  useEffect(() => {
    function handleCoreUpdated() { loadCoreInfo() }
    window.addEventListener("core-updated", handleCoreUpdated)
    return () => window.removeEventListener("core-updated", handleCoreUpdated)
  }, [])

  async function handleCheckAppUpdate() {
    setCheckingApp(true)
    try {
      const { check } = await import("@tauri-apps/plugin-updater")
      const update = await check()
      if (update) {
        window.dispatchEvent(new CustomEvent("app-update-available", {
          detail: { version: update.version, update }
        }))
        showToast({ description: `Update available: v${update.version}` })
      } else {
        showToast({ description: "App is up to date." })
      }
    } catch (e) {
      console.error("[settings] app update check failed:", e)
      showToast({ description: "Failed to check for app updates." })
    } finally {
      setCheckingApp(false)
    }
  }

  async function handleCheckCoreUpdate() {
    setCheckingCore(true)
    try {
      const result = await invoke<CoreUpdateInfo | null>("check_core_update")
      if (result) {
        showToast({ description: `Core update available: v${result.latest} (current: v${result.current})` })
        window.dispatchEvent(new CustomEvent("core-update-available", { detail: result }))
      } else {
        showToast({ description: "Core is up to date." })
      }
    } catch (e) {
      console.error("[settings] core update check failed:", e)
      showToast({ description: "Failed to check for core updates." })
    } finally {
      setCheckingCore(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="Version">
        <SettingRow label="App" description="OpenACP Desktop application">
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground-weak font-mono">{APP_VERSION}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={checkingApp}
              onClick={() => void handleCheckAppUpdate()}
            >
              {checkingApp ? "Checking..." : "Check update"}
            </Button>
          </div>
        </SettingRow>
        <SettingRow label="Core" description="OpenACP CLI / server engine">
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground-weak font-mono">
              {coreLoading ? "..." : coreVersion ?? "Not installed"}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={checkingCore || !coreVersion}
              onClick={() => void handleCheckCoreUpdate()}
            >
              {checkingCore ? "Checking..." : "Check update"}
            </Button>
          </div>
        </SettingRow>
        {corePath && (
          <SettingRow label="Core path" description="Location of the OpenACP binary">
            <span className="text-sm text-foreground-weak font-mono truncate max-w-[300px]" title={corePath}>
              {corePath}
            </span>
          </SettingRow>
        )}
      </SettingCard>

      <SettingCard title="Links">
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
      </SettingCard>
    </div>
  )
}
