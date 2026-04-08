import { useState, useEffect, useCallback, useRef } from "react"
import { check, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"

export interface UpdateState {
  available: boolean
  version: string | null
  checking: boolean
  downloading: boolean
  progress: number // 0-100
  error: string | null
}

const INITIAL_STATE: UpdateState = {
  available: false,
  version: null,
  checking: false,
  downloading: false,
  progress: 0,
  error: null,
}

export function useAppUpdater() {
  const [state, setState] = useState<UpdateState>(INITIAL_STATE)
  const updateRef = useRef<Update | null>(null)

  const checkForUpdate = useCallback(async () => {
    setState((s) => ({ ...s, checking: true, error: null }))
    try {
      const result = await check()
      if (result) {
        updateRef.current = result
        setState((s) => ({
          ...s,
          available: true,
          version: result.version,
          checking: false,
        }))
      } else {
        setState((s) => ({ ...s, checking: false }))
      }
    } catch (e) {
      console.error("[updater] check failed:", e)
      setState((s) => ({
        ...s,
        checking: false,
        error: e instanceof Error ? e.message : "Update check failed",
      }))
    }
  }, [])

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current
    if (!update) return

    setState((s) => ({ ...s, downloading: true, progress: 0, error: null }))
    try {
      let totalBytes = 0
      let downloadedBytes = 0

      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalBytes = event.data.contentLength
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength
          if (totalBytes > 0) {
            setState((s) => ({
              ...s,
              progress: Math.round((downloadedBytes / totalBytes) * 100),
            }))
          }
        } else if (event.event === "Finished") {
          setState((s) => ({ ...s, progress: 100 }))
        }
      })

      await relaunch()
    } catch (e) {
      console.error("[updater] download failed:", e)
      setState((s) => ({
        ...s,
        downloading: false,
        error: e instanceof Error ? e.message : "Update failed",
      }))
    }
  }, [])

  const dismiss = useCallback(() => {
    setState(INITIAL_STATE)
    updateRef.current = null
  }, [])

  // Check on mount with a delay so it does not block startup
  useEffect(() => {
    const timer = setTimeout(checkForUpdate, 5000)
    return () => clearTimeout(timer)
  }, [checkForUpdate])

  // Listen for manual check from settings
  useEffect(() => {
    function handleManualCheck(e: Event) {
      const { version, update } = (e as CustomEvent).detail
      updateRef.current = update
      setState((s) => ({ ...s, available: true, version, checking: false }))
    }
    window.addEventListener("app-update-available", handleManualCheck)
    return () => window.removeEventListener("app-update-available", handleManualCheck)
  }, [])

  return {
    ...state,
    checkForUpdate,
    downloadAndInstall,
    dismiss,
  }
}
