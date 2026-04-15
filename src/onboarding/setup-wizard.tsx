import React, { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "motion/react";
import {
  FolderOpen,
  Check,
  CircleNotch,
  MagnifyingGlass,
  ArrowLeft,
} from "@phosphor-icons/react";
import { StepChecklist, type Step, type StepStatus } from "./step-checklist";
import { CollapsibleLog } from "./collapsible-log";
import { WindowDragBar } from "./window-drag-bar";
import { Button } from "src/openacp/components/ui/button";
import { Input } from "src/openacp/components/ui/input";
import { Badge } from "src/openacp/components/ui/badge";
import { AGENT_ICONS } from "./agent-icons";

interface AgentEntry {
  key: string;
  name: string;
  version: string;
  installed: boolean;
  available: boolean;
  description: string;
}
interface WorkspaceEntry {
  id: string;
  name: string;
  directory: string;
  type: "local" | "remote";
}
interface Props {
  onSuccess: (entry: WorkspaceEntry) => void;
}

function AgentAvatar({ agentKey, name, dimmed }: { agentKey: string; name: string; dimmed?: boolean }) {
  const svg = AGENT_ICONS[agentKey];
  const baseClass = `flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-weak bg-bg-weak text-fg-base transition-opacity ${dimmed ? "opacity-50" : ""}`;

  if (svg) {
    return (
      <div className={baseClass} aria-hidden="true">
        <span
          className="block size-4 [&_svg]:h-full [&_svg]:w-full [&_svg]:fill-current [&_svg_path]:fill-current"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className={`${baseClass} text-sm font-medium`} aria-hidden="true">
      {initial}
    </div>
  );
}

export function SetupWizard(props: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [workspace, setWorkspace] = useState("~/openacp-workspace");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [installingAgent, setInstallingAgent] = useState("");
  const [agentInstallError, setAgentInstallError] = useState("");
  const [setupLog, setSetupLog] = useState<string[]>([]);
  const [setupStatus, setSetupStatus] = useState<
    "idle" | "running" | "starting" | "success" | "error"
  >("idle");
  const [setupError, setSetupError] = useState("");
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [agentInstallLog, setAgentInstallLog] = useState<string[]>([]);

  useEffect(() => {
    invoke<string>("run_openacp_agents_list")
      .then((result) => {
        const raw = typeof result === "string" ? JSON.parse(result) : result;
        let list: AgentEntry[];
        if (Array.isArray(raw)) list = raw;
        else if (raw?.data?.agents) {
          if (!raw.success) throw new Error(raw.error?.message ?? "Failed");
          list = raw.data.agents;
        } else list = [];
        const claude = list.find((a) => a.key === "claude" && a.installed);
        if (claude) setSelectedAgent("claude");
        setAgents(list);
        setAgentsLoading(false);
      })
      .catch(() => {
        setAgentsError(true);
        setAgentsLoading(false);
      });
  }, []);

  const filteredAgents = useMemo(() => {
    const q = agentSearch.toLowerCase().trim();
    const filtered = q
      ? agents.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.description.toLowerCase().includes(q),
        )
      : agents;
    return [...filtered].sort(
      (a, b) => Number(b.installed) - Number(a.installed),
    );
  }, [agents, agentSearch]);

  const installAgent = useCallback(async (key: string) => {
    setInstallingAgent(key);
    setAgentInstallError("");
    setAgentInstallLog([]);
    const unlisten = await listen<string>("agent-install-output", (event) =>
      setAgentInstallLog((prev) => [...prev, event.payload]),
    );
    try {
      await invoke("run_openacp_agent_install", { agentKey: key });
      setSelectedAgent(key);
      setAgents((prev) =>
        prev.map((a) => (a.key === key ? { ...a, installed: true } : a)),
      );
    } catch (err) {
      setAgentInstallError(`Failed to install ${key}: ${String(err)}`);
    } finally {
      setInstallingAgent("");
      unlisten();
    }
  }, []);

  const runSetup = useCallback(async () => {
    setSetupStatus("running");
    setSetupLog([]);
    const unlisten = await listen<string>("setup-output", (event) =>
      setSetupLog((prev) => [...prev, event.payload]),
    );
    try {
      const jsonStr = await invoke<string>("run_openacp_setup", {
        workspace,
        agent: selectedAgent,
      });
      setSetupStatus("starting");

      const dirBasename = (p: string) =>
        p.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? p;

      let instanceData: { id: string; name: string; directory: string } | null =
        null;
      try {
        const parsed = JSON.parse(jsonStr);
        const data = parsed?.data ?? parsed;
        if (data?.id) {
          const dir = data.directory ?? workspace;
          instanceData = {
            id: data.id,
            name: data.name ?? dirBasename(dir) ?? data.id,
            directory: dir,
          };
        }
      } catch {
        /* ignored */
      }

      if (!instanceData?.id) {
        try {
          const createStr = await invoke<string>("invoke_cli", {
            args: [
              "instances",
              "create",
              "--dir",
              workspace,
              "--no-interactive",
              "--json",
            ],
          });
          const createParsed = JSON.parse(createStr);
          const data = createParsed?.data ?? createParsed;
          if (data?.id) {
            const dir = data.directory ?? workspace;
            instanceData = {
              id: data.id,
              name: data.name ?? dirBasename(dir) ?? data.id,
              directory: dir,
            };
          }
        } catch {
          /* ignored */
        }
      }

      if (!instanceData?.id) {
        throw new Error(
          "Setup failed: could not determine instance ID. Try running setup again.",
        );
      }

      try {
        await invoke<string>("invoke_cli", {
          args: ["start", "--dir", workspace],
        });
      } catch (startErr) {
        if (!String(startErr).toLowerCase().includes("already running"))
          throw startErr;
      }

      const entry: WorkspaceEntry = {
        id: instanceData.id,
        name: instanceData.name,
        directory: instanceData.directory,
        type: "local",
      };
      setSetupStatus("success");
      setTimeout(() => props.onSuccess(entry), 800);
    } catch (err) {
      setSetupStatus("error");
      setSetupError(String(err));
    } finally {
      unlisten();
    }
  }, [workspace, selectedAgent, props]);

  const canProceedStep1 = workspace.trim() !== "" && selectedAgent !== "";

  const setupSteps: Step[] = useMemo(() => {
    if (setupStatus === "idle") return [];
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
    ];
    if (setupStatus === "success") {
      steps.push({ label: "Ready", status: "done" });
    }
    return steps;
  }, [setupStatus, setupLog.length]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-bg-base p-8">
      <WindowDragBar />
      <div className="w-full max-w-120">
        {/* Step header — back button + counter badge */}
        <div className="mb-10 flex items-center gap-3">
          {step === 2 && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setStep(1)}
              disabled={setupStatus === "running" || setupStatus === "starting"}
              className="rounded-full"
              aria-label="Back"
            >
              <ArrowLeft />
            </Button>
          )}
          <Badge variant="outline" className="h-8 gap-2.5 px-3.5 text-sm">
            <span className="font-medium text-fg-weaker tabular-nums">
              {step}/2
            </span>
            <span className="h-3 w-px bg-border-weak" aria-hidden="true" />
            <span className="font-medium text-fg-base">
              {step === 1 ? "Set up your workspace" : "Confirm your setup"}
            </span>
          </Badge>
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
              <p className="text-sm text-fg-weaker">
                Choose a directory and AI agent to get started.
              </p>

              {/* Directory picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-fg-base">
                  Workspace directory
                </label>
                <div className="relative flex items-center">
                  <FolderOpen
                    size={16}
                    className="pointer-events-none absolute left-3 shrink-0 text-fg-weaker"
                  />
                  <Input
                    value={workspace}
                    onChange={(e) => setWorkspace(e.target.value)}
                    placeholder="/Users/you/projects"
                    className="pl-9 pr-20"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={async () => {
                      const s = await openDialog({
                        directory: true,
                        multiple: false,
                      });
                      if (s && typeof s === "string") setWorkspace(s);
                    }}
                    className="absolute right-1.5"
                  >
                    Browse
                  </Button>
                </div>
              </div>

              {/* Agent selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-fg-base">
                  AI Agent
                </label>
                {agentInstallError && (
                  <p className="text-xs text-critical">
                    {agentInstallError}
                  </p>
                )}
                {agentsLoading && (
                  <div className="flex items-center gap-2 py-6 text-sm text-fg-weaker">
                    <CircleNotch size={14} className="animate-spin" />
                    Loading agents...
                  </div>
                )}
                {agentsError && (
                  <p className="text-sm text-critical">
                    Failed to load agents
                  </p>
                )}
                {!agentsLoading && !agentsError && (
                  <>
                    {agents.length > 4 && (
                      <div className="relative flex items-center">
                        <MagnifyingGlass
                          size={14}
                          className="pointer-events-none absolute left-3 text-fg-weaker"
                        />
                        <Input
                          value={agentSearch}
                          onChange={(e) => setAgentSearch(e.target.value)}
                          placeholder="Search agents..."
                          className="pl-9"
                        />
                      </div>
                    )}
                    <div className="flex max-h-56 flex-col overflow-y-auto rounded-lg border border-border-base divide-y divide-border-weak">
                      {filteredAgents.map((agent) => {
                        const isSelected = selectedAgent === agent.key;
                        const canSelect = agent.installed;
                        return (
                          <div
                            key={agent.key}
                            className={`flex items-center gap-3 px-3 py-3 transition-colors ${
                              canSelect ? "cursor-pointer" : "cursor-default"
                            } ${isSelected ? "hover:bg-bg-weak" : canSelect ? "hover:bg-bg-weak" : ""}`}
                            onClick={() => {
                              if (canSelect) {
                                setSelectedAgent(isSelected ? "" : agent.key);
                              }
                            }}
                          >
                            {/* Radio indicator — invisible for uninstalled agents (keeps spacing) */}
                            <div
                              aria-hidden={!canSelect}
                              className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
                                !canSelect
                                  ? "opacity-0"
                                  : isSelected
                                    ? "border-fg-base bg-fg-base"
                                    : "border-fg-weaker/40"
                              }`}
                            >
                              {isSelected && canSelect && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{
                                    type: "spring",
                                    stiffness: 400,
                                    damping: 15,
                                  }}
                                >
                                  <Check
                                    size={10}
                                    weight="bold"
                                    className="text-bg-base"
                                  />
                                </motion.div>
                              )}
                            </div>

                            <AgentAvatar agentKey={agent.key} name={agent.name} dimmed={!canSelect} />

                            {/* Info */}
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-sm font-medium ${canSelect ? "text-fg-base" : "text-fg-weaker"}`}
                              >
                                {agent.name}
                              </p>
                              <p className="text-xs text-fg-weaker">
                                {agent.description}
                              </p>
                            </div>

                            {/* Status / Action */}
                            {agent.installed ? (
                              <span className="shrink-0 text-xs text-fg-weaker">
                                Installed
                              </span>
                            ) : agent.available ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  installAgent(agent.key);
                                }}
                                disabled={installingAgent === agent.key}
                                className="shrink-0"
                              >
                                {installingAgent === agent.key ? (
                                  <CircleNotch className="animate-spin" />
                                ) : (
                                  "Install"
                                )}
                              </Button>
                            ) : null}
                          </div>
                        );
                      })}
                      {filteredAgents.length === 0 && (
                        <p className="py-4 text-center text-sm text-fg-weaker">
                          No agents found
                        </p>
                      )}
                    </div>
                    {/* Agent install log */}
                    {installingAgent !== "" && agentInstallLog.length > 0 && (
                      <CollapsibleLog
                        lines={agentInstallLog}
                        isRunning={installingAgent !== ""}
                      />
                    )}
                  </>
                )}
              </div>

              <Button
                type="button"
                size="lg"
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="w-full"
              >
                Continue
              </Button>
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
              <p className="text-sm text-fg-weaker">
                Review your configuration before completing.
              </p>

              {/* Summary card */}
              <div className="rounded-lg border border-border-base divide-y divide-border">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="text-sm text-fg-weaker shrink-0">
                    Directory
                  </span>
                  <span
                    className="text-sm font-medium text-fg-base truncate min-w-0 flex-1 text-right"
                    dir="rtl"
                    title={workspace}
                  >
                    {"\u200E" + workspace}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-fg-weaker">Agent</span>
                  <span className="text-sm font-medium text-fg-base">
                    {agents.find((a) => a.key === selectedAgent)?.name ?? selectedAgent}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-fg-weaker">Mode</span>
                  <span className="text-sm font-medium text-fg-base">
                    Daemon
                  </span>
                </div>
              </div>

              {/* Setup progress */}
              {setupSteps.length > 0 && (
                <div className="flex flex-col gap-3">
                  <StepChecklist steps={setupSteps} />
                  {setupLog.length > 0 && (
                    <CollapsibleLog
                      lines={setupLog}
                      isRunning={
                        setupStatus === "running" || setupStatus === "starting"
                      }
                    />
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
                  <p className="text-sm text-critical">{setupError}</p>
                </motion.div>
              )}

              {/* Actions */}
              <Button
                type="button"
                size="lg"
                onClick={runSetup}
                disabled={
                  setupStatus === "running" ||
                  setupStatus === "starting" ||
                  setupStatus === "success"
                }
                className="w-full"
              >
                {setupStatus === "running"
                  ? "Setting up..."
                  : setupStatus === "starting"
                    ? "Starting..."
                    : setupStatus === "success"
                      ? "Done"
                      : "Complete Setup"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
