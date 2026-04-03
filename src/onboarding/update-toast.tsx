import { useState, useEffect, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { check as checkAppUpdate } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface CoreUpdate {
  current: string;
  latest: string;
}

export function UpdateToasts() {
  const [coreUpdate, setCoreUpdate] = useState<CoreUpdate | null>(null);
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const [coreUpdating, setCoreUpdating] = useState(false);
  const [appUpdating, setAppUpdating] = useState(false);
  const [coreUpdateError, setCoreUpdateError] = useState('');

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

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
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {coreUpdate && (
        <UpdateToast
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
          }
          title={`OpenACP Core ${coreUpdate.latest}`}
          description="A new version is available"
          loading={coreUpdating}
          onUpdate={updateCore}
          onDismiss={() => setCoreUpdate(null)}
          error={coreUpdateError}
        />
      )}
      {appUpdateAvailable && (
        <UpdateToast
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
          }
          title="OpenACP App update"
          description="Desktop app update available"
          loading={appUpdating}
          onUpdate={updateApp}
          onDismiss={() => setAppUpdateAvailable(false)}
        />
      )}
    </div>
  );
}

function UpdateToast({
  icon,
  title,
  description,
  loading,
  onUpdate,
  onDismiss,
  error,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  loading: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
  error?: string;
}) {
  return (
    <div className="pointer-events-auto flex w-[340px] items-center gap-3 rounded-lg border border-border-base bg-surface-raised-stronger px-4 py-3.5 shadow-lg">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-12-medium text-text-strong">{title}</p>
        <p className="text-12-regular text-text-weak">{description}</p>
        {error && (
          <p className="text-12-regular mt-1 text-surface-critical-strong">{error}</p>
        )}
      </div>
      <button
        onClick={onUpdate}
        disabled={loading}
        className="text-12-medium shrink-0 rounded-md bg-text-strong px-3.5 py-1.5 text-background-stronger transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? '...' : 'Update'}
      </button>
      <button
        onClick={onDismiss}
        className="shrink-0 text-text-weak transition-colors hover:text-text-strong"
        aria-label="Dismiss"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
  );
}
