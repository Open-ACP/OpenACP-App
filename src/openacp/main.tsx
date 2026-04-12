/**
 * OpenACP App — Entry Point (React)
 */
import React, { useState, useEffect } from "react"
import { createRoot } from "react-dom/client"
import "./styles/index.css"
import { OpenACPApp } from "./app"
import { SplashScreen } from "../onboarding/splash-screen"
import { InstallScreen } from "../onboarding/install-screen"
import { SetupWizard } from "../onboarding/setup-wizard"
import { UpdateToasts } from "../onboarding/update-toast"
import { determineStartupScreen, type StartupScreen } from "../onboarding/startup"
import { saveWorkspaces, loadWorkspaces, type WorkspaceEntry } from "./api/workspace-store"
import { WindowDragBar } from "../onboarding/window-drag-bar"

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

  useEffect(() => {
    ;(async () => {
      const { invoke } = await import("@tauri-apps/api/core")
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

      const screen = determineStartupScreen(result)
      console.log('[onboard] check result:', JSON.stringify(result))
      console.log('[onboard] → screen:', screen)

      // If going to setup/install, clear stale workspace entries
      // (handles dev_reset or reinstall where CLI config is gone but app store persists)
      if (screen === 'setup' || screen === 'install') {
        await saveWorkspaces([])
      }

      setScreen(screen)
    })()
  }, [])

  return (
    <>
      {screen === 'splash' && <SplashScreen />}
      {screen === 'install' && (
        <InstallScreen onSuccess={() => setScreen('setup')} />
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
        <>
          <OpenACPApp />
          <UpdateToasts />
        </>
      )}
    </>
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
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-background-base">
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

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(<App />)
}

export { OpenACPApp }
