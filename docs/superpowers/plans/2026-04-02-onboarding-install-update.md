# Onboarding, Install & Update Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-run onboarding to the OpenACP desktop app — auto-install the CLI if missing, run a 2-step setup wizard, and show non-blocking update toasts on subsequent launches.

**Architecture:** At startup, the Tauri backend checks whether `openacp` is installed and whether a config exists; the SolidJS frontend renders one of four screens (Splash → Install → Setup Wizard → Main App) based on those results. A new non-interactive `openacp setup` CLI command allows the wizard to configure the CLI with a single invocation.

**Tech Stack:** SolidJS, TailwindCSS v4, Tauri 2 (`tauri-plugin-shell`, `tauri-plugin-dialog`, `tauri-plugin-updater`), TypeScript ESM (CLI), Rust (Tauri backend), Vitest

---

## File Structure

**New — CLI:**
- `OpenACP/src/cli/commands/setup.ts` — non-interactive setup command
- `OpenACP/src/cli/commands/__tests__/setup.test.ts` — tests for setup command

**Modified — CLI:**
- `OpenACP/src/cli/commands/agents.ts` — add `--json` flag to `agents list`
- `OpenACP/src/cli/commands/__tests__/agents-json.test.ts` — tests for `--json` flag
- `OpenACP/src/cli/commands/index.ts` — export `cmdSetup`
- `OpenACP/src/cli.ts` — register `setup` in instance commands

**New — Rust:**
- `OpenACP-App/src-tauri/src/onboarding.rs` — all Tauri onboarding commands

**Modified — Rust:**
- `OpenACP-App/src-tauri/src/lib.rs` — add `mod onboarding`, register commands

**New — Frontend:**
- `OpenACP-App/src/onboarding/startup.ts` — startup state machine (pure logic)
- `OpenACP-App/src/onboarding/splash-screen.tsx` — loading screen
- `OpenACP-App/src/onboarding/install-screen.tsx` — CLI install with streaming log
- `OpenACP-App/src/onboarding/setup-wizard.tsx` — 2-step setup wizard
- `OpenACP-App/src/onboarding/update-toast.tsx` — Core/App update toasts
- `OpenACP-App/src/onboarding/__tests__/startup.test.ts` — startup logic tests

**Modified — Frontend:**
- `OpenACP-App/src/main.tsx` — insert startup check + screen switching

---

## Task 1: Add `--json` flag to `openacp agents list`

**Files:**
- Modify: `OpenACP/src/cli/commands/agents.ts`
- Create: `OpenACP/src/cli/commands/__tests__/agents-json.test.ts`

- [ ] **Step 1: Write the failing test**

Create `OpenACP/src/cli/commands/__tests__/agents-json.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the catalog module
vi.mock('../../../core/agents/agent-catalog.js', () => ({
  AgentCatalog: vi.fn().mockImplementation(() => ({
    load: vi.fn(),
    refreshRegistryIfStale: vi.fn().mockResolvedValue(undefined),
    getAvailable: vi.fn().mockReturnValue([
      {
        key: 'claude-code',
        name: 'Claude Code',
        version: '1.0.0',
        distribution: 'npm',
        description: 'AI coding agent',
        installed: true,
        available: true,
        missingDeps: [],
      },
      {
        key: 'gemini',
        name: 'Gemini CLI',
        version: '0.5.0',
        distribution: 'npm',
        description: 'Google Gemini agent',
        installed: false,
        available: true,
        missingDeps: [],
      },
    ]),
  })),
}));

describe('agents list --json', () => {
  let output: string;

  beforeEach(() => {
    output = '';
    vi.spyOn(console, 'log').mockImplementation((s: string) => { output += s; });
  });

  it('outputs valid JSON array when --json flag is passed', async () => {
    const { cmdAgents } = await import('../agents.js');
    await cmdAgents(['list', '--json'], undefined);

    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      key: 'claude-code',
      installed: true,
      available: true,
    });
  });

  it('includes all required fields in each agent entry', async () => {
    const { cmdAgents } = await import('../agents.js');
    await cmdAgents(['--json'], undefined);

    const parsed = JSON.parse(output);
    const fields = ['key', 'name', 'version', 'distribution', 'description', 'installed', 'available', 'missingDeps'];
    for (const field of fields) {
      expect(parsed[0]).toHaveProperty(field);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/OpenACP && pnpm test src/cli/commands/__tests__/agents-json.test.ts
```

