import { createSignal, onMount, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { check as checkAppUpdate } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface CoreUpdate {
  current: string;
  latest: string;
}

export function UpdateToasts() {
  const [coreUpdate, setCoreUpdate] = createSignal<CoreUpdate | null>(null);
  const [appUpdateAvailable, setAppUpdateAvailable] = createSignal(false);
  const [coreUpdating, setCoreUpdating] = createSignal(false);
  const [appUpdating, setAppUpdating] = createSignal(false);
  const [coreUpdateError, setCoreUpdateError] = createSignal('');

  onMount(async () => {
    try {
      const result = await invoke<CoreUpdate | null>('check_core_update');
      if (result) setCoreUpdate(result);
    } catch {
      // silent fail
    }

    try {
      const update = await checkAppUpdate();
      if (update?.available) setAppUpdateAvailable(true);
    } catch {
      // silent fail
    }
  });

  const updateCore = async () => {
    setCoreUpdating(true);
    setCoreUpdateError('');
    try {
      await invoke('run_install_script');
      setCoreUpdate(null);
    } catch (err) {
      setCoreUpdateError(String(err));
    } finally {
      setCoreUpdating(false);
    }
  };

  const updateApp = async () => {
    setAppUpdating(true);
    try {
      const update = await checkAppUpdate();
      if (update?.available) {
        await update.downloadAndInstall();
        await relaunch();
      }
    } finally {
      setAppUpdating(false);
    }
  };

  return (
    <div class="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <Show when={coreUpdate()}>
        {(info) => (
          <Toast
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-strong)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
            }
            title={`OpenACP Core ${info().latest}`}
            description="A new version is available"
            loading={coreUpdating()}
            onUpdate={updateCore}
            onDismiss={() => setCoreUpdate(null)}
            error={coreUpdateError()}
          />
        )}
      </Show>
      <Show when={appUpdateAvailable()}>
        <Toast
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-strong)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
          }
          title="OpenACP App update"
          description="Desktop app update available"
          loading={appUpdating()}
          onUpdate={updateApp}
          onDismiss={() => setAppUpdateAvailable(false)}
        />
      </Show>
    </div>
  );
}

function Toast(props: {
  icon: any;
  title: string;
  description: string;
  loading: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
  error?: string;
}) {
  return (
    <div class="pointer-events-auto flex w-[340px] items-center gap-3 rounded-lg border border-border-base bg-surface-raised-stronger px-4 py-3.5 shadow-lg">
      <div class="shrink-0">{props.icon}</div>
      <div class="min-w-0 flex-1">
        <p class="text-12-medium text-text-strong">{props.title}</p>
        <p class="text-12-regular text-text-weak">{props.description}</p>
        <Show when={props.error}>
          <p class="text-12-regular mt-1 text-surface-critical-strong">{props.error}</p>
        </Show>
      </div>
      <button
        onClick={props.onUpdate}
        disabled={props.loading}
        class="text-12-medium shrink-0 rounded-md bg-text-strong px-3.5 py-1.5 text-background-stronger transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {props.loading ? '...' : 'Update'}
      </button>
      <button
        onClick={props.onDismiss}
        class="shrink-0 text-text-weak transition-colors hover:text-text-strong"
        aria-label="Dismiss"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
  );
}
