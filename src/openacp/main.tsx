/**
 * OpenACP App — Entry Point
 */
import { createSignal, onMount, Show } from "solid-js"
import { render } from "solid-js/web"
import "../ui/src/styles/tailwind/index.css"
import "./styles.css"
import { MarkedProvider } from "../ui/src/context/marked"
import { OpenACPApp } from "./app"
import { SplashScreen } from "../onboarding/splash-screen"
import { InstallScreen } from "../onboarding/install-screen"
import { SetupWizard } from "../onboarding/setup-wizard"
import { UpdateToasts } from "../onboarding/update-toast"
import { determineStartupScreen, type StartupScreen } from "../onboarding/startup"
import { saveWorkspaces, type WorkspaceEntry } from "./api/workspace-store"

const root = document.getElementById("root")
if (root) {
  render(() => {
    const [screen, setScreen] = createSignal<StartupScreen>('splash')

    onMount(async () => {
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
    })

    return (
      <>
        <Show when={screen() === 'splash'}>
          <SplashScreen />
        </Show>

        <Show when={screen() === 'install'}>
          <InstallScreen
            onSuccess={(configExists) => setScreen(configExists ? 'ready' : 'setup')}
          />
        </Show>

        <Show when={screen() === 'setup'}>
          <SetupWizard onSuccess={async (entry: WorkspaceEntry) => {
            await saveWorkspaces([entry])
            setScreen('ready')
          }} />
        </Show>

        <Show when={screen() === 'ready'}>
          <MarkedProvider>
            <OpenACPApp />
          </MarkedProvider>
          <UpdateToasts />
        </Show>
      </>
    )
  }, root)
}

export { OpenACPApp }