Expected: FAIL — `--json` flag not yet handled, test sees text output not JSON.

- [ ] **Step 3: Modify `cmdAgents` to pass `--json` to `agentsList`**

In `OpenACP/src/cli/commands/agents.ts`, update the `list`/`undefined` case:

```typescript
// Before (line 65-67):
case "list":
case undefined:
  return agentsList(instanceRoot);

// After:
case "list":
case undefined:
  return agentsList(instanceRoot, args.includes("--json"));
```

- [ ] **Step 4: Update `agentsList` signature and add JSON branch**

In `OpenACP/src/cli/commands/agents.ts`, change `agentsList`:

```typescript
async function agentsList(instanceRoot?: string, json = false): Promise<void> {
  const catalog = await createCatalog(instanceRoot);
  catalog.load();
  await catalog.refreshRegistryIfStale();

  const items = catalog.getAvailable();

  if (json) {
    console.log(JSON.stringify(items.map((item) => ({
      key: item.key,
      name: item.name,
      version: item.version,
      distribution: item.distribution,
      description: item.description ?? "",
      installed: item.installed,
      available: item.available ?? true,
      missingDeps: item.missingDeps ?? [],
    }))));
    return;
  }

  // --- existing text output unchanged below ---
  const installed = items.filter((i) => i.installed);
  const available = items.filter((i) => !i.installed);
  // ... rest of function stays exactly as-is
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /path/to/OpenACP && pnpm test src/cli/commands/__tests__/agents-json.test.ts
```

Expected: PASS — both tests green.

- [ ] **Step 6: Commit**

```bash
cd /path/to/OpenACP
git add src/cli/commands/agents.ts src/cli/commands/__tests__/agents-json.test.ts
git commit -m "feat(cli): add --json flag to openacp agents list"
```

---

## Task 2: Add `openacp setup` non-interactive command

**Files:**
- Create: `OpenACP/src/cli/commands/setup.ts`
- Create: `OpenACP/src/cli/commands/__tests__/setup.test.ts`
- Modify: `OpenACP/src/cli/commands/index.ts`
- Modify: `OpenACP/src/cli.ts`

- [ ] **Step 1: Write the failing test**

Create `OpenACP/src/cli/commands/__tests__/setup.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('cmdSetup', () => {
  let tmpDir: string;

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes config.json with correct fields when all flags provided', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openacp-setup-test-'));
    const instanceRoot = tmpDir;

    const { cmdSetup } = await import('../setup.js');
    await cmdSetup(
      ['--workspace', '/tmp/my-workspace', '--agent', 'claude-code', '--run-mode', 'daemon'],
      instanceRoot,
    );

    const configPath = path.join(instanceRoot, 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.workspace.baseDir).toBe('/tmp/my-workspace');
    expect(config.defaultAgent).toBe('claude-code');
    expect(config.runMode).toBe('daemon');
  });

  it('outputs JSON result when --json flag is passed', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openacp-setup-test-'));
    let output = '';
    vi.spyOn(console, 'log').mockImplementation((s: string) => { output += s; });

    const { cmdSetup } = await import('../setup.js');
    await cmdSetup(
      ['--workspace', '/tmp/ws', '--agent', 'claude-code', '--json'],
      tmpDir,
    );

    const result = JSON.parse(output);
    expect(result.success).toBe(true);
    expect(result.configPath).toContain('config.json');
  });

  it('exits with error when --workspace is missing', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openacp-setup-test-'));
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    const { cmdSetup } = await import('../setup.js');
    await expect(cmdSetup(['--agent', 'claude-code'], tmpDir)).rejects.toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/OpenACP && pnpm test src/cli/commands/__tests__/setup.test.ts
```

