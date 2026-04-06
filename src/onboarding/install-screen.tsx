import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { platform } from '@tauri-apps/plugin-os';
import AnsiToHtml from 'ansi-to-html';

const ansiConverter = new AnsiToHtml({ escapeXML: true, newline: false });
function ansiToHtml(line: string): string {
  try { return ansiConverter.toHtml(line); } catch { return line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''); }
}

interface Props { onSuccess: (configExists: boolean) => void; }

const INSTALL_CMD_MACOS = 'curl -fsSL https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.sh | bash';
const INSTALL_CMD_WINDOWS = 'powershell -c "irm https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.ps1 | iex"';

export function InstallScreen(props: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<'running' | 'success' | 'error'>('running');
  const [error, setError] = useState('');
  const [configExists, setConfigExists] = useState(false);
  const logEl = useRef<HTMLDivElement>(null);

  const runInstall = async () => {
    setLines([]); setStatus('running'); setError('');
    const unlisten = await listen<string>('install-output', (event) => {
      setLines((prev) => [...prev, event.payload]);
      logEl.current?.scrollTo({ top: logEl.current.scrollHeight, behavior: 'smooth' });
    });
    try {
      await invoke('run_install_script');
      const exists = await invoke<boolean>('check_openacp_config').catch(() => false);
      setConfigExists(exists); setStatus('success');
    } catch (err) { setStatus('error'); setError(String(err)); } finally { unlisten(); }
  };

  useEffect(() => { runInstall(); }, []);

  const copyCommand = async () => { const os = await platform(); await writeText(os === 'windows' ? INSTALL_CMD_WINDOWS : INSTALL_CMD_MACOS); };
  const progressPercent = () => { const l = lines.length; if (status === 'success') return 100; if (status === 'error') return l; return Math.min(95, l * 3); };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-start bg-background-base p-8 pt-16">
      <div className="flex w-full max-w-[520px] flex-col items-center gap-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-text-strong">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--background-stronger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>
        </div>
        <div className="flex flex-col items-center gap-2"><h1 className="text-xl-medium text-text-strong">Installing OpenACP</h1><p className="text-md-regular text-text-weak">Setting up the OpenACP CLI on your system...</p></div>
        <div ref={logEl} className="h-[200px] w-full overflow-y-auto rounded-lg bg-[#1a1a1a] p-4 text-12-mono text-[#a3a3a3]">
          {lines.map((line, i) => <div key={i} dangerouslySetInnerHTML={{ __html: ansiToHtml(line) }} />)}
          {status === 'running' && <span className="animate-pulse text-[#737373]">|</span>}
        </div>
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full items-center justify-between"><span className="text-sm-regular text-text-weak">{status === 'success' ? 'Completed' : status === 'error' ? 'Failed' : 'Installing...'}</span><span className="text-sm-medium text-text-strong">{progressPercent()}%</span></div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised-base"><div className={`h-full rounded-full transition-all duration-300 ${status === 'running' ? 'bg-text-strong' : status === 'success' ? 'bg-surface-success-strong' : 'bg-surface-critical-strong'}`} style={{ width: `${progressPercent()}%` }} /></div>
        </div>
        {status === 'success' && (
          <div className="flex w-full items-center justify-between rounded-lg border border-border-base bg-surface-raised-base px-4 py-3">
            <span className="text-md-regular text-surface-success-strong">OpenACP installed successfully</span>
            <button onClick={() => props.onSuccess(configExists)} className="text-md-medium rounded-md bg-text-strong px-4 py-2 text-background-stronger transition-opacity hover:opacity-90">Get Started</button>
          </div>
        )}
        {status === 'error' && (
          <div className="w-full rounded-lg border border-surface-critical-strong bg-surface-raised-base p-4">
            <p className="text-md-medium mb-1 text-surface-critical-strong">Installation Failed</p><p className="text-md-regular mb-4 text-surface-critical-strong">{error}</p>
            <div className="flex justify-end gap-3">
              <button onClick={copyCommand} className="text-md-medium rounded-md border border-border-base bg-background-stronger px-4 py-2 text-text-strong transition-colors hover:bg-surface-raised-base-hover">Copy command</button>
              <button onClick={runInstall} className="text-md-medium rounded-md bg-text-strong px-4 py-2 text-background-stronger transition-opacity hover:opacity-90">Retry</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
