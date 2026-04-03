# Design: Onboarding, Install & Update Flow

**Date:** 2026-04-02
**Scope:** OpenACP Desktop App (`@openacp/desktop`) + CLI (`@openacp/cli`)

---

## Overview

When the app opens for the first time (or when the openacp CLI is not installed), the app automatically detects it, installs it via a shell script, and guides the user through a short setup wizard. After setup, every app launch triggers a background update check and shows a non-blocking toast if a new version is available — clearly distinguishing Core updates from App updates.

---

## 1. Startup Flow

```
App launches
    │
    ▼
[Splash Screen] — logo + loading animation (masks check latency)
    │
    ├── Tauri backend: run `openacp --version`
    │
    ▼
Is openacp installed?
    │
    ├── NO → [Install Screen]
    │           → detect OS, run install script:
    │               macOS/Linux: curl -fsSL <install.sh> | bash
    │               Windows:     powershell -c "irm <install.ps1> | iex"
    │           → stream stdout/stderr to UI in real time
    │           → on success → check config
    │           → on failure → show error + "Copy command" button for manual install
    │
    └── YES → does `~/.openacp/config.json` exist?
                │
                ├── NO  → [Setup Wizard]
                └── YES → [Main App] → background update check
```

---

## 2. Install Screen

- Shows logo + terminal-style streaming log
- Streams real-time output from install script via `tauri-plugin-shell`
- On success, automatically continues — no user action needed
- On failure:
  - Shows clear error message
  - **Copy command** button — copies the install command to clipboard
  - **Retry** button

---

## 3. Setup Wizard

Two-step wizard with a step indicator at the top.

### Step 1 — Workspace & Agent

**Workspace:**
- Text input + **Browse** button → opens native folder picker (`tauri-plugin-dialog`)
- Validates path exists; if not → warning + option to create it

**Agent:**
- Calls `openacp agents list --json` → parses JSON → renders list
- Installed agents: checkbox to select
- Not-installed agents: **Install** button → runs `openacp agents install <name>` inline with progress indicator
- At least one agent must be selected to proceed
- If `agents list` fails → shows error + retry button

### Step 2 — Confirm & Setup

- Summary: selected workspace path and agent(s)
- Platform: `app` (SSE) by default — not shown to user, keeps the flow simple
- **Complete Setup** button → calls CLI:

```bash
openacp setup \
  --global \
  --workspace /path/to/dir \
  --agent claude-code \
  --run-mode daemon \
  --json
```

- Streams output to UI
- On success → dismisses wizard → enters Main App
- On failure → shows inline error, stays in wizard

---

## 4. Update Check

Runs in the background after entering Main App, once per session.

**Two sources checked in parallel:**

| Type | Source | Comparison |
|------|--------|------------|
| Core | `https://registry.npmjs.org/@openacp/cli/latest` | npm `version` vs `openacp --version` |
| App  | Tauri built-in updater (`tauri-plugin-updater`) | automatic |

**If update available → non-blocking toast (corner of screen):**

```
┌────────────────────────────────────────────────────────┐
│ OpenACP Core v2026.402.0 available            [Update] │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ OpenACP App v1.2.0 available                  [Update] │
└────────────────────────────────────────────────────────┘
```

- **Core update** → re-runs install script (same logic as first install), shows progress modal
- **App update** → uses Tauri updater
- Toast can be dismissed, does not auto-dismiss
- Checked once per app launch, not re-checked within the same session

---

## 5. CLI Changes Required

### 5.1 New command: `openacp setup`

Non-interactive setup — all params via flags:

```bash
openacp setup \
  --global \
  --workspace <path> \
  --agent <agent-key>     # comma-separated for multiple
  --run-mode <daemon|foreground>
  --json                  # output JSON result
```

- Writes config to the instance root (use `--global` for global config)
- Exit code 0 = success, non-zero = error (stderr + JSON error if `--json` flag present)
- Written to `OpenACP/src/cli/commands/setup.ts`, exported from `commands/index.ts`, registered in `cli.ts` as an instance command

### 5.2 `--json` flag on existing commands

| Command | JSON output shape |
|---------|-------------------|
| `openacp agents list --json` | `Array<{ key, name, version, distribution, description, installed, available, missingDeps }>` |
| `openacp status --json` | `{ running: bool, version: string, pid?: number }` *(future, not MVP)* |

---

## 6. Edge Cases

| Scenario | Handling |
|----------|----------|
| curl/powershell not available | Install script handles its own dependencies; if script fails → show stderr + Copy command |
| Install script fails | Show stderr output + Copy command button + Retry |
| Workspace path does not exist | Warning + option to create directory |
| No agents installed on system | Empty state with install prompt |
| Agent install fails in wizard | Inline error; can still proceed if another agent is selected |
| `openacp setup` CLI fails | Inline error in wizard, stays on Step 2 |
| No internet during update check | Silent fail, no toast shown |
| Both Core and App have updates | Show two separate toasts |
| User re-opens app after setup | Skips wizard, goes directly to Main App |
| `~/.openacp/config.json` exists but is invalid | Treated as "configured" — openacp itself will report the error on start |

---

## 7. Components to Create / Modify (App)

**New — Frontend:**
- `src/onboarding/splash-screen.tsx` — startup loading screen
- `src/onboarding/install-screen.tsx` — install CLI with streaming log
- `src/onboarding/setup-wizard.tsx` — 2-step wizard (workspace + agent → confirm)
- `src/onboarding/update-toast.tsx` — Core vs App update toast
- `src/onboarding/startup.ts` — startup state machine (pure logic, testable)

**New — Rust:**
- `src-tauri/src/onboarding.rs` — Tauri commands: `check_openacp_installed`, `check_openacp_config`, `run_install_script`, `run_openacp_setup`, `check_core_update`

**Modified:**
- `src-tauri/src/lib.rs` — add `mod onboarding`, register new commands in `invoke_handler`
- `src/main.tsx` — add startup check + render onboarding screens before main UI

**New — CLI:**
- `OpenACP/src/cli/commands/setup.ts` — non-interactive setup command

**Modified — CLI:**
- `OpenACP/src/cli/commands/agents.ts` — add `--json` flag to `agents list`
- `OpenACP/src/cli/commands/index.ts` — export `cmdSetup`
- `OpenACP/src/cli.ts` — register `setup` in instance commands
