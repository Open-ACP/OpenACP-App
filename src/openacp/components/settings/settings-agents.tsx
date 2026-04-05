import React, { useState, useEffect, useCallback, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

interface AgentEntry {
  key: string
  name: string
  description: string
  installed: boolean
  available: boolean
}

// Strip ANSI escape codes from CLI output
const ANSI_RE = /\x1b\[[0-9;]*m/g
function stripAnsi(s: string): string { return s.replace(ANSI_RE, "") }

export function SettingsAgents({ workspacePath }: { workspacePath?: string }) {
  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [installingKey, setInstallingKey] = useState("")
  const [installLog, setInstallLog] = useState("")

  const fetchAgents = useCallback(() => {
    setLoading(true)
    invoke<string>("run_openacp_agents_list", { workspaceDir: workspacePath || null })
      .then((result) => {
        const raw = typeof result === "string" ? JSON.parse(result) : result
        let list: AgentEntry[]
        if (Array.isArray(raw)) list = raw
        else if (raw?.data?.agents) list = raw.data.agents
        else list = []
        setAgents(list)
      })
      .catch(() => setAgents([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const list = q
      ? agents.filter((a) => a.name.toLowerCase().includes(q) || a.key.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
      : agents
    return [...list].sort((a, b) => Number(b.installed) - Number(a.installed))
  }, [agents, search])

  async function handleInstall(key: string) {
    if (installingKey) return
    setInstallingKey(key)
    setInstallLog("")

    const unlisten = await listen<string>("agent-install-output", (event) => {
      setInstallLog((prev) => prev + stripAnsi(event.payload) + "\n")
    })

    try {
      await invoke("run_openacp_agent_install", { agentKey: key, workspaceDir: workspacePath || null })
      fetchAgents()
    } catch (e) {
      setInstallLog((prev) => prev + `\nError: ${e}\n`)
    } finally {
      setInstallingKey("")
      unlisten()
    }
  }

  const [uninstallingKey, setUninstallingKey] = useState("")

  async function handleUninstall(key: string) {
    if (uninstallingKey) return
    setUninstallingKey(key)
    setInstallLog("")
    try {
      const args = workspacePath ? ["--dir", workspacePath, "agents", "uninstall", key] : ["agents", "uninstall", key]
      await invoke("invoke_cli", { args })
      fetchAgents()
    } catch (e) {
      setInstallLog(`Error: ${e}\n`)
    } finally {
      setUninstallingKey("")
    }
  }

  const installed = filtered.filter((a) => a.installed)
  const available = filtered.filter((a) => !a.installed && a.available)

  return (
    <div data-component="oac-settings" className="flex flex-col gap-6">
      <div>
        <h2 className="text-16-medium text-text-strong mb-1">Agents</h2>
        <p className="text-13-regular text-text-weak">Manage AI coding agents</p>
      </div>

      <input
        type="text"
        placeholder="Search agents..."
        className="h-8 rounded-md border border-border-base bg-background-base px-3 text-13-regular text-text-base placeholder:text-text-weak focus:outline-none focus:ring-1 focus:ring-border-selected"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="text-13-regular text-text-weak py-4">Loading agents...</div>
      ) : (
        <>
          {/* Installed */}
          {installed.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-11-regular text-text-weaker uppercase tracking-wider mb-1">Installed</span>
              {installed.map((agent) => (
                <AgentRow
                  key={agent.key}
                  agent={agent}
                  uninstalling={uninstallingKey === agent.key}
                  onUninstall={() => handleUninstall(agent.key)}
                />
              ))}
            </div>
          )}

          {/* Available to install */}
          {available.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-11-regular text-text-weaker uppercase tracking-wider mb-1">Available</span>
              {available.map((agent) => (
                <AgentRow
                  key={agent.key}
                  agent={agent}
                  installing={installingKey === agent.key}
                  onInstall={() => handleInstall(agent.key)}
                />
              ))}
            </div>
          )}

          {installed.length === 0 && available.length === 0 && (
            <div className="text-13-regular text-text-weak py-2">No agents found</div>
          )}
        </>
      )}

      {installLog && (
        <pre className="p-3 rounded-md bg-surface-inset-base border border-border-weaker-base text-11-regular text-text-weak font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">
          {installLog}
        </pre>
      )}
    </div>
  )
}

function AgentRow(props: {
  agent: AgentEntry
  installing?: boolean
  uninstalling?: boolean
  onInstall?: () => void
  onUninstall?: () => void
}) {
  const { agent, installing, uninstalling, onInstall, onUninstall } = props
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md border border-border-weaker-base">
      <div className="flex-1 min-w-0">
        <div className="text-14-medium text-text-strong capitalize">{agent.name}</div>
        {agent.description && (
          <div className="text-12-regular text-text-weak truncate">{agent.description}</div>
        )}
      </div>
      {agent.installed ? (
        onUninstall ? (
          <button
            className="text-12-medium shrink-0 rounded-md border border-border-base px-3 py-1 text-text-weak transition-colors hover:text-text-strong hover:bg-surface-raised-base-hover disabled:opacity-50"
            disabled={uninstalling}
            onClick={onUninstall}
          >
            {uninstalling ? "Removing..." : "Uninstall"}
          </button>
        ) : (
          <span className="text-11-regular text-text-weaker shrink-0 px-2 py-0.5 rounded bg-surface-raised-base">
            installed
          </span>
        )
      ) : onInstall ? (
        <button
          className="text-12-medium shrink-0 rounded-md border border-border-base px-3 py-1 text-text-strong transition-colors hover:bg-surface-raised-base-hover disabled:opacity-50"
          disabled={installing}
          onClick={onInstall}
        >
          {installing ? "Installing..." : "Install"}
        </button>
      ) : null}
    </div>
  )
}
