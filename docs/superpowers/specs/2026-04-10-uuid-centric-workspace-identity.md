# UUID-Centric Workspace Identity — Design Spec (App)

**Date:** 2026-04-10
**Status:** Draft
**Scope:** OpenACP-App — workspace identity based on UUID throughout, path used only for CLI/filesystem ops
**Companion spec:** `OpenACP/docs/superpowers/specs/2026-04-10-uuid-centric-instance-identity.md`

## Problem

The App currently uses directory path as a secondary identity mechanism in three places:

1. **`setup-wizard.tsx`** — `instances list` + `i.directory === workspace` comparison to discover
   UUID after setup. When comparison fails (tilde path vs expanded path), falls back to hardcoded
   `id: 'main'` — a concept that no longer exists in the CLI.

2. **`workspace-service.ts registerWorkspace()`** — fallback uses `instances.find(i => i.directory === directory)` when `instances create` fails.

3. **`use-workspace-connection.ts resolveServer()`** — when UUID lookup fails, falls back to
   `get_workspace_server_info_from_dir(directory)` — treating path as an alternate identity method.

These patterns are wrong: path is mutable and non-unique (especially for remote workspaces), while
UUID is the stable, immutable identity. The hardcoded `'main'` fallback is a vestige of the old
"global instance" concept which no longer exists.

## Solution

After `OpenACP/docs/superpowers/specs/2026-04-10-uuid-centric-instance-identity.md` is implemented:
- `openacp setup --json` returns `{ id, name, directory, configPath }`
- `openacp instances create --dir <path> --json` is idempotent (returns UUID for existing instances)
- `<workspace>/.openacp/config.json` contains an `id` field

The App can rely on these guarantees to remove all path-as-identity patterns.

---

## Design

### 1. `setup-wizard.tsx` — parse UUID from setup output directly

**File:** `src/onboarding/setup-wizard.tsx`

Remove the `instances list + path comparison` block. Parse UUID from `run_openacp_setup` output:

```typescript
// run_openacp_setup runs `openacp setup --dir <workspace> --agent <agent> --json`
// After core fix, this returns: { id, name, directory, configPath }
const jsonStr = await invoke<string>('run_openacp_setup', { workspace, agent: selectedAgent })
setSetupStatus('starting')

// Node.js 'path' is not available in the browser/Tauri frontend — use inline basename
const dirBasename = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p

let instanceData: { id: string; name: string; directory: string } | null = null
try {
  const parsed = JSON.parse(jsonStr)
  const data = parsed?.data ?? parsed
  if (data?.id) {
    const dir = data.directory ?? workspace
    instanceData = {
      id: data.id,
      // name fallback chain: CLI name → dirname of directory → id (last resort)
      name: data.name ?? dirBasename(dir) ?? data.id,
      directory: dir,
    }
  }
} catch { /* ignored */ }

// Safety net: if setup didn't return id (shouldn't happen after core fix),
// call instances create — now idempotent, always returns UUID
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
```

**Removed:** `instances create` as primary UUID source, `instances list + path comparison`,
`id: 'main'` fallback.

### 2. `workspace-service.ts registerWorkspace()` — config.json fallback

**File:** `src/openacp/api/workspace-service.ts`

Since `instances create` is now idempotent, the `instances list + path match` fallback is replaced
with a direct config.json read. This works because config.json now carries the `id` field.

```typescript
export async function registerWorkspace(directory: string): Promise<WorkspaceEntry> {
  // Primary: instances create is idempotent — returns UUID for new and existing instances
  try {
    const stdout = await invokeCli(['instances', 'create', '--dir', directory, '--no-interactive', '--json'])
    const data = parseCliJson(stdout)
    return {
      id: data.id,
      name: data.name ?? data.id,
      directory: data.directory ?? directory,
      type: 'local',
    }
  } catch (cliErr) {
    // Fallback: read id from config.json directly (no path matching)
    // Works even when CLI is unavailable
    try {
      const status = await invoke<WorkspaceStatus>('get_workspace_status', { directory })
      if (status.instance_id) {
        return {
          id: status.instance_id,
          name: status.instance_name ?? status.instance_id,
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
}
```

### 3. `context/workspace.tsx` — UUID-only server resolution

