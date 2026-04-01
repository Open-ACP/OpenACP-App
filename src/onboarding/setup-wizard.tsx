import { createSignal, createResource, For, Show } from 'solid-js';
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

interface Props {
  onSuccess: () => void;
}

export function SetupWizard(props: Props) {
  const [step, setStep] = createSignal<1 | 2>(1);
  const [workspace, setWorkspace] = createSignal('');
  const [selectedAgent, setSelectedAgent] = createSignal('');
  const [installingAgent, setInstallingAgent] = createSignal('');
  const [agentInstallError, setAgentInstallError] = createSignal('');
  const [setupLog, setSetupLog] = createSignal<string[]>([]);
  const [setupStatus, setSetupStatus] = createSignal<'idle' | 'running' | 'success' | 'error'>('idle');
  const [setupError, setSetupError] = createSignal('');

  const [agents, { refetch }] = createResource<AgentEntry[]>(async () => {
    const result = await invoke<string>('run_openacp_agents_list');
    return JSON.parse(result) as AgentEntry[];
  });

  const browseWorkspace = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setWorkspace(selected);
    }
  };

  const installAgent = async (key: string) => {
    setInstallingAgent(key);
    setAgentInstallError('');
    try {
      await invoke('run_openacp_agent_install', { agentKey: key });
      setSelectedAgent(key);
      await refetch();
    } catch (err) {
      setAgentInstallError(`Failed to install ${key}: ${String(err)}`);
    } finally {
      setInstallingAgent('');
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
      await invoke('run_openacp_setup', { workspace: workspace(), agent: selectedAgent() });
      setSetupStatus('success');
      setTimeout(() => props.onSuccess(), 800);
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
              <div class="space-y-2">
                <For each={agents()}>
                  {(agent) => (
                    <div
                      class={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition ${
                        selectedAgent() === agent.key
                          ? 'border-blue-500 bg-blue-950'
                          : 'border-neutral-700 bg-neutral-900 hover:border-neutral-600'
                      }`}
                      onClick={() => agent.installed && setSelectedAgent(agent.key)}
                    >
                      <div>
                        <p class="text-sm font-medium text-white">{agent.name}</p>
                        <p class="text-xs text-neutral-500">{agent.description}</p>
                      </div>
                      <Show when={agent.installed}>
                        <input
                          type="radio"
                          checked={selectedAgent() === agent.key}
                          onChange={() => setSelectedAgent(agent.key)}
                          class="accent-blue-500"
                        />
                      </Show>
                      <Show when={!agent.installed && agent.available}>
                        <button
                          onClick={(e) => { e.stopPropagation(); installAgent(agent.key); }}
                          disabled={installingAgent() === agent.key}
                          class="rounded bg-neutral-700 px-3 py-1 text-xs text-white hover:bg-neutral-600 disabled:opacity-50"
                        >
                          {installingAgent() === agent.key ? 'Installing...' : 'Install'}
                        </button>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
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
              disabled={setupStatus() === 'running'}
              class="rounded-md bg-neutral-800 px-4 py-2.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={runSetup}
              disabled={setupStatus() === 'running' || setupStatus() === 'success'}
              class="flex-1 rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {setupStatus() === 'running' ? 'Setting up...' : setupStatus() === 'success' ? '✓ Done' : 'Complete Setup'}
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
