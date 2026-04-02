import { createSignal, onMount, Show, For } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { platform } from '@tauri-apps/plugin-os';
import AnsiToHtml from 'ansi-to-html';

const ansiConverter = new AnsiToHtml({ escapeXML: true, newline: false });

function ansiToHtml(line: string): string {
  try {
    return ansiConverter.toHtml(line);
  } catch {
    return line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }
}

interface Props {
  // Called after install succeeds AND config check passes.
  // Receives whether config already exists so Root can skip wizard.
  onSuccess: (configExists: boolean) => void;
}

const INSTALL_CMD_MACOS =
  'curl -fsSL https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.sh | bash';
const INSTALL_CMD_WINDOWS =
  'powershell -c "irm https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.ps1 | iex"';

export function InstallScreen(props: Props) {
  const [lines, setLines] = createSignal<string[]>([]);
  const [status, setStatus] = createSignal<'running' | 'success' | 'error'>('running');
  const [error, setError] = createSignal('');
  const [configExists, setConfigExists] = createSignal(false);

  let logEl: HTMLDivElement | undefined;

  const runInstall = async () => {
    setLines([]);
    setStatus('running');
    setError('');

    const unlisten = await listen<string>('install-output', (event) => {
      setLines((prev) => [...prev, event.payload]);
      logEl?.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
    });

    try {
      await invoke('run_install_script');
      // Re-check config after install — user may have had a previous install
      const exists = await invoke<boolean>('check_openacp_config').catch(() => false);
      setConfigExists(exists);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(String(err));
    } finally {
      unlisten();
    }
  };

  onMount(runInstall);

  const copyCommand = async () => {
    const os = await platform();
    await writeText(os === 'windows' ? INSTALL_CMD_WINDOWS : INSTALL_CMD_MACOS);
  };

  return (
    <div class="flex h-screen w-screen flex-col items-center justify-center bg-neutral-950 p-8">
      <div class="w-full max-w-2xl">
        <h1 class="mb-2 text-xl font-semibold text-white">Installing OpenACP</h1>
        <p class="mb-6 text-sm text-neutral-400">
          This installs the OpenACP CLI and its dependencies.
        </p>

        {/* Terminal log */}
        <div
          ref={logEl}
          class="mb-4 h-64 overflow-y-auto rounded-lg bg-neutral-900 p-4 font-mono text-xs text-neutral-300"
        >
          <For each={lines()}>
            {(line) => (
              // eslint-disable-next-line solid/no-innerhtml
              <div innerHTML={ansiToHtml(line)} />
            )}
          </For>
          <Show when={status() === 'running'}>
            <span class="animate-pulse text-neutral-500">▌</span>
          </Show>
        </div>

        <Show when={status() === 'success'}>
          <div class="flex items-center justify-between">
            <p class="text-sm text-green-400">✓ OpenACP installed successfully.</p>
            <button
              onClick={() => props.onSuccess(configExists())}
              class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Get Started →
            </button>
          </div>
        </Show>

        <Show when={status() === 'error'}>
          <p class="mb-4 text-sm text-red-400">Installation failed: {error()}</p>
          <div class="flex gap-3">
            <button
              onClick={copyCommand}
              class="rounded-md bg-neutral-800 px-4 py-2 text-sm text-white hover:bg-neutral-700"
            >
              Copy command
            </button>
            <button
              onClick={runInstall}
              class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
            >
              Retry
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
