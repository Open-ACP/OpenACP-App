# UUID-Centric Workspace Identity — Implementation Plan (App)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all path-as-identity patterns from the App — workspace identity is UUID throughout, directory is only used as a filesystem pointer for CLI operations.

**Architecture:** After the companion core plan ships, `openacp setup --json` returns `{ id, name, directory, configPath }` and `instances create` is idempotent. The App removes `instances list + path comparison`, the `'main'` fallback, and the filesystem fallback in `resolveServer`. Rust `WorkspaceStatus` gains `instance_id` from `config.json` to support the `registerWorkspace` fallback. Tilde expansion is added to all Rust commands that accept a directory string.

**Tech Stack:** TypeScript + React (Tauri frontend), Rust (Tauri backend). No test framework is configured.

**Dependency:** The companion core plan (`OpenACP/docs/superpowers/plans/2026-04-10-uuid-centric-instance-identity.md`) must be implemented first, or at least `cmdSetup --json` must return `{ id, name, directory, configPath }` before this plan's `setup-wizard.tsx` change takes full effect. The safety-net fallback (`instances create`) works independently.

---

## Files Changed

| File | Change |
|---|---|
| `src-tauri/src/core/sidecar/commands.rs` | Add `expand_tilde` helper; apply to all directory-accepting commands; add `instance_id` to `WorkspaceStatus` |
| `src/openacp/api/workspace-service.ts` | Add `instance_id: string \| null` to `WorkspaceStatus` interface; replace `registerWorkspace` path-match fallback with `get_workspace_status` |
| `src/openacp/context/workspace.tsx` | Remove `directory` param from `resolveWorkspaceServer`; remove `from_dir` fallback |
| `src/openacp/hooks/use-workspace-connection.ts` | Remove filesystem fallback from `resolveServer`; update `resolveWorkspaceServer` call |
| `src/onboarding/setup-wizard.tsx` | Parse UUID directly from `run_openacp_setup` output; remove path comparison and `'main'` fallback |

---

## Task 1: Rust — `expand_tilde` + `instance_id` in `WorkspaceStatus`

**Files:**
- Modify: `src-tauri/src/core/sidecar/commands.rs`

Two related Rust changes in one task: (1) add tilde expansion to all directory-accepting commands so `~/foo` paths work correctly, (2) add `instance_id` to `WorkspaceStatus` read from `config.json`.

- [ ] **Step 1: Add `expand_tilde` helper and apply it**

In `src-tauri/src/core/sidecar/commands.rs`, add the helper function after the imports section (before `read_instances_json`):

```rust
/// Expand a leading `~/` to the user's home directory.
/// PathBuf::from("~/foo") does NOT expand tilde — must do it explicitly.
fn expand_tilde(path: &str) -> std::path::PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    std::path::PathBuf::from(path)
}
```

Then update `get_workspace_server_info_from_dir` to use it. Change:
```rust
    let dir = std::path::PathBuf::from(&directory).join(".openacp");
```
to:
```rust
    let dir = expand_tilde(&directory).join(".openacp");
```

Update `check_workspace_server_alive` to use it. Change:
```rust
    let pid_path = std::path::PathBuf::from(&directory).join(".openacp").join("openacp.pid");
```
to:
```rust
    let pid_path = expand_tilde(&directory).join(".openacp").join("openacp.pid");
```

Update `get_workspace_status` to use it. Change:
```rust
    let openacp_dir = std::path::PathBuf::from(&directory).join(".openacp");
```
to:
```rust
    let openacp_dir = expand_tilde(&directory).join(".openacp");
```

- [ ] **Step 2: Add `instance_id` to `WorkspaceStatus`**

Find the `WorkspaceStatus` struct definition:
```rust
#[derive(Clone, serde::Serialize)]
pub struct WorkspaceStatus {
    pub has_config: bool,
    pub has_pid: bool,
    pub server_alive: bool,
    pub port: Option<u16>,
    pub instance_name: Option<String>,
}
```

Replace with:
```rust
#[derive(Clone, serde::Serialize)]
pub struct WorkspaceStatus {
    pub has_config: bool,
    pub has_pid: bool,
    pub server_alive: bool,
    pub port: Option<u16>,
    pub instance_name: Option<String>,
    pub instance_id: Option<String>,   // UUID from config.json "id" field
}
```

In `get_workspace_status`, find the line that reads `instance_name`:
```rust
    let instance_name = std::fs::read_to_string(openacp_dir.join("config.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("instanceName")?.as_str().map(String::from));
```

Replace with (reads both fields from one parse):
```rust
    let config_value = std::fs::read_to_string(openacp_dir.join("config.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());

    let instance_name = config_value
        .as_ref()
        .and_then(|v| v.get("instanceName")?.as_str().map(String::from));

    let instance_id = config_value
        .as_ref()
        .and_then(|v| v.get("id")?.as_str().map(String::from));
```

