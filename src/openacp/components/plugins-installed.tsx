import React, { useState, useEffect, useCallback } from "react"
import { showToast } from "../lib/toast"
import { useWorkspace } from "../context/workspace"
import type { InstalledPlugin } from "../types"
import { CommandBlock } from "./plugin-command-block"
import { Switch } from "./ui/switch"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"

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
      {loading && <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 rounded-full oac-spinner" style={{ borderColor: "var(--muted-foreground)", borderTopColor: "transparent" }} /></div>}
      {error && (
        <div className="text-red-500 text-base leading-xl text-center py-8">
          Failed to load plugins.{" "}
          <Button variant="link" className="ml-1 p-0 h-auto text-base leading-xl" onClick={refetch}>Retry</Button>
        </div>
      )}
      {plugins?.plugins.map((plugin) => (
        <div key={plugin.name} className="border border-border rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-medium leading-lg text-foreground truncate">{plugin.name}</span>
                {plugin.source === 'builtin'
                  ? <Badge variant="secondary" className="text-sm leading-lg">Built-in</Badge>
                  : <Badge variant="outline" className="text-sm leading-lg bg-blue-500/10 text-blue-500 border-transparent">{plugin.source}</Badge>
                }
                {plugin.failed && <Badge variant="destructive" className="text-sm leading-lg">Failed</Badge>}
                {!plugin.failed && plugin.loaded && <Badge variant="outline" className="text-sm leading-lg text-green-500 border-transparent">Running</Badge>}
                {!plugin.failed && !plugin.loaded && <Badge variant="secondary" className="text-sm leading-lg text-muted-foreground">Disabled</Badge>}
              </div>
              {plugin.description && <span className="text-sm leading-lg text-muted-foreground mt-0.5">{plugin.description}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {plugin.hasConfigure && (
                <Button variant="ghost" size="xs" onClick={() => setConfiguringPlugin(prev => prev === plugin.name ? null : plugin.name)}>
                  Configure
                </Button>
              )}
              <Switch
                checked={plugin.enabled}
                onCheckedChange={() => handleToggle(plugin)}
                disabled={plugin.essential || pendingActions.has(plugin.name)}
                title={plugin.essential ? "Essential plugins cannot be disabled" : undefined}
              />
              {plugin.source !== 'builtin' && (
                <Button variant="ghost" size="xs" className="text-red-500 hover:text-red-400" disabled={pendingActions.has(plugin.name)} onClick={() => handleUninstall(plugin)}>
                  Uninstall
                </Button>
              )}
            </div>
          </div>
          {configuringPlugin === plugin.name && (
            <div className="mt-1 p-3 bg-surface-base rounded-md flex flex-col gap-2 border border-border">
              <CommandBlock label="Run in your terminal:" command={getConfigureCommand(plugin.name)} />
              <CommandBlock label="Restart the server to apply changes:" command={getRestartCommand()} />
              <Button variant="ghost" size="xs" className="text-sm leading-lg text-muted-foreground hover:text-foreground-weak self-start px-0" onClick={() => setConfiguringPlugin(null)}>Close</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
