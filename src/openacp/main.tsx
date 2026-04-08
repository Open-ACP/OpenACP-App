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

// Intercept all external link clicks — open in browser panel or system browser
document.addEventListener("click", (e) => {
  const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null
  if (!anchor) return
  const href = anchor.getAttribute("href")
  if (!href) return
  if (href.startsWith("http://") || href.startsWith("https://")) {
    e.preventDefault()
    // Check if browser panel is enabled via custom event
    window.dispatchEvent(new CustomEvent("open-in-browser-panel", { detail: { url: href } }))
  }
})

function App() {
  const [screen, setScreen] = useState<StartupScreen>('splash')

  useEffect(() => {
    ;(async () => {
      const { invoke } = await import("@tauri-apps/api/core")
      const [, [installedResult, configResult]] = await Promise.all([
        new Promise(r => setTimeout(r, 2000)),
        Promise.all([
          invoke<string | null>('check_openacp_installed').catch(() => null),
          invoke<boolean>('check_openacp_config').catch(() => false),
        ]),
      ])
      const screen = determineStartupScreen({
        installed: installedResult !== null,
        configExists: Boolean(configResult),
      })
      console.log('[onboard]', {
        installed: installedResult !== null,
        version: installedResult,
        configExists: Boolean(configResult),
        screen,
      })
      setScreen(screen)
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