Expected: FAIL — module `setup.js` not found.

- [ ] **Step 3: Create `OpenACP/src/cli/commands/setup.ts`**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

export async function cmdSetup(args: string[], instanceRoot: string): Promise<void> {
  const workspace = parseFlag(args, '--workspace');
  const agentRaw = parseFlag(args, '--agent');
  const runMode = (parseFlag(args, '--run-mode') ?? 'daemon') as 'daemon' | 'foreground';
  const json = args.includes('--json');

  if (!workspace) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: '--workspace is required' }));
    } else {
      console.error('  Error: --workspace <path> is required');
    }
    process.exit(1);
  }

  if (!agentRaw) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: '--agent is required' }));
    } else {
      console.error('  Error: --agent <name> is required');
    }
    process.exit(1);
  }

  const defaultAgent = agentRaw.split(',')[0]!.trim();

  const configPath = path.join(instanceRoot, 'config.json');

  // Read existing config if present, otherwise start from scratch
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // ignore parse errors — will overwrite
    }
  }

  const config = {
    ...existing,
    channels: (existing.channels as Record<string, unknown>) ?? {},
    defaultAgent,
    workspace: { baseDir: workspace },
    runMode,
    autoStart: false,
  };

  fs.mkdirSync(instanceRoot, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  if (json) {
    console.log(JSON.stringify({ success: true, configPath }));
  } else {
    console.log(`\n  \x1b[32m✓ Setup complete.\x1b[0m Config written to ${configPath}\n`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /path/to/OpenACP && pnpm test src/cli/commands/__tests__/setup.test.ts
```

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Export from index and register in CLI**

In `OpenACP/src/cli/commands/index.ts`, add after the last export line:

```typescript
export { cmdSetup } from './setup.js'
```

In `OpenACP/src/cli.ts`, add `cmdSetup` to the import and register it:

```typescript
// Add to import (after cmdRemote):
import {
  // ... existing imports ...
  cmdRemote,
  cmdSetup,        // ADD THIS
} from './cli/commands/index.js'

// Add to instanceCommands map (after 'remote'):
'setup': (r) => cmdSetup(args, r),
```

- [ ] **Step 6: Verify CLI registration works**

```bash
cd /path/to/OpenACP && pnpm build && node dist/cli.js setup --help
```

Expected: command runs without "Unknown command" error (may show missing flags error — that's fine).

- [ ] **Step 7: Commit**

```bash
cd /path/to/OpenACP
git add src/cli/commands/setup.ts src/cli/commands/__tests__/setup.test.ts \
        src/cli/commands/index.ts src/cli.ts
git commit -m "feat(cli): add non-interactive openacp setup command"
```

---

## Task 3: Tauri — check commands in `onboarding.rs`

**Files:**
- Create: `OpenACP-App/src-tauri/src/onboarding.rs`
- Modify: `OpenACP-App/src-tauri/src/lib.rs`

- [ ] **Step 1: Create `OpenACP-App/src-tauri/src/onboarding.rs` with check commands**

```rust
use tauri_plugin_shell::ShellExt;

/// Runs `openacp --version` and returns the version string, or None if not installed.
/// Returns Ok(None) both when the binary doesn't exist and when it exits non-zero.
#[tauri::command]
pub async fn check_openacp_installed(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let result = app
        .shell()
        .command("openacp")
        .args(["--version"])
        .output()
        .await;

    match result {
        Err(_) => Ok(None), // binary not found or spawn failed = not installed
        Ok(output) if !output.status.success() => Ok(None),
        Ok(output) => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(Some(version))
        }
    }
}

/// Returns true if ~/.openacp/config.json exists.
#[tauri::command]
pub async fn check_openacp_config() -> Result<bool, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let config_path = home.join(".openacp").join("config.json");
    Ok(config_path.exists())
}

/// Calls the npm registry to check if a newer @openacp/cli version is available.
/// Returns None if already up to date or check fails (network error, etc.).
#[derive(Clone, serde::Serialize)]
pub struct CoreUpdateInfo {
    pub current: String,
    pub latest: String,
}

#[tauri::command]
pub async fn check_core_update(app: tauri::AppHandle) -> Result<Option<CoreUpdateInfo>, String> {
    // Get current version
    let output = app
        .shell()
        .command("openacp")
        .args(["--version"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(None);
    }

    let current = String::from_utf8_lossy(&output.stdout)
        .trim()
        .trim_start_matches("openacp v")
        .to_string();

    // Check npm registry (5s timeout)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://registry.npmjs.org/@openacp/cli/latest")
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(_) => return Ok(None), // silent fail on network error
    };

    let json: serde_json::Value = match resp.json().await {
        Ok(j) => j,
        Err(_) => return Ok(None),
    };

    let latest = json["version"].as_str().unwrap_or("").to_string();

    if latest.is_empty() || latest == current {
        return Ok(None);
    }

    Ok(Some(CoreUpdateInfo { current, latest }))
}
```

- [ ] **Step 2: Add `dirs` dependency to Cargo.toml**

In `OpenACP-App/src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
dirs = "5"
```

- [ ] **Step 3: Register the module and commands in `lib.rs`**

In `OpenACP-App/src-tauri/src/lib.rs`:

```rust
// Add at top (after `mod sidecar;`):
mod onboarding;

// Update invoke_handler to include new commands:
.invoke_handler(tauri::generate_handler![
    get_server_info,
    get_workspace_server_info,
    start_server,
    stop_server,
    onboarding::check_openacp_installed,
    onboarding::check_openacp_config,
    onboarding::check_core_update,
])
```

- [ ] **Step 4: Build to verify it compiles**

```bash
cd /path/to/OpenACP-App && cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
cd /path/to/OpenACP-App
git add src-tauri/src/onboarding.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat(tauri): add onboarding check commands"
```

---

## Task 4: Tauri — streaming install and setup commands

**Files:**
- Modify: `OpenACP-App/src-tauri/src/onboarding.rs`
- Modify: `OpenACP-App/src-tauri/src/lib.rs`

- [ ] **Step 1: Add `run_install_script` to `onboarding.rs`**

Add after the existing functions in `onboarding.rs`:

```rust
/// Runs the openacp install script for the current OS.
/// Streams stdout/stderr line-by-line via the "install-output" Tauri event.
/// Returns Ok(()) on success, Err(message) on non-zero exit.
#[tauri::command]
pub async fn run_install_script(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::process::CommandEvent;

    let os = std::env::consts::OS;

    let (mut rx, _child) = match os {
        "macos" | "linux" => app
            .shell()
            .command("bash")
            .args([
                "-c",
                "curl -fsSL https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.sh | bash",
            ])
            .spawn()
            .map_err(|e| e.to_string())?,
        "windows" => app
            .shell()
            .command("powershell")
            .args([
                "-Command",
                "irm https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.ps1 | iex",
            ])
            .spawn()
            .map_err(|e| e.to_string())?,
        other => return Err(format!("Unsupported OS: {other}")),
    };

    let mut exit_code: Option<i32> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                let _ = app.emit("install-output", line);
            }
            CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                let _ = app.emit("install-output", line);
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                break;
            }
            _ => {}
        }
    }

    match exit_code {
        Some(0) | None => Ok(()),
        Some(code) => Err(format!("Install script exited with code {code}")),
    }
}
```

- [ ] **Step 2: Add `run_openacp_setup` to `onboarding.rs`**

Add after `run_install_script`:

```rust
/// Runs `openacp setup --global --workspace <workspace> --agent <agent>
///   --run-mode daemon --json` and streams output via "setup-output" event.
/// Returns the JSON result string from the CLI on success.
#[tauri::command]
pub async fn run_openacp_setup(
    app: tauri::AppHandle,
    workspace: String,
    agent: String,
) -> Result<String, String> {
    use tauri_plugin_shell::process::CommandEvent;

    let (mut rx, _child) = app
        .shell()
        .command("openacp")
        .args([
            "setup",
            "--global",
            "--workspace",
            &workspace,
            "--agent",
            &agent,
            "--run-mode",
            "daemon",
            "--json",
        ])
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut json_result = String::new();
    let mut exit_code: Option<i32> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                json_result.push_str(&line);
                let _ = app.emit("setup-output", line);
            }
            CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                let _ = app.emit("setup-output", line);
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                break;
            }
            _ => {}
        }
    }

    match exit_code {
        Some(0) | None => Ok(json_result),
        Some(code) => Err(format!("openacp setup exited with code {code}: {json_result}")),
    }
}
```

- [ ] **Step 3: Register the new commands in `lib.rs`**

Update `invoke_handler` in `lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    get_server_info,
    get_workspace_server_info,
    start_server,
    stop_server,
    onboarding::check_openacp_installed,
    onboarding::check_openacp_config,
    onboarding::check_core_update,
    onboarding::run_install_script,    // ADD
    onboarding::run_openacp_setup,     // ADD
])
```

- [ ] **Step 4: Build to verify it compiles**

```bash
cd /path/to/OpenACP-App && cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
cd /path/to/OpenACP-App
git add src-tauri/src/onboarding.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): add streaming install and setup commands"
```

---

## Task 5: Frontend — Startup state machine

**Files:**
- Create: `OpenACP-App/src/onboarding/startup.ts`
- Create: `OpenACP-App/src/onboarding/__tests__/startup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `OpenACP-App/src/onboarding/__tests__/startup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { determineStartupScreen } from '../startup.js';

describe('determineStartupScreen', () => {
  it('returns "install" when openacp is not installed', () => {
    expect(determineStartupScreen({ installed: false, configExists: false })).toBe('install');
  });

  it('returns "setup" when installed but no config', () => {
    expect(determineStartupScreen({ installed: true, configExists: false })).toBe('setup');
  });

  it('returns "ready" when installed and config exists', () => {
    expect(determineStartupScreen({ installed: true, configExists: true })).toBe('ready');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/OpenACP-App && pnpm test src/onboarding/__tests__/startup.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `OpenACP-App/src/onboarding/startup.ts`**

```typescript
export type StartupScreen = 'splash' | 'install' | 'setup' | 'ready';

