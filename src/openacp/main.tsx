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
import { saveWorkspaces, type WorkspaceEntry } from "./api/workspace-store"

function App() {
  const [screen, setScreen] = useState<StartupScreen>('splash')

  useEffect(() => {
    ;(async () => {
      const { invoke } = await import("@tauri-apps/api/core")
      const [, [installedResult, configResult]] = await Promise.all([
        new Promise(r => setTimeout(r, 500)),
        Promise.all([
          invoke<string | null>('check_openacp_installed').catch(() => null),
          invoke<boolean>('check_openacp_config').catch(() => false),
        ]),
      ])
      setScreen(determineStartupScreen({
        installed: installedResult !== null,
        configExists: Boolean(configResult),
      }))
    })()
  }, [])

  return (
    <>
      {screen === 'splash' && <SplashScreen />}
      {screen === 'install' && (
        <InstallScreen onSuccess={(configExists) => setScreen(configExists ? 'ready' : 'setup')} />
      )}
      {screen === 'setup' && (
        <SetupWizard onSuccess={async (entry: WorkspaceEntry) => {
          await saveWorkspaces([entry])
          setScreen('ready')
        }} />
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

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(<App />)
}

export { OpenACPApp }
