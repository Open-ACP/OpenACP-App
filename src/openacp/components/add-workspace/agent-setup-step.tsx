import React, { useState, useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { CaretLeft } from "@phosphor-icons/react"
import { Button } from "../ui/button"
import { showToast } from "../../lib/toast"
import type { WorkspaceEntry } from "../../api/workspace-store"
import { prefetchAgents, invalidateAgentsCache, type AgentEntry } from "../../api/agents-cache"

interface AgentSetupStepProps {
  path: string
  instanceId: string
  instanceName: string
  onComplete: (entry: WorkspaceEntry) => void
  onBack: () => void
}

export function AgentSetupStep(props: AgentSetupStepProps) {
  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState("")
  const [installingAgent, setInstallingAgent] = useState("")
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState("")

  const folderName = props.path.split("/").pop() ?? "workspace"
  const backRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    backRef.current?.focus()
  }, [])

  useEffect(() => {
    prefetchAgents().then((list) => {
      const claude = list.find((a) => a.key === "claude" && a.installed)
      if (claude) setSelectedAgent("claude")
      setAgents(list)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const installAgent = async (key: string) => {
    setInstallingAgent(key)
    const unlisten = await listen<string>("agent-install-output", () => {})
    try {
      await invoke("run_openacp_agent_install", { agentKey: key })
      invalidateAgentsCache()
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
      await invoke<string>("invoke_cli", {
        args: ["setup", "--agent", selectedAgent, "--dir", props.path, "--json"],
      }).catch((e) => console.warn("[agent-setup-step] setup:", e))

      await invoke<string>("invoke_cli", { args: ["start", "--dir", props.path] })
      props.onComplete({
        id: props.instanceId,
        name: props.instanceName,
        directory: props.path,
        type: "local",
      })
    } catch (e: any) {
      console.error("[agent-setup-step] start failed:", e)
      const msg = typeof e === "string" ? e : e?.message ?? "Failed to start"
      setError(msg)
      setStarting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          ref={backRef}
          type="button"
          aria-label="Back to workspaces list"
          onClick={props.onBack}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <CaretLeft size={14} />
        </button>
        <span className="text-sm font-medium text-foreground truncate">{folderName}</span>
      </div>
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
          <Button variant="ghost" onClick={props.onBack} disabled={starting}>
            Back
          </Button>
          <Button onClick={handleStart} disabled={!selectedAgent || starting}>
            {starting ? "Starting..." : "Start workspace"}
          </Button>
        </div>
      </div>
    </div>
  )
}
