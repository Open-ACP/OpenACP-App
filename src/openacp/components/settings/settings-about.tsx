import React, { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { check as checkTauriUpdate, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
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

  // App update state
  const [appUpdate, setAppUpdate] = useState<Update | null>(null)
  const [appDownloading, setAppDownloading] = useState(false)
  const [appProgress, setAppProgress] = useState(0)
  const [appError, setAppError] = useState<string | null>(null)

  // Core update state
  const [coreUpdate, setCoreUpdate] = useState<CoreUpdateInfo | null>(null)
  const [coreUpdating, setCoreUpdating] = useState(false)
  const [coreError, setCoreError] = useState<string | null>(null)

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

  useEffect(() => {
    function handleCoreUpdated() { loadCoreInfo(); setCoreUpdate(null) }
    window.addEventListener("core-updated", handleCoreUpdated)
    return () => window.removeEventListener("core-updated", handleCoreUpdated)
  }, [])

  async function handleCheckAppUpdate() {
    setCheckingApp(true)
    setAppError(null)
    try {
      const update = await checkTauriUpdate()
      if (update) {
        setAppUpdate(update)
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

  async function handleInstallAppUpdate() {
    if (!appUpdate) return
    setAppDownloading(true)
    setAppProgress(0)
    setAppError(null)
    try {
      let totalBytes = 0, downloadedBytes = 0
      await appUpdate.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) totalBytes = event.data.contentLength
        else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength
          if (totalBytes > 0) setAppProgress(Math.round((downloadedBytes / totalBytes) * 100))
        }
        else if (event.event === "Finished") setAppProgress(100)
      })
      await relaunch()
    } catch (err) {
      setAppError(typeof err === "string" ? err : (err as any)?.message ?? "Update failed")
      setAppDownloading(false)
    }
  }

  async function handleCheckCoreUpdate() {
    setCheckingCore(true)
    setCoreError(null)
    try {
      const result = await invoke<CoreUpdateInfo | null>("check_core_update")
      if (result) {
        setCoreUpdate(result)
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

  async function handleInstallCoreUpdate() {
    setCoreUpdating(true)
    setCoreError(null)
    try {
      await invoke("run_install_script")
      setCoreUpdate(null)
      window.dispatchEvent(new CustomEvent("core-updated"))
      showToast({ description: "Core updated successfully.", variant: "success" })
    } catch (err) {
      setCoreError(typeof err === "string" ? err : (err as any)?.message ?? "Update failed")
    } finally {
      setCoreUpdating(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="Version">
        <SettingRow label="App" description="OpenACP Desktop application">
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground-weak font-mono">{APP_VERSION}</span>
            {appUpdate ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">v{appUpdate.version} available</span>
                {appDownloading ? (
                  <span className="text-xs text-muted-foreground">{appProgress}%</span>
                ) : (
                  <Button size="sm" disabled={appDownloading} onClick={handleInstallAppUpdate}>
                    {appError ? "Retry" : "Install and restart"}
                  </Button>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={checkingApp}
                onClick={() => void handleCheckAppUpdate()}
              >
                {checkingApp ? "Checking..." : "Check update"}
              </Button>
            )}
          </div>
          {appError && <p className="text-xs text-destructive mt-1">{appError}</p>}
        </SettingRow>
        <SettingRow label="Core" description="OpenACP CLI / server engine">
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground-weak font-mono">
              {coreLoading ? "..." : coreVersion ?? "Not installed"}
            </span>
            {coreUpdate ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">v{coreUpdate.latest} available</span>
                <Button size="sm" disabled={coreUpdating} onClick={handleInstallCoreUpdate}>
                  {coreUpdating ? "Installing..." : coreError ? "Retry" : "Install"}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={checkingCore || !coreVersion}
                onClick={() => void handleCheckCoreUpdate()}
              >
                {checkingCore ? "Checking..." : "Check update"}
              </Button>
            )}
          </div>
          {coreError && <p className="text-xs text-destructive mt-1">{coreError}</p>}
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
