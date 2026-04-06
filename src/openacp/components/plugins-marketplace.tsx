import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { showToast } from "../lib/toast"
import { useWorkspace } from "../context/workspace"
import type { MarketplacePlugin } from "../types"
import { CommandBlock } from "./plugin-command-block"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"

type WorkspaceCtx = ReturnType<typeof useWorkspace>

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

export function MarketplaceTab({ workspace }: { workspace: WorkspaceCtx }) {
  const client = workspace.client
  const isRemote = workspace.workspace.type === 'remote'

  const [marketplace, setMarketplace] = useState<{ plugins: MarketplacePlugin[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [serverVersion, setServerVersion] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [installingPlugin, setInstallingPlugin] = useState<MarketplacePlugin | null>(null)
  const [pollTimedOut, setPollTimedOut] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true); setError(false)
    try { setMarketplace(await client.getMarketplace()) } catch { setError(true) } finally { setLoading(false) }
  }, [client])

  useEffect(() => { void refetch(); client.getServerVersion().then(setServerVersion).catch(() => null) }, [client, refetch])
  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current) } }, [])

  function stopPolling() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }; if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null } }

  function startPolling(pluginName: string) {
    stopPolling(); setPollTimedOut(false)
    pollRef.current = setInterval(async () => {
      try { const result = await client.listPlugins(); if (result.plugins.some(p => p.name === pluginName)) { stopPolling(); showToast({ description: 'Plugin installed! Please restart.', variant: 'success' }); setInstallingPlugin(null); await refetch() } } catch {}
    }, POLL_INTERVAL_MS)
    pollTimeoutRef.current = setTimeout(() => { stopPolling(); setPollTimedOut(true) }, POLL_TIMEOUT_MS)
  }

  function isVersionTooLow(minRequired: string): boolean {
    if (!serverVersion || !minRequired) return false
    const r = minRequired.split('.').map(Number); const c = serverVersion.split('.').map(Number)
    for (let i = 0; i < 3; i++) { if ((r[i] ?? 0) > (c[i] ?? 0)) return true; if ((r[i] ?? 0) < (c[i] ?? 0)) return false }
    return false
  }

  function getInstallCommand(plugin: MarketplacePlugin): string { return isRemote ? `openacp plugin install ${plugin.npm}` : `openacp plugin install ${plugin.npm} --dir ${workspace.directory}` }
  function getRestartCommand(): string { return isRemote ? `openacp restart` : `openacp restart --dir ${workspace.directory}` }

  const filtered = useMemo(() => {
    const q = search.toLowerCase(); const plugins = marketplace?.plugins ?? []
    if (!q) return plugins
    return plugins.filter(p => `${p.name} ${p.displayName ?? ''} ${p.description} ${(p.tags ?? []).join(' ')}`.toLowerCase().includes(q))
  }, [search, marketplace])

  return (
    <div className="p-4 flex flex-col gap-4">
      {installingPlugin && (
        <div className="border border-border rounded-lg p-4 flex flex-col gap-3 bg-surface-base">
          <div className="flex items-center justify-between">
            <span className="text-base font-medium leading-lg text-foreground">Installing {installingPlugin.displayName ?? installingPlugin.name}</span>
            <Button variant="ghost" size="xs" className="text-sm leading-lg text-muted-foreground" onClick={() => { stopPolling(); setInstallingPlugin(null) }}>Close</Button>
          </div>
          <CommandBlock label="Run in your terminal:" command={getInstallCommand(installingPlugin)} />
          <CommandBlock label="After install completes, restart the server:" command={getRestartCommand()} />
          {isRemote && <p className="text-sm leading-lg text-muted-foreground italic">Run this on the machine hosting the server.</p>}
          <div className="flex items-center gap-2 text-sm leading-lg text-muted-foreground">
            {pollTimedOut
              ? <span>Install not detected. <Button variant="link" className="p-0 h-auto text-sm leading-lg text-foreground-weak" onClick={() => { setPollTimedOut(false); refetch() }}>Refresh</Button></span>
              : <><div className="w-4 h-4 border-2 rounded-full oac-spinner" style={{ borderColor: "var(--muted-foreground)", borderTopColor: "transparent" }} /><span>Waiting for install...</span></>
            }
          </div>
        </div>
      )}
      <Input
        type="search"
        placeholder="Search plugins..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full text-base leading-xl"
      />
      {loading && <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 rounded-full oac-spinner" style={{ borderColor: "var(--muted-foreground)", borderTopColor: "transparent" }} /></div>}
      {error && (
        <div className="text-red-500 text-base leading-xl text-center py-8 flex flex-col items-center gap-2">
          <span>Marketplace unavailable</span>
          <Button variant="outline" size="sm" onClick={refetch}>Retry</Button>
        </div>
      )}
      {filtered.map((plugin) => (
        <div key={plugin.name} className="border border-border rounded-lg p-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-2xl shrink-0 mt-0.5">{plugin.icon}</span>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-base font-medium leading-lg text-foreground">{plugin.displayName ?? plugin.name}</span>
                {plugin.verified
                  ? <Badge variant="outline" className="text-sm leading-lg text-green-500 border-transparent">Verified</Badge>
                  : <Badge variant="outline" className="text-sm leading-lg text-yellow-500 border-transparent">Unverified</Badge>
                }
                {plugin.minCliVersion && isVersionTooLow(plugin.minCliVersion) && (
                  <Badge variant="outline" className="text-sm leading-lg text-yellow-500 border-transparent">Requires v{plugin.minCliVersion}</Badge>
                )}
              </div>
              <span className="text-sm leading-lg text-muted-foreground mt-0.5">{plugin.description}</span>
              <span className="text-sm leading-lg text-muted-foreground mt-1">by {plugin.author} · {plugin.category}</span>
            </div>
          </div>
          <div className="shrink-0">
            {plugin.installed
              ? <Badge variant="outline" className="text-sm leading-lg text-green-500 border-transparent">Installed</Badge>
              : (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-sm leading-lg"
                  disabled={isVersionTooLow(plugin.minCliVersion)}
                  onClick={() => { setInstallingPlugin(plugin); startPolling(plugin.name) }}
                >
                  Install
                </Button>
              )
            }
          </div>
        </div>
      ))}
    </div>
  )
}
