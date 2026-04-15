/**
 * OpenACP App — Entry Point (React)
 */
import React, { useState, useEffect, useRef } from "react"
import { createRoot } from "react-dom/client"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"
import { TooltipProvider } from "./components/ui/tooltip"
import "./styles/index.css"
import { OpenACPApp, UpdateToastRow } from "./app"
import { SplashScreen } from "../onboarding/splash-screen"
import { InstallScreen } from "../onboarding/install-screen"
import { SetupWizard } from "../onboarding/setup-wizard"
import { determineStartupScreen, type StartupScreen } from "../onboarding/startup"
import { saveWorkspaces, loadWorkspaces, type WorkspaceEntry } from "./api/workspace-store"
import { restartWorkspaceServer } from "./api/workspace-service"
import { WindowDragBar } from "../onboarding/window-drag-bar"
import { compareVersions, parseVersionString, MIN_CORE_VERSION } from "./lib/version"
import { ArrowLineDown, Package, X } from "@phosphor-icons/react"
import { copyDebugInfo, AboutDialog } from "./components/about-dialog"
import { Toaster } from "./components/ui/toaster"
import { initLogger } from "./lib/logger"
import { useUpdateCheck, UpdateCheckProvider } from "./hooks/use-update-check"

// Initialize frontend logger — intercepts console and writes to file
initLogger()

// Intercept all external link clicks — open in browser panel or system browser
document.addEventListener("click", (e) => {
  const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null
  if (!anchor) return
  const href = anchor.getAttribute("href")
  if (!href) return
  if (href.startsWith("http://") || href.startsWith("https://")) {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent("open-in-browser-panel", { detail: { url: href } }))
  }
})

