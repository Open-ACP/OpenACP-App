import React, { useState, useEffect, useCallback } from "react"
import { showToast } from "../lib/toast"
import { useWorkspace } from "../context/workspace"
import type { InstalledPlugin } from "../types"
import { CommandBlock } from "./plugin-command-block"

type WorkspaceCtx = ReturnType<typeof useWorkspace>

export function InstalledTab({ workspace }: { workspace: WorkspaceCtx }) {
  const client = workspace.client
  const isRemote = workspace.workspace.type === 'remote'

  const [plugins, setPlugins] = useState<{ plugins: InstalledPlugin[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [configuringPlugin, setConfiguringPlugin] = useState<string | null>(null)
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set())

  const refetch = useCallback(async () => {
    setLoading(true); setError(false)
    try { setPlugins(await client.listPlugins()) } catch { setError(true) } finally { setLoading(false) }
  }, [client])

  useEffect(() => { void refetch() }, [refetch])

  function setActionPending(name: string, pending: boolean) {
    setPendingActions(prev => { const next = new Set(prev); if (pending) next.add(name); else next.delete(name); return next })
  }

  async function handleToggle(plugin: InstalledPlugin) {
    if (pendingActions.has(plugin.name)) return; setActionPending(plugin.name, true)
    try { if (plugin.enabled) await client.disablePlugin(plugin.name); else await client.enablePlugin(plugin.name); await refetch() }
    catch (err: any) { showToast({ description: err?.message ?? "Action failed", variant: "error" }) }
    finally { setActionPending(plugin.name, false) }
  }

  async function handleUninstall(plugin: InstalledPlugin) {
    if (!confirm(`Uninstall ${plugin.name}? This cannot be undone.`)) return
    setActionPending(plugin.name, true)
    try { await client.uninstallPlugin(plugin.name); await refetch() }
    catch (err: any) { showToast({ description: err?.message ?? "Uninstall failed", variant: "error" }) }
    finally { setActionPending(plugin.name, false) }
  }

  function getConfigureCommand(name: string): string { return isRemote ? `openacp plugin configure ${name}` : `openacp plugin configure ${name} --dir ${workspace.directory}` }
  function getRestartCommand(): string { return isRemote ? `openacp restart` : `openacp restart --dir ${workspace.directory}` }

  return (
    <div className="p-4 flex flex-col gap-2">
      {loading && <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 rounded-full oac-spinner" style={{ borderColor: "var(--text-weak)", borderTopColor: "transparent" }} /></div>}
      {error && <div className="text-red-500 text-14-regular text-center py-8">Failed to load plugins. <button className="underline ml-1" onClick={refetch}>Retry</button></div>}
      {plugins?.plugins.map((plugin) => (
        <div key={plugin.name} className="border border-border-base rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-14-medium text-text-strong truncate">{plugin.name}</span>
                <span className={`text-12-regular px-1.5 py-0.5 rounded ${plugin.source === 'builtin' ? 'bg-surface-base text-text-weak' : 'bg-blue-500/10 text-blue-500'}`}>{plugin.source === 'builtin' ? 'Built-in' : plugin.source}</span>
                {plugin.failed && <span className="text-12-regular px-1.5 py-0.5 rounded bg-red-500/10 text-red-500">Failed</span>}
                {!plugin.failed && plugin.loaded && <span className="text-12-regular text-green-500">Running</span>}
                {!plugin.failed && !plugin.loaded && <span className="text-12-regular text-text-weak">Disabled</span>}
              </div>
              {plugin.description && <span className="text-12-regular text-text-weak mt-0.5">{plugin.description}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {plugin.hasConfigure && <button className="text-12-regular text-text-base hover:text-text-strong transition-colors" onClick={() => setConfiguringPlugin(prev => prev === plugin.name ? null : plugin.name)}>Configure</button>}
              <button className={`w-9 h-5 rounded-full relative transition-colors ${plugin.enabled ? 'bg-green-500' : 'bg-surface-raised-base'}`} disabled={plugin.essential || pendingActions.has(plugin.name)} onClick={() => handleToggle(plugin)} title={plugin.essential ? "Essential plugins cannot be disabled" : undefined}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${plugin.enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
              </button>
              {plugin.source !== 'builtin' && <button className="text-12-regular text-red-500 hover:text-red-400 transition-colors disabled:opacity-40" disabled={pendingActions.has(plugin.name)} onClick={() => handleUninstall(plugin)}>Uninstall</button>}
            </div>
          </div>
          {configuringPlugin === plugin.name && (
            <div className="mt-1 p-3 bg-surface-base rounded-md flex flex-col gap-2 border border-border-base">
              <CommandBlock label="Run in your terminal:" command={getConfigureCommand(plugin.name)} />
              <CommandBlock label="Restart the server to apply changes:" command={getRestartCommand()} />
              <button className="text-12-regular text-text-weak hover:text-text-base self-start" onClick={() => setConfiguringPlugin(null)}>Close</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
