import React, { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "../ui/button";

interface AgentEntry {
  key: string;
  name: string;
  description: string;
  installed: boolean;
  available: boolean;
}

// Strip ANSI escape codes from CLI output
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export function SettingsAgents({ workspacePath }: { workspacePath?: string }) {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [installingKey, setInstallingKey] = useState("");
  const [installLog, setInstallLog] = useState("");

  const fetchAgents = useCallback(() => {
    setLoading(true);
    invoke<string>("run_openacp_agents_list", {
      workspaceDir: workspacePath || null,
    })
      .then((result) => {
        const raw = typeof result === "string" ? JSON.parse(result) : result;
        let list: AgentEntry[];
        if (Array.isArray(raw)) list = raw;
        else if (raw?.data?.agents) list = raw.data.agents;
        else list = [];
        setAgents(list);
      })
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q
      ? agents.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.key.toLowerCase().includes(q) ||
            a.description.toLowerCase().includes(q),
        )
      : agents;
    return [...list].sort((a, b) => Number(b.installed) - Number(a.installed));
  }, [agents, search]);

  async function handleInstall(key: string) {
    if (installingKey) return;
    setInstallingKey(key);
    setInstallLog("");

    const unlisten = await listen<string>("agent-install-output", (event) => {
      setInstallLog((prev) => prev + stripAnsi(event.payload) + "\n");
    });

    try {
      await invoke("run_openacp_agent_install", {
        agentKey: key,
        workspaceDir: workspacePath || null,
      });
      fetchAgents();
    } catch (e) {
      setInstallLog((prev) => prev + `\nError: ${e}\n`);
    } finally {
      setInstallingKey("");
      unlisten();
    }
  }

  const [uninstallingKey, setUninstallingKey] = useState("");

  async function handleUninstall(key: string) {
    if (uninstallingKey) return;
    setUninstallingKey(key);
    setInstallLog("");
    try {
      const args = workspacePath
        ? ["--dir", workspacePath, "agents", "uninstall", key]
        : ["agents", "uninstall", key];
      await invoke("invoke_cli", { args });
      fetchAgents();
    } catch (e) {
      setInstallLog(`Error: ${e}\n`);
    } finally {
      setUninstallingKey("");
    }
  }

  const installed = filtered.filter((a) => a.installed);
  const available = filtered.filter((a) => !a.installed && a.available);

  return (
    <div className="flex flex-col gap-6">
      <input
        type="text"
        placeholder="Search agents..."
        className="h-8 rounded-md border border-border bg-background px-3 text-sm font-normal text-foreground-weak placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border-selected"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="text-sm font-normal text-muted-foreground py-4">
          Loading agents...
        </div>
      ) : (
        <>
          {/* Installed */}
          {installed.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase text-foreground">
                Installed
              </span>
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
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase text-foreground">
                Available
              </span>
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
            <div className="text-sm font-normal text-muted-foreground py-2">
              No agents found
            </div>
          )}
        </>
      )}

      {installLog && (
        <pre className="p-3 rounded-md bg-muted border border-border-weak/50 text-2xs font-normal text-muted-foreground font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">
          {installLog}
        </pre>
      )}
    </div>
  );
}

function AgentRow(props: {
  agent: AgentEntry;
  installing?: boolean;
  uninstalling?: boolean;
  onInstall?: () => void;
  onUninstall?: () => void;
}) {
  const { agent, installing, uninstalling, onInstall, onUninstall } = props;
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md border border-border-weak/50">
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium text-foreground capitalize">
          {agent.name}
        </div>
        {agent.description && (
          <div className="text-sm font-normal text-muted-foreground truncate">
            {agent.description}
          </div>
        )}
      </div>
      {agent.installed ? (
        onUninstall ? (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            disabled={uninstalling}
            onClick={onUninstall}
          >
            {uninstalling ? "Removing..." : "Uninstall"}
          </Button>
        ) : (
          <span className="text-2xs font-normal text-foreground-weaker shrink-0 px-2 py-0.5 rounded bg-secondary">
            installed
          </span>
        )
      ) : onInstall ? (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={installing}
          onClick={onInstall}
        >
          {installing ? "Installing..." : "Install"}
        </Button>
      ) : null}
    </div>
  );
}