function App() {
  const [screen, setScreen] = useState<StartupScreen>('splash')
  const [coreVersion, setCoreVersion] = useState<string | null>(null)
  const [showAbout, setShowAbout] = useState(false)

  // Lifted from OpenACPApp so the update check runs once for the entire
  // app lifecycle — including onboarding screens (install + setup wizard).
  // The toast-firing effect below also runs from here so users see the
  // "update available" notification before they finish onboarding, not
  // only after they reach the main app.
  const updateCheck = useUpdateCheck()
  const updateToastShownRef = useRef(false)

  useEffect(() => {
    const { state: updateState, updateCore, installAppUpdate } = updateCheck
    if (
      !updateState.settled ||
      !updateState.hasUpdates ||
      updateToastShownRef.current
    ) {
      return
    }
    updateToastShownRef.current = true

    // Onboarding vs main app: during onboarding the user can't dismiss
    // the toast by navigating away to Settings, and "View details" has
    // nowhere to navigate to (Settings dialog only exists in OpenACPApp).
    // So during onboarding we (1) omit the "View details" footer row and
    // (2) make the toast sticky (Infinity duration) so the user always
    // has the Update button available until they act on it.
    const isOnboarding = screen !== 'ready'

    const openAboutFromToast = () => {
      setShowAbout(true)
    }

    toast.custom(
      (id) => (
        <div className="w-[360px] rounded-lg border border-border bg-card shadow-lg relative overflow-hidden">
          {updateState.appUpdateAvailable && (
            <UpdateToastRow
              icon={<ArrowLineDown size={18} weight="duotone" />}
              title={`App v${updateState.appLatestVersion} available`}
              actionLabel="Install and restart"
              onAction={() => {
                toast.dismiss(id)
                void installAppUpdate()
              }}
            />
          )}
          {updateState.coreUpdateAvailable && (
            <UpdateToastRow
              icon={<Package size={18} weight="duotone" />}
              title={`Core v${updateState.coreLatestVersion} available`}
              actionLabel="Update"
              onAction={() => {
                toast.dismiss(id)
                void updateCore()
              }}
            />
          )}
          <div className="flex items-center justify-between px-3.5 pb-2.5 pt-1">
            {isOnboarding ? (
              <span />
            ) : (
              <button
                onClick={() => {
                  toast.dismiss(id)
                  openAboutFromToast()
                }}
                className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View details
              </button>
            )}
            <button
              onClick={() => toast.dismiss(id)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              aria-label="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ),
      { duration: isOnboarding ? Infinity : 20000 },
    )
  }, [updateCheck, screen])

  // Listen for native menu events — works on ALL screens including onboard.
  //
  // The subtlety: `listen()` is async, so by the time we have an unlisten fn
  // the cleanup may have already run. If we naively push the fn into an array
  // that cleanup reads synchronously, cleanup sees an empty array and the
  // listener leaks. On HMR remounts this causes listener accumulation —
  // click About once → multiple modals.
  //
  // Fix: track a `cancelled` flag. If the async registration completes AFTER
  // cleanup fired, immediately unlisten. Otherwise store the fn for the
  // normal cleanup path.
  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | null = null

    ;(async () => {
      const { listen } = await import("@tauri-apps/api/event")
      const fn = await listen("open-settings-about", () => { setShowAbout(true) })
      if (cancelled) {
        fn()
      } else {
        unlisten = fn
      }
    })()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  const coreBelowMin = coreVersion !== null
    && MIN_CORE_VERSION !== '0.0.0'
    && compareVersions(coreVersion, MIN_CORE_VERSION) < 0

  useEffect(() => {
    ;(async () => {
      const [, [installedResult, configResult, workspaces]] = await Promise.all([
        new Promise(r => setTimeout(r, 2000)),
        Promise.all([
          invoke<string | null>('check_openacp_installed').catch(() => null),
          invoke<boolean>('check_openacp_config').catch(() => false),
          loadWorkspaces().catch(() => []),
        ]),
      ])

      let checkError: string | undefined
      // If CLI reports installed but version is empty/weird, flag it
      if (installedResult !== null && installedResult.trim() === '') {
        checkError = 'CLI found but returned empty version'
      }

      const result = {
        installed: installedResult !== null,
        version: installedResult,
        configExists: Boolean(configResult),
        hasWorkspaces: workspaces.length > 0,
        error: checkError,
      }

      const parsedVersion = installedResult ? parseVersionString(installedResult) : null
      if (parsedVersion) setCoreVersion(parsedVersion)

      // If core is installed but below minimum:
      // - No config yet (first install) → install screen (will install latest)
      // - Has config (existing user) → let it go to 'ready', hard block screen will handle
      const belowMin = parsedVersion
        && MIN_CORE_VERSION !== '0.0.0'
        && compareVersions(parsedVersion, MIN_CORE_VERSION) < 0

      const normalScreen = determineStartupScreen(result)
      const screen = (belowMin && (normalScreen === 'setup' || normalScreen === 'repair'))
        ? 'install'
        : normalScreen
      console.log('[onboard] check result:', JSON.stringify(result), belowMin ? '(core below min)' : '')
      console.log('[onboard] → screen:', screen)

      // If going to setup/install (but NOT because of a core update), clear stale workspace entries
      // (handles dev_reset or reinstall where CLI config is gone but app store persists)
      if ((screen === 'setup' || screen === 'install') && !belowMin) {
        await saveWorkspaces([])
      }

      setScreen(screen)
    })()
  }, [])

  return (
    <TooltipProvider delayDuration={300}>
      <UpdateCheckProvider value={updateCheck}>
        {screen === 'splash' && <SplashScreen />}
        {screen === 'install' && (
          <InstallScreen onSuccess={async () => {
            // After install, re-check state to determine correct next screen
            // (user may already have config + workspaces if this was a core update, not first install)
            const [installedResult, configResult, workspaces] = await Promise.all([
              invoke<string | null>('check_openacp_installed').catch(() => null),
              invoke<boolean>('check_openacp_config').catch(() => false),
              loadWorkspaces().catch(() => []),
            ])
            if (installedResult) setCoreVersion(parseVersionString(installedResult))
            const next = determineStartupScreen({
              installed: installedResult !== null,
              version: installedResult,
              configExists: Boolean(configResult),
              hasWorkspaces: workspaces.length > 0,
            })
            setScreen(next)
          }} />
        )}
        {screen === 'setup' && (
          <SetupWizard onSuccess={async (entry: WorkspaceEntry) => {
            await saveWorkspaces([entry])
            setScreen('ready')
          }} />
        )}
        {screen === 'repair' && (
          <RepairScreen onRepaired={() => setScreen('ready')} onReset={() => setScreen('setup')} />
        )}
        {screen === 'ready' && (
          coreBelowMin ? (
            <CoreUpdateRequired coreVersion={coreVersion!} onSkip={() => setCoreVersion(null)} />
          ) : (
            <OpenACPApp />
          )
        )}
        <AboutDialog open={showAbout} onOpenChange={setShowAbout} />
        <Toaster />
      </UpdateCheckProvider>
    </TooltipProvider>
  )
}

/** Repair screen — shown when CLI is installed but workspace state is broken */
function RepairScreen({ onRepaired, onReset }: { onRepaired: () => void; onReset: () => void }) {
  const [repairing, setRepairing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRepair() {
    setRepairing(true)
    setError(null)
    try {
      // Try to discover and re-register instances
      const { invoke } = await import("@tauri-apps/api/core")
      const stdout = await invoke<string>('invoke_cli', { args: ['instances', 'list', '--json'] })
      const parsed = JSON.parse(stdout)
      const data = parsed?.data ?? parsed
      if (Array.isArray(data) && data.length > 0) {
        // Found instances — save them and proceed
        const entries: WorkspaceEntry[] = data.map((inst: any) => ({
          id: inst.id,
          name: inst.name ?? inst.id,
          directory: inst.directory,
          type: 'local' as const,
        }))
        await saveWorkspaces(entries)
        onRepaired()
      } else {
        // No instances found — let user start fresh
        setError('No workspaces found. You can start fresh with a new setup.')
      }
    } catch (e) {
      setError(typeof e === 'string' ? e : (e as any)?.message ?? 'Repair failed')
    } finally {
      setRepairing(false)
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-bg-base">
      <WindowDragBar />
      <div className="flex flex-col items-center gap-3 max-w-sm text-center">
        <div className="text-lg font-medium text-foreground">Workspace needs repair</div>
        <p className="text-sm text-muted-foreground">
          OpenACP is installed but the workspace configuration seems broken or incomplete. We can try to fix this automatically.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3 mt-2">
          <button
            onClick={handleRepair}
            disabled={repairing}
            className="h-9 px-5 rounded-lg bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {repairing ? 'Repairing...' : 'Auto-repair'}
          </button>
          <button
            onClick={onReset}
            className="h-9 px-5 rounded-lg border border-border text-foreground text-sm font-medium transition-opacity hover:opacity-90"
          >
            Start fresh
          </button>
        </div>
      </div>
    </div>
  )
}

function CoreUpdateRequired({ coreVersion, onSkip }: { coreVersion: string; onSkip?: () => void }) {
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpdate() {
    setUpdating(true)
    setError(null)
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
      } catch { /* best-effort */ }

      location.reload()
    } catch (err) {
      setError(typeof err === 'string' ? err : (err as any)?.message ?? 'Update failed')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-bg-base relative">
      <WindowDragBar />
      {onSkip && (
        <button
          onClick={onSkip}
          className="absolute top-12 right-8 text-2xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip
        </button>
      )}
      <div className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
        <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <ArrowLineDown size={24} weight="duotone" className="text-destructive" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-medium text-foreground">Update Required</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            OpenACP Core v{coreVersion} is no longer supported.
            Update to v{MIN_CORE_VERSION} or newer to continue.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          onClick={handleUpdate}
          disabled={updating}
          className="h-9 px-5 rounded-lg bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {updating ? 'Updating...' : error ? 'Retry' : 'Update Now'}
        </button>
      </div>
    </div>
  )
}

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(<App />)
}

export { OpenACPApp }
