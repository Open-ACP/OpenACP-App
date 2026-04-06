import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

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
    <div className="flex h-screen w-screen flex-col items-center justify-start bg-background-base p-8 pt-12">
      <div className="w-full max-w-[520px]">
        <div className="mb-8 flex items-center justify-center">
          <StepDot active={step === 1} done={step > 1} label="1" />
          <div className={`mx-0 h-0.5 w-[120px] ${step > 1 ? 'bg-text-strong' : 'bg-border-base'}`} />
          <StepDot active={step === 2} done={false} label="2" />
        </div>
        {step === 1 && (
          <div className="flex flex-col gap-8">
            <h1 className="text-xl-medium text-text-strong">Set up your workspace</h1>
            <div className="flex flex-col gap-2">
              <label className="text-md-medium text-text-strong">Workspace directory</label>
              <div className="flex h-10 items-center gap-2 rounded-md border border-border-base px-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-weak)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
                <input type="text" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="/Users/you/projects" className="text-md-regular min-w-0 flex-1 bg-transparent text-text-strong outline-none placeholder:text-text-weak" />
                <button onClick={async () => { const s = await openDialog({ directory: true, multiple: false }); if (s && typeof s === 'string') setWorkspace(s); }} className="text-md-medium shrink-0 text-text-interactive-base hover:underline">Browse</button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-md-medium text-text-strong">Select an AI agent</label>
              {agentInstallError && <p className="text-sm-regular text-surface-critical-strong">{agentInstallError}</p>}
              {agentsLoading && <p className="text-md-regular py-4 text-text-weak">Loading agents...</p>}
              {agentsError && <><p className="text-md-regular mb-2 text-surface-critical-strong">Failed to load agents</p></>}
              {!agentsLoading && !agentsError && (
                <>
                  {agents.length > 4 && <input type="text" value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} placeholder="Search agents..." className="text-md-regular mb-1 h-10 w-full rounded-md border border-border-base bg-transparent px-3 text-text-strong outline-none placeholder:text-text-weak" />}
                  <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                    {filteredAgents.map((agent) => (
                      <div key={agent.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${selectedAgent === agent.key ? 'border-text-strong border-2 bg-surface-raised-base' : 'border-border-base hover:bg-surface-raised-base-hover'}`} onClick={() => agent.installed && setSelectedAgent(agent.key)}>
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${selectedAgent === agent.key ? 'bg-text-strong' : 'border-[1.5px] border-border-base'}`}>
                          {selectedAgent === agent.key && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--background-stronger)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                        </div>
                        <div className="min-w-0 flex-1"><p className="text-md-medium text-text-strong">{agent.name}</p><p className="text-sm-regular text-text-weak">{agent.description}</p></div>
                        {agent.installed && <span className="shrink-0 rounded-full bg-[#16a34a22] px-2 py-0.5 text-[11px] text-[#16a34a]">Installed</span>}
                        {!agent.installed && agent.available && <button onClick={(e) => { e.stopPropagation(); installAgent(agent.key); }} disabled={installingAgent === agent.key} className="text-sm-medium shrink-0 rounded-md border border-border-base px-3 py-1 text-text-strong transition-colors hover:bg-surface-raised-base-hover disabled:opacity-50">{installingAgent === agent.key ? 'Installing...' : 'Install'}</button>}
                      </div>
                    ))}
                    {filteredAgents.length === 0 && <p className="text-md-regular py-4 text-center text-text-weak">No agents match "{agentSearch}"</p>}
                  </div>
                  {installingAgent !== '' && agentInstallLog.length > 0 && <div className="mt-2 h-20 overflow-y-auto rounded-lg bg-[#1a1a1a] p-3 text-12-mono text-[#a3a3a3]">{agentInstallLog.map((line, i) => <div key={i}>{line}</div>)}</div>}
                </>
              )}
            </div>
            <button onClick={() => setStep(2)} disabled={!canProceedStep1} className="text-md-medium h-11 w-full rounded-lg bg-text-strong text-background-stronger transition-opacity hover:opacity-90 disabled:opacity-40">Continue</button>
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2"><h1 className="text-xl-medium text-text-strong">Confirm your setup</h1><p className="text-md-regular text-text-weak">Review your configuration before completing setup.</p></div>
            <div className="flex flex-col rounded-lg border border-border-base bg-surface-raised-base">
              <div className="flex items-center justify-between px-5 py-4"><span className="text-md-regular text-text-weak">Workspace</span><span className="text-md-medium text-text-strong">{workspace}</span></div>
              <div className="mx-5 h-px bg-border-base" /><div className="flex items-center justify-between px-5 py-4"><span className="text-md-regular text-text-weak">Agent</span><span className="text-md-medium text-text-strong">{selectedAgent}</span></div>
              <div className="mx-5 h-px bg-border-base" /><div className="flex items-center justify-between px-5 py-4"><span className="text-md-regular text-text-weak">Run mode</span><span className="text-md-medium text-text-strong">Daemon (background)</span></div>
            </div>
            {setupLog.length > 0 && <div className="h-32 overflow-y-auto rounded-lg bg-[#1a1a1a] p-3 text-12-mono text-[#a3a3a3]">{setupLog.map((line, i) => <div key={i}>{line}</div>)}</div>}
            {setupStatus === 'error' && <div className="rounded-lg border border-surface-critical-strong p-4"><p className="text-md-regular text-surface-critical-strong">{setupError}</p></div>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setStep(1)} disabled={setupStatus === 'running' || setupStatus === 'starting'} className="text-md-medium rounded-md border border-border-base bg-background-stronger px-4 py-2.5 text-text-strong shadow-xs transition-colors hover:bg-surface-raised-base-hover disabled:opacity-40">Back</button>
              <button onClick={runSetup} disabled={setupStatus === 'running' || setupStatus === 'starting' || setupStatus === 'success'} className="text-md-medium flex items-center gap-2 rounded-md bg-text-strong px-6 py-2.5 text-background-stronger transition-opacity hover:opacity-90 disabled:opacity-40">
                {setupStatus === 'running' ? 'Setting up...' : setupStatus === 'starting' ? 'Starting server...' : setupStatus === 'success' ? 'Done' : 'Complete Setup'}
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
    <div className={`text-md-medium flex h-8 w-8 items-center justify-center rounded-full ${props.done ? 'bg-surface-success-strong text-white' : props.active ? 'bg-text-strong text-background-stronger' : 'bg-surface-raised-base border border-border-base text-text-weak'}`}>
      {props.done ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg> : props.label}
    </div>
  );
}