And in the `Ok(WorkspaceStatus { ... })` return at the end, add `instance_id`:
```rust
    Ok(WorkspaceStatus {
        has_config,
        has_pid,
        server_alive,
        port,
        instance_name,
        instance_id,
    })
```

- [ ] **Step 3: Build Rust**

```bash
pnpm tauri build --debug 2>&1 | tail -20
```
Or just:
```bash
cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -30
```
Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/core/sidecar/commands.rs
git commit -m "feat(rust): expand_tilde in directory commands; add instance_id to WorkspaceStatus"
```

---

## Task 2: TypeScript — `WorkspaceStatus` interface + `registerWorkspace` fallback

**Files:**
- Modify: `src/openacp/api/workspace-service.ts:15-21` (interface) and `src/openacp/api/workspace-service.ts:118-136` (registerWorkspace fallback)

- [ ] **Step 1: Add `instance_id` to the TypeScript interface**

In `src/openacp/api/workspace-service.ts`, update `WorkspaceStatus`:
```typescript
export interface WorkspaceStatus {
  has_config: boolean
  has_pid: boolean
  server_alive: boolean
  port: number | null
  instance_name: string | null
  instance_id: string | null   // UUID from config.json "id" field (requires core plan shipped)
}
```

- [ ] **Step 2: Replace `registerWorkspace` path-match fallback**

Find the `registerWorkspace` function and replace its fallback block. The current fallback is:
```typescript
  } catch (cliErr) {
    // Fallback: maybe it's already registered but CLI reported differently
    try {
      const instances = await listWorkspaces()
      const match = instances.find(i => i.directory === directory)
      if (match) {
        return { id: match.id, name: match.name ?? match.id, directory: match.directory, type: 'local' }
      }
    } catch { /* fallback also failed */ }
    ...
```

Replace with:
```typescript
  } catch (cliErr) {
    // Fallback: read instance_id directly from config.json via get_workspace_status.
    // Works even when CLI is unavailable or reports the instance as already existing.
    // Path matching is intentionally avoided — config.json is the source of truth for id.
    try {
      const status = await invoke<WorkspaceStatus>('get_workspace_status', { directory })
      if (status.instance_id) {
        const dirBasename = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
        return {
          id: status.instance_id,
          name: status.instance_name ?? dirBasename(directory),
          directory,
          type: 'local',
        }
      }
    } catch { /* fallback also failed */ }

    if (cliErr instanceof WorkspaceServiceError) throw cliErr
    throw new WorkspaceServiceError(
      `Failed to register workspace at ${directory}: ${cliErr}`,
      'CLI_FAILED',
      cliErr,
    )
  }
```

- [ ] **Step 3: Build TypeScript**

```bash
pnpm build
```
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/api/workspace-service.ts
git commit -m "feat: WorkspaceStatus gets instance_id; registerWorkspace fallback reads config.json"
```

---

## Task 3: `resolveWorkspaceServer` — UUID-only, remove directory param

**Files:**
- Modify: `src/openacp/context/workspace.tsx:24-38`

- [ ] **Step 1: Simplify `resolveWorkspaceServer`**

In `src/openacp/context/workspace.tsx`, replace the full `resolveWorkspaceServer` function:

```typescript
/**
 * Resolve workspace server info by instance UUID.
 * Reads api.port + api-secret from the instance root via instances.json.
 */
export async function resolveWorkspaceServer(instanceId: string): Promise<ServerInfo | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<ServerInfo>('get_workspace_server_info', { instanceId })
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```
Expected: TypeScript error at the call site in `use-workspace-connection.ts` — it currently passes `workspace.directory` as second argument. This is expected and will be fixed in Task 4.

- [ ] **Step 3: Commit (with build error — Task 4 will fix it)**

Actually, do NOT commit yet — wait for Task 4 to fix the call site first so the build is clean.

---

## Task 4: `use-workspace-connection.ts` — remove filesystem fallback

**Files:**
- Modify: `src/openacp/hooks/use-workspace-connection.ts:86-111`

- [ ] **Step 1: Simplify `resolveServer`**

In `src/openacp/hooks/use-workspace-connection.ts`, replace the entire `resolveServer` function:

```typescript
async function resolveServer(workspace: WorkspaceEntry): Promise<ServerInfo> {
  if (workspace.type === 'remote') {
    const jwt = await getKeychainToken(workspace.id)
    if (!jwt) throw new Error('No token found for remote workspace — re-authenticate')
    return { url: workspace.host ?? '', token: jwt }
  }

  // Local: UUID → instances.json → read api.port + api-secret
  const info = await resolveWorkspaceServer(workspace.id)
  if (info) return info

  throw new Error(`Cannot resolve server for "${workspace.name || workspace.id}" — is the server running?`)
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```
Expected: no TypeScript errors now that the call matches the new signature from Task 3.