**File:** `src/openacp/context/workspace.tsx`

Remove `directory` parameter and `get_workspace_server_info_from_dir` fallback.
Server info is resolved by UUID via `instances.json` only.

```typescript
// Before: resolveWorkspaceServer(instanceId: string, directory?: string)
// After:
export async function resolveWorkspaceServer(instanceId: string): Promise<ServerInfo | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<ServerInfo>('get_workspace_server_info', { instanceId })
  } catch {
    return null
  }
}
```

If `instances.json` doesn't have the UUID, the server is either not running or not registered.
The retry loop in `useWorkspaceConnection` handles the "not running yet" case; the repair screen
handles the "not registered" case.

### 4. `use-workspace-connection.ts` — UUID-only `resolveServer`

**File:** `src/openacp/hooks/use-workspace-connection.ts`

Remove the filesystem fallback block from `resolveServer`. If UUID lookup returns null, the server
is not reachable — throw so the retry loop handles it:

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

Update the call site (line 95) to match new signature: `resolveWorkspaceServer(workspace.id)`.

### 5. Rust `commands.rs` — tilde expansion + `id` in `WorkspaceStatus`

**File:** `src-tauri/src/core/sidecar/commands.rs`

**Change 1: tilde expansion helper** — applied to all functions that accept `directory: String`
from the frontend (`get_workspace_server_info_from_dir`, `check_workspace_server_alive`,
`get_workspace_status`):

```rust
fn expand_tilde(path: &str) -> std::path::PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    std::path::PathBuf::from(path)
}
```

**Change 2: add `instance_id` to `WorkspaceStatus`** — read from `config.json`:

```rust
#[derive(Clone, serde::Serialize)]
pub struct WorkspaceStatus {
    pub has_config: bool,
    pub has_pid: bool,
    pub server_alive: bool,
    pub port: Option<u16>,
    pub instance_name: Option<String>,
    pub instance_id: Option<String>,   // ← add: read from config.json "id" field
}
```

```rust
// In get_workspace_status, when reading config.json:
let instance_id = config_value.get("id")?.as_str().map(String::from);
```

**Why keep `get_workspace_server_info_from_dir`?**
It remains available for utility use (e.g., initial workspace discovery, repair flows). It is
no longer in the main connection path — `resolveServer` uses UUID only.

### 6. `workspace-service.ts` — add `instance_id` to TypeScript `WorkspaceStatus`

**File:** `src/openacp/api/workspace-service.ts`

The Rust `WorkspaceStatus` struct gains `instance_id: Option<String>` (section 5). The TypeScript
interface must mirror it:

```typescript
export interface WorkspaceStatus {
  has_config: boolean
  has_pid: boolean
  server_alive: boolean
  port: number | null
  instance_name: string | null
  instance_id: string | null   // ← add: UUID from config.json "id" field
}
```

Without this field, the `registerWorkspace` fallback in section 2 cannot read `status.instance_id`.

---

## Files Changed

| File | Change |
|---|---|
| `src/onboarding/setup-wizard.tsx` | Parse UUID from setup output; remove path comparison and `'main'` fallback |
| `src/openacp/api/workspace-service.ts` | `registerWorkspace` fallback reads `instance_id` from `get_workspace_status`; add `instance_id` to `WorkspaceStatus` interface |
| `src/openacp/context/workspace.tsx` | `resolveWorkspaceServer` signature: remove `directory` param, remove `from_dir` fallback |
| `src/openacp/hooks/use-workspace-connection.ts` | `resolveServer` removes filesystem fallback; update `resolveWorkspaceServer` call |
| `src-tauri/src/core/sidecar/commands.rs` | Add `expand_tilde` helper; add `instance_id` to `WorkspaceStatus`; apply tilde expansion in directory-accepting commands |

## Invariants After This Change

- **UUID is the only identity mechanism** — workspace lookup, server resolution, keychain, API
  client all use `WorkspaceEntry.id`
- **`directory` is a filesystem pointer** — used for CLI `--dir` args, git ops, display. Never
  used to find or distinguish workspaces.
- **Path comparison is eliminated** from all identity/lookup paths
- **Remote workspaces** continue to work as-is — already UUID + keychain JWT based
