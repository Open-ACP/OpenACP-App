import React, { useState, useEffect, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { showToast } from "../../lib/toast"
import type { WorkspaceEntry } from "../../api/workspace-store"

interface AgentEntry {
  key: string
  name: string
  version: string
  installed: boolean
  available: boolean
  description: string
}

interface SetupModalProps {
  open: boolean
  path: string
  instanceId: string
  instanceName: string
  onComplete: (entry: WorkspaceEntry) => void
  onClose: () => void
}

export function SetupModal(props: SetupModalProps) {
  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState("")
  const [installingAgent, setInstallingAgent] = useState("")
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState("")

  const folderName = props.path.split("/").pop() ?? "workspace"

  useEffect(() => {
    if (!props.open) return
    invoke<string>("run_openacp_agents_list").then((result) => {
      const raw = typeof result === "string" ? JSON.parse(result) : result
      let list: AgentEntry[]
      if (Array.isArray(raw)) list = raw
      else if (raw?.data?.agents) list = raw.data.agents
      else list = []
      const claude = list.find((a) => a.key === "claude" && a.installed)
      if (claude) setSelectedAgent("claude")
      setAgents(list)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [props.open])

  const installAgent = async (key: string) => {
    setInstallingAgent(key)
    const unlisten = await listen<string>("agent-install-output", () => {})
    try {
      await invoke("run_openacp_agent_install", { agentKey: key })
      setSelectedAgent(key)
      setAgents((prev) => prev.map((a) => a.key === key ? { ...a, installed: true } : a))
    } catch (err) {
      showToast({ description: `Failed to install ${key}`, variant: "error" })
    } finally {
      setInstallingAgent("")
      unlisten()
    }
  }

  const handleStart = async () => {
    setStarting(true)
    setError("")
    try {
      // Run setup to create config.json, agents.json, plugins.json and register the instance.
      // This is idempotent — safe to call even if .openacp already partially exists.
      await invoke<string>("invoke_cli", {
        args: ["setup", "--agent", selectedAgent, "--dir", props.path, "--json"],
      }).catch((e) => console.warn("[setup-modal] setup:", e))

      // Start server
      await invoke<string>("invoke_cli", { args: ["start", "--dir", props.path] })
      props.onComplete({
        id: props.instanceId,
        name: props.instanceName,
        directory: props.path,
        type: "local",
      })
    } catch (e: any) {
      console.error("[setup-modal] start failed:", e)
      const msg = typeof e === "string" ? e : e?.message ?? "Failed to start"
      setError(msg)
      setStarting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set up {folderName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-3">Select an AI agent for this workspace</p>
            {loading ? (
              <p className="text-sm text-muted-foreground py-4">Loading agents...</p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {agents.map((agent) => (
                  <div
                    key={agent.key}
                    role="button"
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                      selectedAgent === agent.key
                        ? "border-foreground bg-accent"
                        : "border-border-weak hover:bg-accent"
                    } ${!agent.installed ? "opacity-60" : ""}`}
                    onClick={() => agent.installed && setSelectedAgent(agent.key)}
                  >
                    <div
                      aria-hidden={!agent.installed}
                      className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                        !agent.installed
                          ? "opacity-0"
                          : selectedAgent === agent.key
                            ? "border-foreground bg-foreground"
                            : "border-muted-foreground"
                      }`}
                    >
                      {agent.installed && selectedAgent === agent.key && (
                        <div className="size-1.5 rounded-full bg-background" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">{agent.name}</span>
                    </div>
                    {agent.installed ? (
                      <span className="text-2xs text-muted-foreground">Installed</span>
                    ) : agent.available ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        disabled={installingAgent === agent.key}
                        onClick={(e) => { e.stopPropagation(); installAgent(agent.key) }}
                      >
                        {installingAgent === agent.key ? "..." : "Install"}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={props.onClose} disabled={starting}>
              Cancel
            </Button>
            <Button onClick={handleStart} disabled={!selectedAgent || starting}>
              {starting ? "Starting..." : "Start workspace"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
