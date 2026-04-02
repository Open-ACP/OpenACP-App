import { createSignal, createResource, createMemo, For, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

interface AgentEntry {
  key: string;
  name: string;
  version: string;
  installed: boolean;
  available: boolean;
  description: string;
}

interface WorkspaceEntry {
  id: string
  name: string
  directory: string
  type: 'local' | 'remote'
}

interface Props {
  onSuccess: (entry: WorkspaceEntry) => void;
}

export function SetupWizard(props: Props) {
  const [step, setStep] = createSignal<1 | 2>(1);
  const [workspace, setWorkspace] = createSignal('~/openacp-workspace');
  const [selectedAgent, setSelectedAgent] = createSignal('');
  const [installingAgent, setInstallingAgent] = createSignal('');
  const [agentInstallError, setAgentInstallError] = createSignal('');
  const [setupLog, setSetupLog] = createSignal<string[]>([]);
  const [setupStatus, setSetupStatus] = createSignal<'idle' | 'running' | 'starting' | 'success' | 'error'>('idle');
  const [setupError, setSetupError] = createSignal('');

  const [agents, { refetch }] = createResource<AgentEntry[]>(async () => {
    try {
      const result = await invoke<string>('run_openacp_agents_list');
      const envelope = JSON.parse(result) as {
        success: boolean;
        data: { agents: AgentEntry[] };
        error?: { code: string; message: string };
      };
      if (!envelope.success) throw new Error(envelope.error?.message ?? 'Failed to load agents');
      const parsed = envelope.data.agents;
      console.log('[agents] loaded:', parsed);
      const claude = parsed.find((a) => a.key === 'claude' && a.installed);
      if (claude) setSelectedAgent('claude');
      return parsed;
    } catch (err) {
      console.error('[agents] failed to load:', err);
      throw err;
    }
  });

  const browseWorkspace = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setWorkspace(selected);
    }
  };

  const [agentSearch, setAgentSearch] = createSignal('');

  const filteredAgents = createMemo(() => {
    const list = agents() ?? [];
    const q = agentSearch().toLowerCase().trim();
    const filtered = q
      ? list.filter((a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
      : list;
    return [...filtered].sort((a, b) => Number(b.installed) - Number(a.installed));
  });

  const [agentInstallLog, setAgentInstallLog] = createSignal<string[]>([]);

  const installAgent = async (key: string) => {
    setInstallingAgent(key);
    setAgentInstallError('');
    setAgentInstallLog([]);

    const unlisten = await listen<string>('agent-install-output', (event) => {
      setAgentInstallLog((prev) => [...prev, event.payload]);
    });

    try {
      await invoke('run_openacp_agent_install', { agentKey: key });
      setSelectedAgent(key);
      await refetch();
    } catch (err) {
      setAgentInstallError(`Failed to install ${key}: ${String(err)}`);
    } finally {
      setInstallingAgent('');
      unlisten();
    }
  };

  const runSetup = async () => {
    setSetupStatus('running');
    setSetupLog([]);

    // Manual unlisten — onCleanup does NOT work inside async event handlers
    const unlisten = await listen<string>('setup-output', (event) => {
      setSetupLog((prev) => [...prev, event.payload]);
    });

    try {
      const jsonStr = await invoke<string>('run_openacp_setup', { workspace: workspace(), agent: selectedAgent() });
      setSetupStatus('starting');
      await invoke('start_server');
      // Parse --json output from `openacp setup --json` to get instance identity
      const parsed = JSON.parse(jsonStr) as { success: boolean; data?: { instanceId?: string; name?: string; directory?: string } };
      const data = parsed?.data ?? {};
      const entry: WorkspaceEntry = {
        id: data.instanceId ?? 'main',
        name: data.name ?? 'Main',
        directory: data.directory ?? workspace(),
        type: 'local',
      };
      setSetupStatus('success');
      setTimeout(() => props.onSuccess(entry), 800);
    } catch (err) {
      setSetupStatus('error');
      setSetupError(String(err));
    } finally {
      unlisten();
    }
  };

  const canProceedStep1 = () => workspace().trim() !== '' && selectedAgent() !== '';

  return (
    <div class="flex h-screen w-screen flex-col items-center justify-center bg-neutral-950 p-8">
      <div class="w-full max-w-xl">
        {/* Step indicator */}
        <div class="mb-8 flex items-center gap-3">
          <StepDot active={step() === 1} done={step() > 1} label="1" />
          <div class="h-px flex-1 bg-neutral-700" />
          <StepDot active={step() === 2} done={false} label="2" />
        </div>

        {/* Step 1 */}
        <Show when={step() === 1}>
          <h1 class="mb-6 text-xl font-semibold text-white">Set up your workspace</h1>

          {/* Workspace picker */}
          <div class="mb-6">
            <label class="mb-1 block text-sm text-neutral-400">Workspace directory</label>
            <div class="flex gap-2">
              <input
                type="text"
                value={workspace()}
                onInput={(e) => setWorkspace(e.currentTarget.value)}
                placeholder="/Users/you/projects"
                class="flex-1 rounded-md bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={browseWorkspace}
                class="rounded-md bg-neutral-700 px-3 py-2 text-sm text-white hover:bg-neutral-600"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Agent list */}
          <div class="mb-8">
            <label class="mb-2 block text-sm text-neutral-400">Select an AI agent</label>
            <Show when={agentInstallError()}>
              <p class="mb-2 text-xs text-red-400">{agentInstallError()}</p>
            </Show>
            <Show when={agents.loading}>
              <p class="text-sm text-neutral-500">Loading agents...</p>
            </Show>
            <Show when={agents.error}>
              <p class="mb-2 text-sm text-red-400">Failed to load agents</p>
              <button onClick={refetch} class="text-sm text-blue-400 underline">Retry</button>
            </Show>
            <Show when={!agents.loading && !agents.error}>
              <input
                type="text"
                value={agentSearch()}
                onInput={(e) => setAgentSearch(e.currentTarget.value)}
                placeholder="Search agents..."
                class="mb-2 w-full rounded-md bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div class="max-h-64 space-y-2 overflow-y-auto pr-1">
                <For each={filteredAgents()}>
                  {(agent) => (
                    <div
                      class={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition ${
                        selectedAgent() === agent.key
                          ? 'border-blue-500 bg-blue-950'
                          : 'border-neutral-700 bg-neutral-900 hover:border-neutral-600'
                      }`}
                      onClick={() => agent.installed && setSelectedAgent(agent.key)}
                    >
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-white">{agent.name}</p>
                        <p class="text-xs text-neutral-500">{agent.description}</p>
                      </div>
                      <Show when={agent.installed}>
                        <input
                          type="radio"
                          checked={selectedAgent() === agent.key}
                          onChange={() => setSelectedAgent(agent.key)}
                          class="ml-3 accent-blue-500"
                        />
                      </Show>
                      <Show when={!agent.installed && agent.available}>
                        <button
                          onClick={(e) => { e.stopPropagation(); installAgent(agent.key); }}
                          disabled={installingAgent() === agent.key}
                          class="ml-3 shrink-0 rounded bg-neutral-700 px-3 py-1 text-xs text-white hover:bg-neutral-600 disabled:opacity-50"
                        >
                          {installingAgent() === agent.key ? 'Installing...' : 'Install'}
                        </button>
                      </Show>
                    </div>
                  )}
                </For>
                <Show when={filteredAgents().length === 0}>
                  <p class="py-4 text-center text-sm text-neutral-500">No agents match "{agentSearch()}"</p>
                </Show>
              </div>
              <Show when={installingAgent() !== '' && agentInstallLog().length > 0}>
                <div class="mt-2 h-20 overflow-y-auto rounded bg-neutral-800 p-2 font-mono text-xs text-neutral-400">
                  <For each={agentInstallLog()}>{(line) => <div>{line}</div>}</For>
                </div>
              </Show>
            </Show>
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!canProceedStep1()}
            class="w-full rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            Continue
          </button>
        </Show>

        {/* Step 2 */}
        <Show when={step() === 2}>
          <h1 class="mb-6 text-xl font-semibold text-white">Confirm setup</h1>

          <div class="mb-6 space-y-3 rounded-lg bg-neutral-900 p-4 text-sm">
            <div class="flex justify-between">
              <span class="text-neutral-400">Workspace</span>
              <span class="text-white">{workspace()}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-neutral-400">Agent</span>
              <span class="text-white">{selectedAgent()}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-neutral-400">Run mode</span>
              <span class="text-white">Daemon (background)</span>
            </div>
          </div>

          <Show when={setupLog().length > 0}>
            <div class="mb-4 h-32 overflow-y-auto rounded-lg bg-neutral-900 p-3 font-mono text-xs text-neutral-400">
              <For each={setupLog()}>{(line) => <div>{line}</div>}</For>
            </div>
          </Show>

          <Show when={setupStatus() === 'error'}>
            <p class="mb-4 text-sm text-red-400">{setupError()}</p>
          </Show>

          <div class="flex gap-3">
            <button
              onClick={() => setStep(1)}
              disabled={setupStatus() === 'running' || setupStatus() === 'starting'}
              class="rounded-md bg-neutral-800 px-4 py-2.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={runSetup}
              disabled={setupStatus() === 'running' || setupStatus() === 'starting' || setupStatus() === 'success'}
              class="flex-1 rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {setupStatus() === 'running' ? 'Setting up...' : setupStatus() === 'starting' ? 'Starting server...' : setupStatus() === 'success' ? '✓ Done' : 'Complete Setup'}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}

function StepDot(props: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      class={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
        props.done
          ? 'bg-green-600 text-white'
          : props.active
          ? 'bg-blue-600 text-white'
          : 'bg-neutral-700 text-neutral-400'
      }`}
    >
      {props.done ? '✓' : props.label}
    </div>
  );
}
