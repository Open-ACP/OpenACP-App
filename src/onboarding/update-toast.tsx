import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { check as checkAppUpdate, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface CoreUpdate { current: string; latest: string; }

export function UpdateToasts() {
  const [coreUpdate, setCoreUpdate] = useState<CoreUpdate | null>(null);
  const [coreUpdating, setCoreUpdating] = useState(false);
  const [coreUpdateError, setCoreUpdateError] = useState('');

  const [appUpdate, setAppUpdate] = useState<Update | null>(null);
  const [appDownloading, setAppDownloading] = useState(false);
  const [appProgress, setAppProgress] = useState(0);
  const [appError, setAppError] = useState('');

  useEffect(() => {
    invoke<CoreUpdate | null>('check_core_update').then(r => { if (r) setCoreUpdate(r) }).catch(() => {});
    setTimeout(() => {
      checkAppUpdate().then(u => { if (u) setAppUpdate(u) }).catch(() => {});
    }, 5000);
  }, []);

  // Listen for manual check from settings
  useEffect(() => {
    function handleManualCheck(e: Event) {
      const { update } = (e as CustomEvent).detail;
      if (update) setAppUpdate(update);
    }
    window.addEventListener("app-update-available", handleManualCheck);
    return () => window.removeEventListener("app-update-available", handleManualCheck);
  }, []);

  const updateCore = async () => {
    setCoreUpdating(true); setCoreUpdateError('');
    try { await invoke('run_install_script'); setCoreUpdate(null); }
    catch (err) { setCoreUpdateError(String(err)); }
    finally { setCoreUpdating(false); }
  };

  const updateApp = async () => {
    if (!appUpdate) return;
    setAppDownloading(true); setAppProgress(0); setAppError('');
    try {
      let totalBytes = 0, downloadedBytes = 0;
      await appUpdate.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) totalBytes = event.data.contentLength;
        else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) setAppProgress(Math.round((downloadedBytes / totalBytes) * 100));
        }
        else if (event.event === "Finished") setAppProgress(100);
      });
      await relaunch();
    } catch (err) {
      setAppError(String(err));
      setAppDownloading(false);
    }
  };

  const hasAny = coreUpdate || appUpdate;
  if (!hasAny) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {coreUpdate && (
        <Toast
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>}
          title={`OpenACP Core ${coreUpdate.latest}`}
          description="A new version is available"
          loading={coreUpdating}
          error={coreUpdateError}
          onUpdate={updateCore}
          onDismiss={() => setCoreUpdate(null)}
        />
      )}
      {appUpdate && (
        <Toast
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/></svg>}
          title={`OpenACP v${appUpdate.version}`}
          description={appDownloading ? `Downloading... ${appProgress}%` : "A new version is available"}
          loading={appDownloading}
          error={appError}
          onUpdate={updateApp}
          onDismiss={() => setAppUpdate(null)}
          progress={appDownloading ? appProgress : undefined}
        />
      )}
    </div>
  );
}

function Toast(props: { icon: React.ReactNode; title: string; description: string; loading: boolean; onUpdate: () => void; onDismiss: () => void; error?: string; progress?: number }) {
  return (
    <div className="pointer-events-auto flex w-[340px] items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg relative overflow-hidden">
      <div className="shrink-0 text-muted-foreground">{props.icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{props.title}</p>
        <p className="text-xs text-muted-foreground">{props.description}</p>
        {props.error && <p className="text-xs text-destructive mt-0.5">{props.error}</p>}
      </div>
      {!props.loading && (
        <button onClick={props.onUpdate} className="text-xs font-medium shrink-0 rounded-md border border-border-weak px-3 py-1 text-foreground hover:bg-accent transition-colors">
          {props.error ? 'Retry' : 'Update'}
        </button>
      )}
      {!props.loading && (
        <button onClick={props.onDismiss} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground" aria-label="Dismiss">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      )}
      {props.progress !== undefined && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-secondary">
          <div className="h-full transition-all duration-300" style={{ width: `${props.progress}%`, background: 'var(--surface-success-strong)' }} />
        </div>
      )}
    </div>
  );
}