- [ ] **Step 3: Commit both Task 3 and Task 4 together**

```bash
git add src/openacp/context/workspace.tsx src/openacp/hooks/use-workspace-connection.ts
git commit -m "feat: resolveWorkspaceServer UUID-only; resolveServer removes filesystem fallback"
```

---

## Task 5: `setup-wizard.tsx` — parse UUID directly from setup output

**Files:**
- Modify: `src/onboarding/setup-wizard.tsx` (the `runSetup` async function)

Remove the three-step `instances create → instances list → path comparison → 'main' fallback` chain. Parse UUID directly from `run_openacp_setup` JSON output.

- [ ] **Step 1: Replace the `runSetup` body**

In `src/onboarding/setup-wizard.tsx`, replace the entire `runSetup` async function body (from `setSetupStatus('running')` through the final `setTimeout` line):

```typescript
  const runSetup = async () => {
    setSetupStatus('running')
    setSetupLog([])
    const unlisten = await listen<string>('setup-output', (event) => setSetupLog((prev) => [...prev, event.payload]))
    try {
      const jsonStr = await invoke<string>('run_openacp_setup', { workspace, agent: selectedAgent })
      setSetupStatus('starting')

      // Node.js 'path' is not available in browser/Tauri frontend — use inline basename
      const dirBasename = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p

      // Parse UUID directly from setup output. After core fix, setup returns:
      // { success: true, data: { id, name, directory, configPath } }
      let instanceData: { id: string; name: string; directory: string } | null = null
      try {
        const parsed = JSON.parse(jsonStr)
        const data = parsed?.data ?? parsed
        if (data?.id) {
          const dir = data.directory ?? workspace
          instanceData = {
            id: data.id,
            name: data.name ?? dirBasename(dir) ?? data.id,
            directory: dir,
          }
        }
      } catch { /* ignored */ }

      // Safety net: if setup output has no id (older CLI version without core fix),
      // call instances create — now idempotent, always returns UUID for new or existing instances
      if (!instanceData?.id) {
        try {
          const createStr = await invoke<string>('invoke_cli', {
            args: ['instances', 'create', '--dir', workspace, '--no-interactive', '--json'],
          })
          const createParsed = JSON.parse(createStr)
          const data = createParsed?.data ?? createParsed
          if (data?.id) {
            const dir = data.directory ?? workspace
            instanceData = { id: data.id, name: data.name ?? dirBasename(dir) ?? data.id, directory: dir }
          }
        } catch { /* ignored */ }
      }

      if (!instanceData?.id) {
        throw new Error('Setup failed: could not determine instance ID. Try running setup again.')
      }

      // Start server
      try {
        await invoke<string>('invoke_cli', { args: ['start', '--dir', workspace] })
      } catch (startErr) {
        if (!String(startErr).toLowerCase().includes('already running')) throw startErr
      }

      const entry: WorkspaceEntry = {
        id: instanceData.id,
        name: instanceData.name,
        directory: instanceData.directory,  // expanded path from CLI, not raw tilde input
        type: 'local',
      }
      setSetupStatus('success')
      setTimeout(() => props.onSuccess(entry), 800)
    } catch (err) {
      setSetupStatus('error')
      setSetupError(String(err))
    } finally {
      unlisten()
    }
  }
```

- [ ] **Step 2: Build**

```bash
pnpm build
```
Expected: no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Run the app in dev mode and go through the setup wizard with a test workspace path (including a tilde path like `~/test-workspace`). Verify:
1. Setup completes without the `'main'` fallback
2. The workspace appears in the sidebar with its correct name (directory basename)
3. The workspace connects to the server successfully
4. Check the App's workspace store — the entry has a real UUID, not `'main'`

```bash
pnpm tauri dev
```

- [ ] **Step 4: Commit**

```bash
git add src/onboarding/setup-wizard.tsx
git commit -m "fix: setup-wizard parses UUID from setup output; removes path comparison and 'main' fallback"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full TypeScript build**

```bash
pnpm build
```
Expected: no errors.

- [ ] **Step 2: Check no remaining path-as-identity patterns**

```bash
grep -rn "i\.directory === " src/openacp/ src/onboarding/ || echo "none found"
grep -rn "'main'" src/openacp/ src/onboarding/ || echo "none found"
grep -rn "get_workspace_server_info_from_dir" src/openacp/ src/onboarding/ || echo "none found"
```

Expected:
- `i.directory ===` appears only in `workspace-service.ts classifyDirectory` (acceptable — used for filesystem classification in add-workspace UI, not identity)
- `'main'` should not appear in identity-related code
- `get_workspace_server_info_from_dir` should not appear in `openacp/` or `onboarding/`

- [ ] **Step 3: Final commit if any loose ends**

```bash
git status
```
If all clean, the implementation is complete.
