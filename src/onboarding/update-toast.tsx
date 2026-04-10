import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { check as checkAppUpdate, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ArrowLineDown, Package, X } from '@phosphor-icons/react';

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
    function handleAppCheck(e: Event) {
      const { update } = (e as CustomEvent).detail;
      if (update) setAppUpdate(update);
    }
    function handleCoreCheck(e: Event) {
      const detail = (e as CustomEvent).detail as CoreUpdate;
      if (detail) setCoreUpdate(detail);
    }
    window.addEventListener("app-update-available", handleAppCheck);
    window.addEventListener("core-update-available", handleCoreCheck);
    return () => {
      window.removeEventListener("app-update-available", handleAppCheck);
      window.removeEventListener("core-update-available", handleCoreCheck);
    };
  }, []);

  const updateCore = async () => {
    setCoreUpdating(true); setCoreUpdateError('');
    try {
      await invoke('run_install_script');
      setCoreUpdate(null);
      window.dispatchEvent(new CustomEvent("core-updated"));
    }
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
        <UpdateCard
          icon={<Package size={20} weight="duotone" />}
          title="Update available"
          description={`A new version of OpenACP Core (${coreUpdate.latest}) is now available to install.`}
          loading={coreUpdating}
          error={coreUpdateError}
          actionLabel="Install and restart"
          onAction={updateCore}
          onDismiss={() => setCoreUpdate(null)}
        />
      )}
      {appUpdate && (
        <UpdateCard
          icon={<ArrowLineDown size={20} weight="duotone" />}
          title="Update available"
          description={
            appDownloading
              ? `Downloading v${appUpdate.version}... ${appProgress}%`
              : `A new version of OpenACP (${appUpdate.version}) is now available to install.`
          }
          loading={appDownloading}
          progress={appDownloading ? appProgress : undefined}
          error={appError}
          actionLabel="Install and restart"
          onAction={updateApp}
          onDismiss={() => setAppUpdate(null)}
        />
      )}
    </div>
  );
}

function UpdateCard(props: {
  icon: React.ReactNode
  title: string
  description: string
  loading: boolean
  error?: string
  progress?: number
  actionLabel: string
  onAction: () => void
  onDismiss: () => void
}) {
  return (
    <div className="pointer-events-auto w-[360px] rounded-lg border border-border bg-card shadow-lg relative overflow-hidden">
      <div className="flex gap-3 px-4 pt-3.5 pb-3">
        <div className="shrink-0 mt-0.5 text-muted-foreground">
          {props.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-foreground">{props.title}</p>
            {!props.loading && (
              <button
                onClick={props.onDismiss}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground -mt-0.5 -mr-0.5 p-0.5"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {props.error || props.description}
          </p>
          {props.error && (
            <p className="text-xs text-destructive mt-0.5">{props.error}</p>
          )}
        </div>
      </div>

      {!props.loading && (
        <div className="flex items-center gap-4 px-4 pb-3.5 pl-[44px]">
          <button
            onClick={props.onAction}
            className="text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
          >
            {props.error ? "Retry" : props.actionLabel}
          </button>
          <button
            onClick={props.onDismiss}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Not yet
          </button>
        </div>
      )}

      {props.progress !== undefined && (
        <div className="h-0.5 bg-secondary">
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{ width: `${props.progress}%`, background: 'var(--surface-success-strong)' }}
          />
        </div>
      )}
    </div>
  );
}
