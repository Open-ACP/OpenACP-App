import React, { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { check as checkTauriUpdate, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { compareVersions, parseVersionString, MIN_CORE_VERSION } from '../lib/version'
import { loadWorkspaces } from '../api/workspace-store'
import { restartWorkspaceServer } from '../api/workspace-service'

interface CoreUpdateInfo {
  current: string
  latest: string
}

export interface UpdateCheckState {
  // Core
  coreVersion: string | null
  coreBelowMin: boolean
  coreUpdateAvailable: boolean
  coreLatestVersion: string | null
  coreUpdating: boolean
  coreUpdateError: string | null

  // App
  appUpdateAvailable: boolean
  appLatestVersion: string | null
  appDownloading: boolean
  appProgress: number
  appUpdateError: string | null

  // Aggregate
  hasUpdates: boolean
  checking: boolean
  settled: boolean
}

const INITIAL_STATE: UpdateCheckState = {
  coreVersion: null,
  coreBelowMin: false,
  coreUpdateAvailable: false,
  coreLatestVersion: null,
  coreUpdating: false,
  coreUpdateError: null,

  appUpdateAvailable: false,
  appLatestVersion: null,
  appDownloading: false,
  appProgress: 0,
  appUpdateError: null,

  hasUpdates: false,
  checking: false,
  settled: false,
}

export function useUpdateCheck() {
  const [state, setState] = useState<UpdateCheckState>(INITIAL_STATE)
  const appUpdateRef = useRef<Update | null>(null)

  const checkAll = useCallback(async () => {
    setState(s => ({ ...s, checking: true, settled: false }))

    // Check core version first (for hard block)
    let coreVersion: string | null = null
    let coreBelowMin = false
    try {
      const raw = await invoke<string | null>('check_openacp_installed')
      coreVersion = raw ? parseVersionString(raw) : null
      if (coreVersion && MIN_CORE_VERSION !== '0.0.0' && compareVersions(coreVersion, MIN_CORE_VERSION) < 0) {
        coreBelowMin = true
      }
    } catch {
      // Core not installed — handled by onboarding, not here
    }

    setState(s => ({ ...s, coreVersion, coreBelowMin }))

    // If hard blocked, don't bother checking for updates
    if (coreBelowMin) {
      setState(s => ({ ...s, checking: false, settled: true }))
      return
    }

    // Run app + core update checks in parallel
    const [coreResult, appResult] = await Promise.allSettled([
      invoke<CoreUpdateInfo | null>('check_core_update'),
      checkTauriUpdate(),
    ])

    const coreUpdate = coreResult.status === 'fulfilled' ? coreResult.value : null
    const appUpdate = appResult.status === 'fulfilled' ? appResult.value : null

    if (appUpdate) appUpdateRef.current = appUpdate

    const coreUpdateAvailable = coreUpdate !== null
    const appUpdateAvailable = appUpdate !== null

    setState(s => ({
      ...s,
      coreUpdateAvailable,
      coreLatestVersion: coreUpdate?.latest ?? null,
      appUpdateAvailable,
      appLatestVersion: appUpdate?.version ?? null,
      hasUpdates: coreUpdateAvailable || appUpdateAvailable,
      checking: false,
      settled: true,
    }))
  }, [])

  const updateCore = useCallback(async () => {
    setState(s => ({ ...s, coreUpdating: true, coreUpdateError: null }))
    try {
      await invoke('run_install_script')

      // Restart all local workspace servers so they use the new binary
      try {
        const workspaces = await loadWorkspaces()
        await Promise.allSettled(
          workspaces
            .filter(ws => ws.type === 'local' && ws.directory)
            .map(ws => restartWorkspaceServer(ws.directory))
        )
      } catch {
        // Best-effort — servers may not be running
      }

      const raw = await invoke<string | null>('check_openacp_installed')
      const version = raw ? parseVersionString(raw) : null
      setState(s => ({
        ...s,
        coreVersion: version,
        coreBelowMin: false,
        coreUpdating: false,
        coreUpdateAvailable: false,
        coreLatestVersion: null,
        hasUpdates: s.appUpdateAvailable,
      }))
      window.dispatchEvent(new CustomEvent('core-updated'))
    } catch (err) {
      setState(s => ({
        ...s,
        coreUpdating: false,
        coreUpdateError: err instanceof Error ? err.message : String(err),
      }))
    }
  }, [])

  const installAppUpdate = useCallback(async () => {
    const update = appUpdateRef.current
    if (!update) return

    setState(s => ({ ...s, appDownloading: true, appProgress: 0, appUpdateError: null }))
    try {
      let totalBytes = 0
      let downloadedBytes = 0
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalBytes = event.data.contentLength
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          if (totalBytes > 0) {
            setState(s => ({ ...s, appProgress: Math.round((downloadedBytes / totalBytes) * 100) }))
          }
        } else if (event.event === 'Finished') {
          setState(s => ({ ...s, appProgress: 100 }))
        }
      })
      await relaunch()
    } catch (err) {
      setState(s => ({
        ...s,
        appDownloading: false,
        appUpdateError: err instanceof Error ? err.message : String(err),
      }))
    }
  }, [])

  // Run checks on mount
  useEffect(() => {
    void checkAll()
  }, [checkAll])

  return { state, checkAll, updateCore, installAppUpdate }
}

// ─── Context ───────────────────────────────────────────────────────────
//
// The hook is lifted to the top-level App component (main.tsx) so that
// update checks run once for the entire app lifecycle and the toast
// notification works across ALL screens — including the onboarding
// install screen and setup wizard, not just after the user has entered
// the main app.

export type UpdateCheckContextValue = ReturnType<typeof useUpdateCheck>

const UpdateCheckContext = createContext<UpdateCheckContextValue | null>(null)

export function UpdateCheckProvider({
  value,
  children,
}: {
  value: UpdateCheckContextValue
  children: React.ReactNode
}) {
  return React.createElement(UpdateCheckContext.Provider, { value }, children)
}

export function useUpdateCheckContext(): UpdateCheckContextValue {
  const ctx = useContext(UpdateCheckContext)
  if (!ctx) {
    throw new Error(
      'useUpdateCheckContext must be used within an UpdateCheckProvider',
    )
  }
  return ctx
}
