import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

interface AgentEntry { key: string; name: string; version: string; installed: boolean; available: boolean; description: string; }
interface WorkspaceEntry { id: string; name: string; directory: string; type: 'local' | 'remote' }
interface Props { onSuccess: (entry: WorkspaceEntry) => void; }

export function SetupWizard(props: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [workspace, setWorkspace] = useState('~/openacp-workspace');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [installingAgent, setInstallingAgent] = useState('');
  const [agentInstallError, setAgentInstallError] = useState('');
  const [setupLog, setSetupLog] = useState<string[]>([]);
  const [setupStatus, setSetupStatus] = useState<'idle' | 'running' | 'starting' | 'success' | 'error'>('idle');
  const [setupError, setSetupError] = useState('');
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');
  const [agentInstallLog, setAgentInstallLog] = useState<string[]>([]);

  useEffect(() => {
    invoke<string>('run_openacp_agents_list').then((result) => {
      const raw = typeof result === 'string' ? JSON.parse(result) : result;
      let list: AgentEntry[];
      if (Array.isArray(raw)) list = raw;
      else if (raw?.data?.agents) { if (!raw.success) throw new Error(raw.error?.message ?? 'Failed'); list = raw.data.agents; }
      else list = [];
      const claude = list.find((a) => a.key === 'claude' && a.installed);
      if (claude) setSelectedAgent('claude');
      setAgents(list); setAgentsLoading(false);
    }).catch(() => { setAgentsError(true); setAgentsLoading(false); });
  }, []);

  const filteredAgents = useMemo(() => {
    const q = agentSearch.toLowerCase().trim();
    const filtered = q ? agents.filter((a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)) : agents;
    return [...filtered].sort((a, b) => Number(b.installed) - Number(a.installed));
  }, [agents, agentSearch]);

  const installAgent = async (key: string) => {
    setInstallingAgent(key); setAgentInstallError(''); setAgentInstallLog([]);
    const unlisten = await listen<string>('agent-install-output', (event) => setAgentInstallLog((prev) => [...prev, event.payload]));
    try {
      await invoke('run_openacp_agent_install', { agentKey: key });
      setSelectedAgent(key);
      setAgents((prev) => prev.map((a) => a.key === key ? { ...a, installed: true } : a));
    } catch (err) { setAgentInstallError(`Failed to install ${key}: ${String(err)}`); } finally { setInstallingAgent(''); unlisten(); }
  };

  const runSetup = async () => {
    setSetupStatus('running'); setSetupLog([]);
    const unlisten = await listen<string>('setup-output', (event) => setSetupLog((prev) => [...prev, event.payload]));
    try {
      const jsonStr = await invoke<string>('run_openacp_setup', { workspace: workspace, agent: selectedAgent });
      setSetupStatus('starting');
      await invoke<string>('invoke_cli', { args: ['start', '--global', '--daemon'] });
      const parsed = JSON.parse(jsonStr) as { success: boolean; data?: { instanceId?: string; name?: string; directory?: string } };
      const data = parsed?.data ?? {};
      const entry: WorkspaceEntry = { id: data.instanceId ?? 'main', name: data.name ?? 'Main', directory: data.directory ?? workspace, type: 'local' };
      setSetupStatus('success'); setTimeout(() => props.onSuccess(entry), 800);
    } catch (err) { setSetupStatus('error'); setSetupError(String(err)); } finally { unlisten(); }
  };

  const canProceedStep1 = workspace.trim() !== '' && selectedAgent !== '';

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-background p-8">
      <div className="w-full max-w-[480px]">
        {/* Step indicator */}
        <div className="mb-8 flex items-center justify-center gap-0">
          <StepDot active={step === 1} done={step > 1} label="1" />
          <div className={`h-px w-20 ${step > 1 ? 'bg-foreground' : 'bg-border-weak'}`} />
          <StepDot active={step === 2} done={false} label="2" />
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-6">
            <h1 className="text-lg font-medium text-foreground">Set up your workspace</h1>

            {/* Workspace directory */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Default workspace directory</label>
              <div className="flex h-9 items-center gap-2 rounded-lg border border-border-weak bg-card px-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
                <input
                  type="text"
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  placeholder="/Users/you/projects"
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={async () => { const s = await openDialog({ directory: true, multiple: false }); if (s && typeof s === 'string') setWorkspace(s); }}
                  className="shrink-0 text-xs font-medium text-foreground-weak hover:text-foreground transition-colors"
                >
                  Browse
                </button>
              </div>
            </div>

            {/* Agent selection */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Default AI agent</label>
              {agentInstallError && <p className="text-xs text-destructive">{agentInstallError}</p>}
              {agentsLoading && <p className="text-sm text-muted-foreground py-4">Loading agents...</p>}
              {agentsError && <p className="text-sm text-destructive">Failed to load agents</p>}
              {!agentsLoading && !agentsError && (
                <>
                  {agents.length > 4 && (
                    <input
                      type="text"
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      placeholder="Search agents..."
                      className="h-9 w-full rounded-lg border border-border-weak bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  )}
                  <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                    {filteredAgents.map((agent) => {
                      const isSelected = selectedAgent === agent.key
                      return (
                        <button
                          key={agent.key}
                          type="button"
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                            isSelected
                              ? 'border-foreground bg-accent'
                              : 'border-border-weak hover:bg-accent'
                          }`}
                          onClick={() => agent.installed && setSelectedAgent(prev => prev === agent.key ? '' : agent.key)}
                        >
                          <div className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                            isSelected ? 'border-foreground bg-foreground' : 'border-muted-foreground'
                          }`}>
                            {isSelected && <div className="size-1.5 rounded-full bg-background" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm font-medium ${agent.installed ? 'text-foreground' : 'text-foreground-weak'}`}>{agent.name}</span>
                            <span className="text-xs text-muted-foreground block">{agent.description}</span>
                          </div>
                          {agent.installed ? (
                            <span className="text-2xs text-muted-foreground shrink-0">Installed</span>
                          ) : agent.available ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); installAgent(agent.key); }}
                              disabled={installingAgent === agent.key}
                              className="shrink-0 px-3 py-1 rounded-md bg-secondary text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                            >
                              {installingAgent === agent.key ? 'Installing...' : 'Install'}
                            </button>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                  {installingAgent !== '' && agentInstallLog.length > 0 && (
                    <div className="mt-1 h-16 overflow-y-auto rounded-lg border border-border-weak bg-[#0a0a0a] p-2 font-mono text-xs text-[#a3a3a3] leading-relaxed">
                      {agentInstallLog.map((line, i) => <div key={i}>{stripAnsi(line)}</div>)}
                    </div>
                  )}
                </>
              )}
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="h-9 w-full rounded-lg bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-lg font-medium text-foreground">Confirm your setup</h1>
              <p className="text-sm text-muted-foreground mt-1">Review your configuration before completing setup.</p>
            </div>

            <div className="rounded-lg border border-border-weak overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">Workspace</span>
                <span className="text-sm font-medium text-foreground font-mono">{workspace}</span>
              </div>
              <div className="border-t border-border-weak" />
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">Agent</span>
                <span className="text-sm font-medium text-foreground">{selectedAgent}</span>
              </div>
              <div className="border-t border-border-weak" />
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">Run mode</span>
                <span className="text-sm font-medium text-foreground">Daemon</span>
              </div>
            </div>

            {setupLog.length > 0 && (
              <div className="h-24 overflow-y-auto rounded-lg border border-border-weak bg-[#0a0a0a] p-3 font-mono text-xs text-[#a3a3a3] leading-relaxed">
                {setupLog.map((line, i) => <div key={i}>{stripAnsi(line)}</div>)}
              </div>
            )}

            {setupStatus === 'error' && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">{setupError}</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setStep(1)}
                disabled={setupStatus === 'running' || setupStatus === 'starting'}
                className="h-9 px-4 rounded-lg border border-border-weak text-sm font-medium text-foreground-weak hover:bg-accent transition-colors disabled:opacity-30"
              >
                Back
              </button>
              <button
                onClick={runSetup}
                disabled={setupStatus === 'running' || setupStatus === 'starting' || setupStatus === 'success'}
                className="h-9 px-6 rounded-lg bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                {setupStatus === 'running' ? 'Setting up...' : setupStatus === 'starting' ? 'Starting...' : setupStatus === 'success' ? 'Done' : 'Complete Setup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepDot(props: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`text-xs font-medium flex size-7 items-center justify-center rounded-full transition-colors ${
      props.done
        ? 'bg-foreground text-background'
        : props.active
          ? 'bg-foreground text-background'
          : 'border border-border-weak text-muted-foreground'
    }`}>
      {props.done ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      ) : props.label}
    </div>
  );
}
