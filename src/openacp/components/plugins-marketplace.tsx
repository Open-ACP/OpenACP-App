import { createResource, createSignal, For, Show, onCleanup } from "solid-js"
import { Spinner } from "@openacp/ui/spinner"
import { showToast } from "@openacp/ui/toast"
import { useWorkspace } from "../context/workspace"
import type { MarketplacePlugin } from "../types"
import { CommandBlock } from "./plugin-command-block"

type WorkspaceCtx = ReturnType<typeof useWorkspace>

interface Props {
  workspace: WorkspaceCtx
}

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export function MarketplaceTab(props: Props) {
  const client = () => props.workspace.client
  const isRemote = () => props.workspace.workspace.type === 'remote'

  const [marketplace, { refetch: refetchMarketplace }] = createResource(
    () => client().getMarketplace()
  )
  const [serverVersion] = createResource(() => client().getServerVersion())
  const [search, setSearch] = createSignal("")
  const [installingPlugin, setInstallingPlugin] = createSignal<MarketplacePlugin | null>(null)
  const [pollTimedOut, setPollTimedOut] = createSignal(false)

  let pollInterval: ReturnType<typeof setInterval> | null = null
  let pollTimeoutHandle: ReturnType<typeof setTimeout> | null = null

  onCleanup(() => {
    if (pollInterval) clearInterval(pollInterval)
    if (pollTimeoutHandle) clearTimeout(pollTimeoutHandle)
  })

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
    if (pollTimeoutHandle) { clearTimeout(pollTimeoutHandle); pollTimeoutHandle = null }
  }

  function startPolling(pluginName: string) {
    stopPolling()
    setPollTimedOut(false)

    pollInterval = setInterval(async () => {
      try {
        const result = await client().listPlugins()
        const found = result.plugins.some(p => p.name === pluginName)
        if (found) {
          stopPolling()
          showToast({ description: 'Plugin installed! Please restart the server.', variant: 'success' })
          setInstallingPlugin(null)
          await refetchMarketplace()
        }
      } catch {
        // silently ignore poll errors
      }
    }, POLL_INTERVAL_MS)

    pollTimeoutHandle = setTimeout(() => {
      stopPolling()
      setPollTimedOut(true)
    }, POLL_TIMEOUT_MS)
  }

  function handleInstall(plugin: MarketplacePlugin) {
    setInstallingPlugin(plugin)
    startPolling(plugin.name)
  }

  function handleManualRefresh() {
    setPollTimedOut(false)
    refetchMarketplace()
  }

  function isVersionTooLow(minRequired: string): boolean {
    const current = serverVersion()
    if (!current || !minRequired) return false
    const r = minRequired.split('.').map(Number)
    const c = current.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      if ((r[i] ?? 0) > (c[i] ?? 0)) return true
      if ((r[i] ?? 0) < (c[i] ?? 0)) return false
    }
    return false
  }

  function getInstallCommand(plugin: MarketplacePlugin): string {
    if (isRemote()) return `openacp plugin install ${plugin.npm}`
    return `openacp plugin install ${plugin.npm} --dir ${props.workspace.directory}`
  }

  function getRestartCommand(): string {
    if (isRemote()) return `openacp restart`
    return `openacp restart --dir ${props.workspace.directory}`
  }

  const filtered = () => {
    const q = search().toLowerCase()
    const plugins = marketplace()?.plugins ?? []
    if (!q) return plugins
    return plugins.filter(p => {
      const text = `${p.name} ${p.displayName ?? ''} ${p.description} ${(p.tags ?? []).join(' ')}`.toLowerCase()
      return text.includes(q)
    })
  }

  return (
    <div class="p-4 flex flex-col gap-4">
      {/* Install flow inline panel */}
      <Show when={installingPlugin()}>
        {(plugin) => (
          <div class="border border-border-base rounded-lg p-4 flex flex-col gap-3 bg-surface-base">
            <div class="flex items-center justify-between">
              <span class="text-14-medium text-text-strong">Installing {plugin().displayName ?? plugin().name}</span>
              <button
                class="text-12-regular text-text-weak hover:text-text-base"
                onClick={() => { stopPolling(); setInstallingPlugin(null) }}
              >
                Close
              </button>
            </div>

            <CommandBlock label="Run in your terminal:" command={getInstallCommand(plugin())} />
            <CommandBlock label="After install completes, restart the server:" command={getRestartCommand()} />

            <Show when={isRemote()}>
              <p class="text-12-regular text-text-weak italic">
                Run this on the machine hosting the server.
              </p>
            </Show>

            <div class="flex items-center gap-2 text-12-regular text-text-weak">
              <Show when={!pollTimedOut()} fallback={
                <span>
                  Install not detected. Did the command complete successfully?{' '}
                  <button class="underline text-text-base" onClick={handleManualRefresh}>Refresh</button>
                </span>
              }>
                <Spinner />
                <span>Waiting for install to complete…</span>
              </Show>
            </div>
          </div>
        )}
      </Show>

      {/* Search */}
      <input
        type="search"
        placeholder="Search plugins…"
        value={search()}
        onInput={(e) => setSearch(e.currentTarget.value)}
        class="w-full px-3 py-1.5 rounded-md border border-border-base bg-background-base text-14-regular text-text-strong placeholder:text-text-weak focus:outline-none focus:ring-2"
      />

      <Show when={marketplace.loading}>
        <div class="flex justify-center py-8"><Spinner /></div>
      </Show>

      <Show when={marketplace.error}>
        <div class="text-red-500 text-14-regular text-center py-8 flex flex-col items-center gap-2">
          <span>Marketplace unavailable</span>
          <button
            class="text-12-regular text-text-base border border-border-base rounded px-3 py-1 hover:bg-surface-raised-base-hover"
            onClick={refetchMarketplace}
          >
            Retry
          </button>
        </div>
      </Show>

      <For each={filtered()}>
        {(plugin) => (
          <div class="border border-border-base rounded-lg p-3 flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
              <span class="text-2xl shrink-0 mt-0.5">{plugin.icon}</span>
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-14-medium text-text-strong">{plugin.displayName ?? plugin.name}</span>
                  <Show when={plugin.verified}>
                    <span class="text-12-regular text-green-500">✓ Verified</span>
                  </Show>
                  <Show when={!plugin.verified}>
                    <span class="text-12-regular text-yellow-500">⚠ Unverified</span>
                  </Show>
                  <Show when={plugin.minCliVersion && isVersionTooLow(plugin.minCliVersion)}>
                    <span class="text-12-regular text-yellow-500">Requires OpenACP v{plugin.minCliVersion}</span>
                  </Show>
                </div>
                <span class="text-12-regular text-text-weak mt-0.5">{plugin.description}</span>
                <span class="text-12-regular text-text-weak mt-1">by {plugin.author} · {plugin.category}</span>
              </div>
            </div>

            <div class="shrink-0">
              <Show when={plugin.installed} fallback={
                <button
                  class="text-12-regular px-3 py-1.5 rounded-md border border-border-base hover:bg-surface-raised-base-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={isVersionTooLow(plugin.minCliVersion)}
                  onClick={() => handleInstall(plugin)}
                >
                  Install
                </button>
              }>
                <span class="text-12-regular text-green-500">Installed ✓</span>
              </Show>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