export interface StartupCheckResult {
  installed: boolean;
  configExists: boolean;
}

export function determineStartupScreen(result: StartupCheckResult): Exclude<StartupScreen, 'splash'> {
  if (!result.installed) return 'install';
  if (!result.configExists) return 'setup';
  return 'ready';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /path/to/OpenACP-App && pnpm test src/onboarding/__tests__/startup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /path/to/OpenACP-App
git add src/onboarding/startup.ts src/onboarding/__tests__/startup.test.ts
git commit -m "feat(onboarding): add startup state machine"
```

---

## Task 6: Frontend — SplashScreen component

**Files:**
- Create: `OpenACP-App/src/onboarding/splash-screen.tsx`

- [ ] **Step 1: Create `OpenACP-App/src/onboarding/splash-screen.tsx`**

```tsx
export function SplashScreen() {
  return (
    <div class="flex h-screen w-screen flex-col items-center justify-center bg-neutral-950">
      <img
        src="/icons/icon.png"
        alt="OpenACP"
        class="mb-8 h-16 w-16 rounded-2xl"
      />
      <div class="flex gap-1.5">
        <span class="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
        <span class="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
        <span class="h-2 w-2 animate-bounce rounded-full bg-neutral-400" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it renders in the app (manual)**

Temporarily render `<SplashScreen />` in `main.tsx` and run `pnpm tauri dev` to confirm it displays correctly.

- [ ] **Step 3: Commit**

```bash
cd /path/to/OpenACP-App
git add src/onboarding/splash-screen.tsx
git commit -m "feat(onboarding): add SplashScreen component"
```

---

## Task 7: Frontend — InstallScreen component

**Files:**
- Create: `OpenACP-App/src/onboarding/install-screen.tsx`

- [ ] **Step 1: Create `OpenACP-App/src/onboarding/install-screen.tsx`**

```tsx
import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { platform } from '@tauri-apps/plugin-os';

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
      setStatus('success');
      // Re-check config after install — user may have had a previous install
      const configExists = await invoke<boolean>('check_openacp_config').catch(() => false);
      setTimeout(() => props.onSuccess(configExists), 800);
    } catch (err) {
      setStatus('error');
      setError(String(err));
    } finally {
      unlisten();
    }
  };

  onMount(runInstall);
  onCleanup(() => {});

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
          {lines().map((line) => (
            <div>{line}</div>
          ))}
          <Show when={status() === 'running'}>
            <span class="animate-pulse text-neutral-500">▌</span>
          </Show>
        </div>

        <Show when={status() === 'success'}>
          <p class="text-sm text-green-400">✓ Installation complete. Starting setup...</p>
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
```

- [ ] **Step 2: Commit**

```bash
cd /path/to/OpenACP-App
git add src/onboarding/install-screen.tsx
git commit -m "feat(onboarding): add InstallScreen with streaming log"
```

---

## Task 8: Frontend — SetupWizard component

**Files:**
- Create: `OpenACP-App/src/onboarding/setup-wizard.tsx`

- [ ] **Step 1: Create `OpenACP-App/src/onboarding/setup-wizard.tsx`**

```tsx
import { createSignal, createResource, For, Show, onCleanup, onMount } from 'solid-js';
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
```

- [ ] **Step 2: Add the two helper Tauri commands used by SetupWizard**

The wizard calls `run_openacp_agents_list` and `run_openacp_agent_install`. Add these to `onboarding.rs`:

```rust
/// Runs `openacp agents list --json` and returns the raw JSON string.
#[tauri::command]
pub async fn run_openacp_agents_list(app: tauri::AppHandle) -> Result<String, String> {
    let output = app
        .shell()
        .command("openacp")
        .args(["agents", "list", "--json"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Runs `openacp agents install <agent_key>`, streaming output via "agent-install-output".
#[tauri::command]
pub async fn run_openacp_agent_install(
    app: tauri::AppHandle,
    agent_key: String,
) -> Result<(), String> {
    use tauri_plugin_shell::process::CommandEvent;

    let (mut rx, _child) = app
        .shell()
        .command("openacp")
        .args(["agents", "install", &agent_key])
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut exit_code: Option<i32> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                let _ = app.emit("agent-install-output", line);
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                break;
            }
            _ => {}
        }
    }

    match exit_code {
        Some(0) | None => Ok(()),
        Some(code) => Err(format!("Agent install exited with code {code}")),
    }
}
```

- [ ] **Step 3: Register the new commands in `lib.rs`**

```rust
.invoke_handler(tauri::generate_handler![
    get_server_info,
    get_workspace_server_info,
    start_server,
    stop_server,
    onboarding::check_openacp_installed,
    onboarding::check_openacp_config,
    onboarding::check_core_update,
    onboarding::run_install_script,
    onboarding::run_openacp_setup,
    onboarding::run_openacp_agents_list,   // ADD
    onboarding::run_openacp_agent_install, // ADD
])
```

- [ ] **Step 4: Build to verify it compiles**

```bash
cargo build --manifest-path OpenACP-App/src-tauri/Cargo.toml
```

- [ ] **Step 5: Commit**

```bash
cd /path/to/OpenACP-App
git add src/onboarding/setup-wizard.tsx src-tauri/src/onboarding.rs src-tauri/src/lib.rs
git commit -m "feat(onboarding): add SetupWizard and agent list/install Tauri commands"
```

---

## Task 9: Frontend — UpdateToast component

**Files:**
- Create: `OpenACP-App/src/onboarding/update-toast.tsx`

- [ ] **Step 1: Create `OpenACP-App/src/onboarding/update-toast.tsx`**

```tsx
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

  onMount(async () => {
    // Check core update
    try {
      const result = await invoke<CoreUpdate | null>('check_core_update');
      if (result) setCoreUpdate(result);
    } catch {
      // silent fail
    }

    // Check app update
    try {
      const update = await checkAppUpdate();
      if (update?.available) setAppUpdateAvailable(true);
    } catch {
      // silent fail
    }
  });

  const updateCore = async () => {
    setCoreUpdating(true);
    try {
      await invoke('run_install_script');
      setCoreUpdate(null);
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
            message={`OpenACP Core ${info().latest} available`}
            loading={coreUpdating()}
            onUpdate={updateCore}
            onDismiss={() => setCoreUpdate(null)}
          />
        )}
      </Show>
      <Show when={appUpdateAvailable()}>
        <Toast
          message="OpenACP App update available"
          loading={appUpdating()}
          onUpdate={updateApp}
          onDismiss={() => setAppUpdateAvailable(false)}
        />
      </Show>
    </div>
  );
}

function Toast(props: {
  message: string;
  loading: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  return (
    <div class="pointer-events-auto flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 shadow-lg">
      <span class="text-sm text-neutral-200">{props.message}</span>
      <button
        onClick={props.onUpdate}
        disabled={props.loading}
        class="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {props.loading ? 'Updating...' : 'Update'}
      </button>
      <button
        onClick={props.onDismiss}
        class="text-neutral-500 hover:text-neutral-300"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /path/to/OpenACP-App
git add src/onboarding/update-toast.tsx
git commit -m "feat(onboarding): add UpdateToasts component for Core and App updates"
```

---

## Task 10: Wire startup flow in `main.tsx`

**Files:**
- Modify: `OpenACP-App/src/main.tsx`

- [ ] **Step 1: Read current `main.tsx` to understand exact import and render structure**

```bash
cat OpenACP-App/src/main.tsx
```

- [ ] **Step 2: Add onboarding imports and `createSignal` to `main.tsx`**

In `OpenACP-App/src/main.tsx`:

1. Change the `solid-js` import to include `createSignal`:
```typescript
// Before:
import { createResource, onCleanup, onMount, Show } from "solid-js"
// After:
import { createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
```

2. Add onboarding imports after the existing imports (before `import pkg from "../package.json"`):
```typescript
import { SplashScreen } from "./onboarding/splash-screen"
import { InstallScreen } from "./onboarding/install-screen"
import { SetupWizard } from "./onboarding/setup-wizard"
import { UpdateToasts } from "./onboarding/update-toast"
import { determineStartupScreen, type StartupScreen } from "./onboarding/startup"
```

- [ ] **Step 3: Wrap the render call with startup state machine**

The current `render(() => { ... }, root!)` call has all platform setup at the top and the JSX return at the bottom. Modify it to:

1. Add a `screen` signal at the very top of the render callback (before `createPlatform()`):

```typescript
render(() => {
  const [screen, setScreen] = createSignal<StartupScreen>('splash')

  // Run startup checks on mount — must use onMount, not async IIFE,
  // to stay within the SolidJS reactive context
  onMount(async () => {
    const { invoke } = await import("@tauri-apps/api/core")
    const [installedResult, configResult] = await Promise.all([
      invoke<string | null>('check_openacp_installed').catch(() => null),
      invoke<boolean>('check_openacp_config').catch(() => false),
    ])
    setScreen(determineStartupScreen({
      installed: installedResult !== null,
      configExists: Boolean(configResult),
    }))
  })

  const platform = createPlatform()
  // ... all existing setup code stays exactly as-is (createResource calls, etc.) ...
```

2. Replace the final `return (...)` block (currently `return (<PlatformProvider ...>...</PlatformProvider>)`) with:

```typescript
  return (
    <>
      <Show when={screen() === 'splash'}>
        <SplashScreen />
      </Show>

      <Show when={screen() === 'install'}>
        <InstallScreen
          onSuccess={(configExists) => setScreen(configExists ? 'ready' : 'setup')}
        />
      </Show>

      <Show when={screen() === 'setup'}>
        <SetupWizard onSuccess={() => setScreen('ready')} />
      </Show>

      <Show when={screen() === 'ready'}>
        <PlatformProvider value={platform}>
          <AppBaseProviders locale={locale.latest}>
            <Show when={!defaultServer.loading && !sidecar.loading && !locale.loading}>
              {(_) => (
                <AppInterface
                  defaultServer={defaultServer.latest ?? ServerConnection.Key.make("sidecar")}
                  servers={servers()}
                >
                  <Inner />
                </AppInterface>
              )}
            </Show>
          </AppBaseProviders>
        </PlatformProvider>
        <UpdateToasts />
      </Show>
    </>
  )
}, root!)
```

> **Note:** All existing code between `const platform = createPlatform()` and the return stays unchanged. Only the signal, `onMount`, and the return JSX are new/modified.

- [ ] **Step 4: Run the app and verify the startup flow**

```bash
cd /path/to/OpenACP-App && pnpm tauri dev
```

Expected flow:
1. Splash screen shows briefly while checks run
2. If openacp not installed → Install screen appears
3. If installed but no config → Setup wizard appears
4. If both present → Main app appears directly
5. UpdateToasts appear in the bottom-right corner after main app loads

- [ ] **Step 5: Commit**

```bash
cd /path/to/OpenACP-App
git add src/main.tsx
git commit -m "feat(onboarding): wire startup flow — splash, install, setup, ready screens"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Splash screen on startup | Task 6, Task 10 |
| Auto-detect openacp via `openacp --version` | Task 3 |
| Auto-run install script (no prompt) | Task 4, Task 7 |
| Stream install output to UI | Task 4, Task 7 |
| Error state with Copy command + Retry | Task 7 |
| Config existence check | Task 3 |
| Setup wizard: workspace folder picker | Task 8 |
| Setup wizard: agent list from `openacp agents list --json` | Task 1, Task 8 |
| Setup wizard: inline agent install | Task 4 (helper commands), Task 8 |
| Setup wizard: calls `openacp setup --global ...` | Task 2, Task 4, Task 8 |
| Update check: Core (npm registry) | Task 3 |
| Update check: App (Tauri updater) | Task 9 |
| Update toast: distinguishes Core vs App | Task 9 |
| Non-blocking toast | Task 9 |

**No placeholders:** All steps contain actual code. ✓

**Type consistency:**
- `StartupScreen` defined in Task 5, used in Task 10 ✓
- `CoreUpdateInfo` struct defined in Task 3, returned from `check_core_update` used in Task 9 ✓
- `AgentEntry` interface defined in Task 8, populated from `run_openacp_agents_list` (Task 8, Step 2) ✓
- Tauri command names consistent: `check_openacp_installed`, `check_openacp_config`, `check_core_update`, `run_install_script`, `run_openacp_setup`, `run_openacp_agents_list`, `run_openacp_agent_install` ✓
