import { createResource, createSignal, For, Show } from "solid-js"
import { Switch } from "@openacp/ui/switch"
import { Tooltip } from "@openacp/ui/tooltip"
import { Spinner } from "@openacp/ui/spinner"
import { showToast } from "@openacp/ui/toast"
import { useWorkspace } from "../context/workspace"
import type { InstalledPlugin } from "../types"
import { CommandBlock } from "./plugin-command-block"

type WorkspaceCtx = ReturnType<typeof useWorkspace>

interface Props {
  workspace: WorkspaceCtx
}

export function InstalledTab(props: Props) {
  const client = () => props.workspace.client
  const isRemote = () => props.workspace.workspace.type === 'remote'

  const [plugins, { refetch }] = createResource(() => client().listPlugins())
  const [configuringPlugin, setConfiguringPlugin] = createSignal<string | null>(null)
  const [pendingActions, setPendingActions] = createSignal<Set<string>>(new Set())

  function setActionPending(name: string, pending: boolean) {
    setPendingActions(prev => {
      const next = new Set(prev)
      if (pending) next.add(name)
      else next.delete(name)
      return next
    })
  }

  async function handleToggle(plugin: InstalledPlugin) {
    if (pendingActions().has(plugin.name)) return
    setActionPending(plugin.name, true)
    try {
      if (plugin.enabled) {
        await client().disablePlugin(plugin.name)
      } else {
        await client().enablePlugin(plugin.name)
      }
      await refetch()
    } catch (err: any) {
      showToast({ description: err?.message ?? "Action failed", variant: "error" })
    } finally {
      setActionPending(plugin.name, false)
    }
  }

  async function handleUninstall(plugin: InstalledPlugin) {
    if (!confirm(`Uninstall ${plugin.name}? This cannot be undone.`)) return
    setActionPending(plugin.name, true)
    try {
      await client().uninstallPlugin(plugin.name)
      await refetch()
    } catch (err: any) {
      showToast({ description: err?.message ?? "Uninstall failed", variant: "error" })
    } finally {
      setActionPending(plugin.name, false)
    }
  }

  function getConfigureCommand(name: string): string {
    if (isRemote()) return `openacp plugin configure ${name}`
    return `openacp plugin configure ${name} --dir ${props.workspace.directory}`
  }

  function getRestartCommand(): string {
    if (isRemote()) return `openacp restart`
    return `openacp restart --dir ${props.workspace.directory}`
  }

  return (
    <div class="p-4 flex flex-col gap-2">
      <Show when={plugins.loading}>
        <div class="flex justify-center py-8"><Spinner /></div>
      </Show>

      <Show when={plugins.error}>
        <div class="text-red-500 text-14-regular text-center py-8">
          Failed to load plugins.
          <button class="underline ml-1" onClick={refetch}>Retry</button>
        </div>
      </Show>

      <For each={plugins()?.plugins}>
        {(plugin) => (
          <div class="border border-border-base rounded-lg p-3 flex flex-col gap-2">
            <div class="flex items-start justify-between gap-2">
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-14-medium text-text-strong truncate">{plugin.name}</span>
                  <span class={`text-12-regular px-1.5 py-0.5 rounded ${plugin.source === 'builtin' ? 'bg-surface-base text-text-weak' : 'bg-blue-500/10 text-blue-500'}`}>
                    {plugin.source === 'builtin' ? 'Built-in' : plugin.source}
                  </span>
                  <Show when={plugin.failed}>
                    <span class="text-12-regular px-1.5 py-0.5 rounded bg-red-500/10 text-red-500">Failed</span>
                  </Show>
                  <Show when={!plugin.failed && plugin.loaded}>
                    <span class="text-12-regular text-green-500">● Running</span>
                  </Show>
                  <Show when={!plugin.failed && !plugin.loaded}>
                    <span class="text-12-regular text-text-weak">○ Disabled</span>
                  </Show>
                </div>
                <Show when={plugin.description}>
                  <span class="text-12-regular text-text-weak mt-0.5">{plugin.description}</span>
                </Show>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <Show when={plugin.hasConfigure}>
                  <button
                    class="text-12-regular text-text-base hover:text-text-strong transition-colors"
                    onClick={() => setConfiguringPlugin(prev => prev === plugin.name ? null : plugin.name)}
                  >
                    Configure
                  </button>
                </Show>

                <Show when={plugin.essential} fallback={
                  <Switch
                    checked={plugin.enabled}
                    disabled={pendingActions().has(plugin.name)}
                    onChange={() => handleToggle(plugin)}
                  />
                }>
                  <Tooltip value="Essential plugins cannot be disabled" placement="top">
                    <Switch checked={plugin.enabled} disabled={true} onChange={() => {}} />
                  </Tooltip>
                </Show>

                <Show when={plugin.source !== 'builtin'}>
                  <button
                    class="text-12-regular text-red-500 hover:text-red-400 transition-colors disabled:opacity-40"
                    disabled={pendingActions().has(plugin.name)}
                    onClick={() => handleUninstall(plugin)}
                  >
                    Uninstall
                  </button>
                </Show>
              </div>
            </div>

            <Show when={configuringPlugin() === plugin.name}>
              <div class="mt-1 p-3 bg-surface-base rounded-md flex flex-col gap-2 border border-border-base">
                <CommandBlock label="Run in your terminal:" command={getConfigureCommand(plugin.name)} />
                <CommandBlock label="Restart the server to apply changes:" command={getRestartCommand()} />
                <button
                  class="text-12-regular text-text-weak hover:text-text-base self-start"
                  onClick={() => setConfiguringPlugin(null)}
                >
                  Close
                </button>
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}

