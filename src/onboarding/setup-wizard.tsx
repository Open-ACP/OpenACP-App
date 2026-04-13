import React, { useState, useEffect, useMemo, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { motion, AnimatePresence } from "motion/react"
import { FolderOpen, Check, CircleNotch, MagnifyingGlass, CaretRight } from "@phosphor-icons/react"
import { StepChecklist, type Step, type StepStatus } from "./step-checklist"
import { CollapsibleLog } from "./collapsible-log"
import { WindowDragBar } from "./window-drag-bar"

interface AgentEntry {
  key: string
  name: string
  version: string
  installed: boolean
  available: boolean
  description: string
}
interface WorkspaceEntry {
  id: string
  name: string
  directory: string
  type: "local" | "remote"
}
interface Props {
  onSuccess: (entry: WorkspaceEntry) => void
}

export function SetupWizard(props: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [workspace, setWorkspace] = useState("~/openacp-workspace")
  const [selectedAgent, setSelectedAgent] = useState("")
  const [installingAgent, setInstallingAgent] = useState("")
  const [agentInstallError, setAgentInstallError] = useState("")
  const [setupLog, setSetupLog] = useState<string[]>([])
  const [setupStatus, setSetupStatus] = useState<"idle" | "running" | "starting" | "success" | "error">("idle")
  const [setupError, setSetupError] = useState("")
  const [agents, setAgents] = useState<AgentEntry[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [agentsError, setAgentsError] = useState(false)
  const [agentSearch, setAgentSearch] = useState("")
  const [agentInstallLog, setAgentInstallLog] = useState<string[]>([])

  useEffect(() => {
    invoke<string>("run_openacp_agents_list")
      .then((result) => {
        const raw = typeof result === "string" ? JSON.parse(result) : result
        let list: AgentEntry[]
        if (Array.isArray(raw)) list = raw
        else if (raw?.data?.agents) {
          if (!raw.success) throw new Error(raw.error?.message ?? "Failed")
          list = raw.data.agents
        } else list = []
        const claude = list.find((a) => a.key === "claude" && a.installed)
        if (claude) setSelectedAgent("claude")
        setAgents(list)
        setAgentsLoading(false)
      })
      .catch(() => {
        setAgentsError(true)
        setAgentsLoading(false)
      })
  }, [])

  const filteredAgents = useMemo(() => {
    const q = agentSearch.toLowerCase().trim()
    const filtered = q
      ? agents.filter((a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
      : agents
    return [...filtered].sort((a, b) => Number(b.installed) - Number(a.installed))
  }, [agents, agentSearch])

  const installAgent = useCallback(
    async (key: string) => {
      setInstallingAgent(key)
      setAgentInstallError("")
      setAgentInstallLog([])
      const unlisten = await listen<string>("agent-install-output", (event) =>
        setAgentInstallLog((prev) => [...prev, event.payload]),
      )
      try {
        await invoke("run_openacp_agent_install", { agentKey: key })
        setSelectedAgent(key)
        setAgents((prev) => prev.map((a) => (a.key === key ? { ...a, installed: true } : a)))
      } catch (err) {
        setAgentInstallError(`Failed to install ${key}: ${String(err)}`)
      } finally {
        setInstallingAgent("")
        unlisten()
      }
    },
    [],
  )

  const runSetup = useCallback(async () => {
    setSetupStatus("running")
    setSetupLog([])
    const unlisten = await listen<string>("setup-output", (event) =>
      setSetupLog((prev) => [...prev, event.payload]),
    )
    try {
      const jsonStr = await invoke<string>("run_openacp_setup", { workspace, agent: selectedAgent })
      setSetupStatus("starting")

      const dirBasename = (p: string) => p.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? p

      let instanceData: { id: string; name: string; directory: string } | null = null
      try {
        const parsed = JSON.parse(jsonStr)
        const data = parsed?.data ?? parsed
        if (data?.id) {
          const dir = data.directory ?? workspace
          instanceData = { id: data.id, name: data.name ?? dirBasename(dir) ?? data.id, directory: dir }
        }
      } catch {
        /* ignored */
      }

      if (!instanceData?.id) {
        try {
          const createStr = await invoke<string>("invoke_cli", {
            args: ["instances", "create", "--dir", workspace, "--no-interactive", "--json"],
          })
          const createParsed = JSON.parse(createStr)
          const data = createParsed?.data ?? createParsed
          if (data?.id) {
            const dir = data.directory ?? workspace
            instanceData = { id: data.id, name: data.name ?? dirBasename(dir) ?? data.id, directory: dir }
          }
        } catch {
          /* ignored */
        }
      }

      if (!instanceData?.id) {
        throw new Error("Setup failed: could not determine instance ID. Try running setup again.")
      }

      try {
        await invoke<string>("invoke_cli", { args: ["start", "--dir", workspace] })
      } catch (startErr) {
        if (!String(startErr).toLowerCase().includes("already running")) throw startErr
      }

      const entry: WorkspaceEntry = {
        id: instanceData.id,
        name: instanceData.name,
        directory: instanceData.directory,
        type: "local",
      }
      setSetupStatus("success")
      setTimeout(() => props.onSuccess(entry), 800)
    } catch (err) {
      setSetupStatus("error")
      setSetupError(String(err))
    } finally {
      unlisten()
    }
  }, [workspace, selectedAgent, props])

  const canProceedStep1 = workspace.trim() !== "" && selectedAgent !== ""

  const setupSteps: Step[] = useMemo(() => {
    if (setupStatus === "idle") return []
    const steps: Step[] = [
      {
        label: "Creating workspace",
        status:
          setupStatus === "running"
            ? "running"
            : setupStatus === "error" && setupLog.length < 3
              ? "error"
              : "done",
      },
      {
        label: "Starting server",
        status:
          setupStatus === "starting"
            ? "running"
            : setupStatus === "success"
              ? "done"
              : setupStatus === "error" && setupLog.length >= 3
                ? "error"
                : setupStatus === "running"
                  ? "pending"
                  : "done",
      },
    ]
    if (setupStatus === "success") {
      steps.push({ label: "Ready", status: "done" })
    }
    return steps
  }, [setupStatus, setupLog.length])

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-background-base p-8">
      <WindowDragBar />
      <div className="w-full max-w-[480px]">
        {/* Step indicator — minimal dots */}
        <div className="mb-10 flex items-center justify-center gap-2">
          <StepPill active={step === 1} done={step > 1} label="Workspace" />
          <div className="text-muted-foreground/30">
            <CaretRight size={14} />
          </div>
          <StepPill active={step === 2} done={false} label="Confirm" />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              className="flex flex-col gap-6"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              <div>
                <h1 className="text-lg font-medium text-foreground">Set up your workspace</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a directory and AI agent to get started.
                </p>
              </div>

              {/* Directory picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Workspace directory</label>
                <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 transition-colors focus-within:border-foreground/30">
                  <FolderOpen size={16} className="shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    value={workspace}
                    onChange={(e) => setWorkspace(e.target.value)}
                    placeholder="/Users/you/projects"
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const s = await openDialog({ directory: true, multiple: false })
                      if (s && typeof s === "string") setWorkspace(s)
                    }}
                    className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Browse
                  </button>
                </div>
              </div>

              {/* Agent selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">AI Agent</label>
                {agentInstallError && (
                  <p className="text-xs text-destructive">{agentInstallError}</p>
                )}
                {agentsLoading && (
                  <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <CircleNotch size={14} className="animate-spin" />
                    Loading agents...
                  </div>
                )}
                {agentsError && <p className="text-sm text-destructive">Failed to load agents</p>}
                {!agentsLoading && !agentsError && (
                  <>
                    {agents.length > 4 && (
                      <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3">
                        <MagnifyingGlass size={14} className="text-muted-foreground" />
                        <input
                          type="text"
                          value={agentSearch}
                          onChange={(e) => setAgentSearch(e.target.value)}
                          placeholder="Search agents..."
                          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                        />
                      </div>
                    )}
                    <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                      {filteredAgents.map((agent) => {
                        const isSelected = selectedAgent === agent.key
                        const canSelect = agent.installed
                        return (
                          <div
                            key={agent.key}
                            className={`flex items-center gap-3 px-3 py-3 transition-colors ${
                              canSelect ? "cursor-pointer" : "cursor-default"
                            } ${isSelected ? "bg-muted/40" : canSelect ? "hover:bg-muted/20" : ""}`}
                            onClick={() => {
                              if (canSelect) {
                                setSelectedAgent(isSelected ? "" : agent.key)
                              }
                            }}
                          >
                            {/* Radio indicator */}
                            <div
                              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
                                isSelected
                                  ? "border-foreground bg-foreground"
                                  : canSelect
                                    ? "border-muted-foreground/40"
                                    : "border-muted-foreground/20"
                              }`}
                            >
                              {isSelected && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                                >
                                  <Check size={10} weight="bold" className="text-background" />
                                </motion.div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium ${canSelect ? "text-foreground" : "text-muted-foreground"}`}>
                                {agent.name}
                              </p>
                              <p className="text-xs text-muted-foreground/70">{agent.description}</p>
                            </div>

                            {/* Status / Action */}
                            {agent.installed ? (
                              <span className="shrink-0 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                                Installed
                              </span>
                            ) : agent.available ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  installAgent(agent.key)
                                }}
                                disabled={installingAgent === agent.key}
                                className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                              >
                                {installingAgent === agent.key ? (
                                  <CircleNotch size={12} className="animate-spin" />
                                ) : (
                                  "Install"
                                )}
                              </button>
                            ) : null}
                          </div>
                        )
                      })}
                      {filteredAgents.length === 0 && (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          No agents found
                        </p>
                      )}
                    </div>
                    {/* Agent install log */}
                    {installingAgent !== "" && agentInstallLog.length > 0 && (
                      <CollapsibleLog lines={agentInstallLog} isRunning={installingAgent !== ""} />
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="h-10 w-full rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                Continue
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              className="flex flex-col gap-6"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
            >
              <div>
                <h1 className="text-lg font-medium text-foreground">Confirm setup</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review your configuration before completing.
                </p>
              </div>

              {/* Summary card */}
              <div className="rounded-lg border border-border divide-y divide-border">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Directory</span>
                  <span className="text-sm font-medium text-foreground">{workspace}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Agent</span>
                  <span className="text-sm font-medium text-foreground">{selectedAgent}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Mode</span>
                  <span className="text-sm font-medium text-foreground">Daemon</span>
                </div>
              </div>

              {/* Setup progress */}
              {setupSteps.length > 0 && (
                <div className="flex flex-col gap-3">
                  <StepChecklist steps={setupSteps} />
                  {setupLog.length > 0 && (
                    <CollapsibleLog lines={setupLog} isRunning={setupStatus === "running" || setupStatus === "starting"} />
                  )}
                </div>
              )}

              {/* Error */}
              {setupStatus === "error" && (
                <motion.div
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <p className="text-sm text-destructive">{setupError}</p>
                </motion.div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={setupStatus === "running" || setupStatus === "starting"}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={runSetup}
                  disabled={setupStatus === "running" || setupStatus === "starting" || setupStatus === "success"}
                  className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  {setupStatus === "running"
                    ? "Setting up..."
                    : setupStatus === "starting"
                      ? "Starting..."
                      : setupStatus === "success"
                        ? "Done"
                        : "Complete Setup"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function StepPill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        done
          ? "bg-emerald-400/10 text-emerald-400"
          : active
            ? "bg-foreground/10 text-foreground"
            : "text-muted-foreground/40"
      }`}
    >
      {done ? (
        <span className="flex items-center gap-1">
          <Check size={12} weight="bold" /> {label}
        </span>
      ) : (
        label
      )}
    </div>
  )
}
