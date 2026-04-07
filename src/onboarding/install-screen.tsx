import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { platform } from '@tauri-apps/plugin-os';
import AnsiToHtml from 'ansi-to-html';
import appIcon from '../assets/app-icon.png';

const ansiConverter = new AnsiToHtml({ escapeXML: true, newline: false });
function ansiToHtml(line: string): string {
  try { return ansiConverter.toHtml(line); } catch { return line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''); }
}
function stripAnsi(line: string): string {
  return line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

interface Props { onSuccess: (configExists: boolean) => void; }

const INSTALL_CMD_MACOS = 'curl -fsSL https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.sh | bash';
const INSTALL_CMD_WINDOWS = 'powershell -c "irm https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.ps1 | iex"';

export function InstallScreen(props: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<'running' | 'success' | 'error'>('running');
  const [error, setError] = useState('');
  const [configExists, setConfigExists] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);
  const logEl = useRef<HTMLDivElement>(null);

  const runInstall = async () => {
    setLines([]); setStatus('running'); setError(''); setLogsCopied(false);
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

  const copyLogs = async () => {
    const text = lines.map(stripAnsi).join('\n');
    await writeText(text);
    setLogsCopied(true);
    setTimeout(() => setLogsCopied(false), 2000);
  };

  const progressPercent = () => { const l = lines.length; if (status === 'success') return 100; if (status === 'error') return l; return Math.min(95, l * 3); };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-background p-8">
      <div className="flex w-full max-w-[480px] flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <img src={appIcon} alt="OpenACP" className="size-14 rounded-xl" />
          <h1 className="text-lg font-medium text-foreground">Installing OpenACP</h1>
          <p className="text-sm text-muted-foreground">Setting up the CLI on your system</p>
        </div>

        {/* Terminal log */}
        <div className="w-full rounded-lg border border-border-weak bg-[#0a0a0a] overflow-hidden">
          <div ref={logEl} className="h-[200px] overflow-y-auto p-4 font-mono text-xs text-[#a3a3a3] leading-relaxed">
            {lines.map((line, i) => <div key={i} dangerouslySetInnerHTML={{ __html: ansiToHtml(line) }} />)}
            {status === 'running' && <span className="animate-pulse text-muted-foreground">|</span>}
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-t border-border-weak/30">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {status === 'success' ? 'Completed' : status === 'error' ? 'Failed' : 'Installing...'}
              </span>
              <span className="text-xs font-mono text-foreground-weak">{progressPercent()}%</span>
            </div>
            {lines.length > 0 && (
              <button onClick={copyLogs} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {logsCopied ? 'Copied!' : 'Copy logs'}
              </button>
            )}
          </div>
          <div className="h-1 bg-secondary">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${progressPercent()}%`,
                background: status === 'error' ? 'var(--surface-critical-strong)' : 'var(--surface-success-strong)',
              }}
            />
          </div>
        </div>

        {status === 'success' && (
          <button
            onClick={() => props.onSuccess(configExists)}
            className="w-full h-10 rounded-lg bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90"
          >
            Get Started
          </button>
        )}

        {status === 'error' && (
          <div className="w-full space-y-3">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={copyCommand} className="flex-1 h-9 rounded-lg border border-border-weak text-sm font-medium text-foreground-weak hover:bg-accent transition-colors">
                Copy command
              </button>
              <button onClick={runInstall} className="flex-1 h-9 rounded-lg bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90">
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
