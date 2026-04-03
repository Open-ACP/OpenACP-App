# Spec: Add Workspace Feature

**Date:** 2026-04-02
**Status:** Draft
**Related specs:**
- [Core Spec: Instances CLI & Auth Codes](../../../OpenACP/docs/superpowers/specs/2026-04-02-instances-cli-and-auth-codes-design.md)
- [Core Spec: App Connectivity](../../../OpenACP/docs/superpowers/specs/2026-03-31-app-connectivity-design.md)
- [Core Spec: Auth System](../../../OpenACP/docs/superpowers/specs/2026-03-31-auth-system-design.md)

## Overview

Add a full-screen modal for adding new workspaces to the OpenACP desktop app. Supports two workspace types: **Local** (same machine, discovered via CLI) and **Remote** (via `openacp remote` link with code-exchange auth). Migrate workspace store to use instance `id` as the primary key and store complete workspace metadata. Replace direct filesystem reads in the Tauri backend with CLI invocations.

---

## 1. Workspace Store Migration

### Current State

`workspace-store.ts` and `app.tsx` track instance IDs as a flat array. The Tauri `discover_workspaces()` command in `lib.rs` reads `~/.openacp/instances.json` directly from the filesystem.

### New WorkspaceEntry Schema

All workspaces (local and remote) are stored with full metadata. The `id` field is the immutable primary key — it identifies the workspace regardless of how connection details change.

```typescript
interface WorkspaceEntry {
  id: string            // instance id — primary key, immutable
  name: string          // display name (refreshed on connect, can change)
  directory: string     // absolute path to project folder (parent of .openacp)
                        // for remote: server-side path, display only
  type: 'local' | 'remote'

  // Remote only
  host?: string         // current tunnel/remote host URL — mutable, updated on reconnect
  tokenId?: string      // JWT token id (for reference/revocation)
  role?: string         // token role
  expiresAt?: string    // JWT expiry (ISO 8601)
  refreshDeadline?: string  // JWT refresh deadline (ISO 8601)
}
```

`host` is mutable by design: the same remote workspace reconnects with a new tunnel URL each time `openacp remote` is run. The `id` is the stable identity, `host` is just the current connection detail.

### Storage

Persisted via Tauri Store plugin (localStorage fallback) as `WorkspaceEntry[]` under key `workspaces`. Indexed by `id` in memory for O(1) lookup.

### Tauri Backend: Replace `discover_workspaces()`

Remove `discover_workspaces()` from `lib.rs`. Replace with a generic `invoke_cli` Tauri command that runs the OpenACP sidecar with given arguments and returns stdout as a string.

```rust
// lib.rs
#[tauri::command]
async fn invoke_cli(args: Vec<String>, app: AppHandle) -> Result<String, String> {
    // Uses the same sidecar pattern as the existing start_server() command
    let sidecar = app.shell().sidecar("openacp").map_err(|e| e.to_string())?;
    let output = sidecar.args(args).output().await.map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
```

```typescript
// Frontend usage
const stdout = await invoke<string>('invoke_cli', { args: ['instances', 'list', '--json'] })
const instances: InstanceListEntry[] = JSON.parse(stdout)
```

All CLI interactions (list, create) go through `invoke_cli`. No more direct file reads for instance data in the Tauri backend.

**Path handling:** `~/` expansion and path resolution must happen on the Rust/OS side. When passing directory paths from the frontend to CLI commands, always use the absolute path obtained from Tauri's `open()` dialog (which already returns absolute paths) — never pass raw user-typed strings with `~/` to the CLI.

---

## 2. Add Workspace Modal

### Trigger

Button "+" on the sidebar rail → opens full-screen modal overlay.

The existing onboarding flow is unchanged — it always runs on first launch and sets up the main local workspace. The Add Workspace modal is exclusively for adding additional workspaces after initial setup.

### Layout

Full-screen modal with two tabs: **Local** and **Remote**.

---

### Tab: Local

#### Section A — Known Instances

On tab open, call `openacp instances list --json` via `invoke_cli`. Display results in a list:

```
Known Instances
─────────────────────────────────────────
● Main          /Users/user             :21420
○ My Project    /Users/user/my-project  —
```

- `●` green = running, `○` grey = stopped
- Click a row → add that workspace to store (if not already added)
- Already-added workspaces: show checkmark, row is not clickable

#### Section B — Browse Folder

"Browse for a folder..." button → Tauri `open()` folder picker → returns absolute path.

**Duplicate check:** Compare the selected path against the `directory` field of all entries from `instances list --json`. Comparison is always between absolute paths (the picker already returns absolute; no `~/` expansion needed).

**Cases after folder selection:**

1. **Path matches `directory` of a known instance** — offer to add it (equivalent to clicking in Section A).

2. **Path contains `.openacp/config.json` but is not in `instances list`** — offer "Register this existing instance":
   - Call `openacp instances create --dir <path> --no-interactive --json`
   - Parse JSON response → add `WorkspaceEntry` to store

3. **Path has no `.openacp/`** — show creation sub-screen with two options:
   - **Clone from existing** — dropdown showing current instances → call:
     ```
     openacp instances create --dir <path> --from <selectedInstanceDir> --name <name> --json
     ```
   - **Create new** — input: instance name + agent picker → call:
     ```
     openacp instances create --dir <path> --name <name> --agent <agentName> --no-interactive --json
     ```

   In both cases: parse `--json` response → `id` is the new workspace's primary key → add `WorkspaceEntry` to store.

---

### Tab: Remote

#### Input

Single input field: "Paste `openacp://` link or URL"

Accepted formats (all generated by `openacp remote`):
- `openacp://connect?host=<host>&code=<code>`
- `https://<host>?code=<code>`
- `http://localhost:<port>?code=<code>`

#### Connection Flow

```
1. Parse URL → extract host + code
2. POST {host}/api/v1/auth/exchange { code }
   → 401 "Invalid code" / "Code expired" / "Code already used" → show specific error
   → Network error → "Cannot reach {host}" → show error
   → 200 → receive { accessToken, tokenId, expiresAt, refreshDeadline }
3. GET {host}/api/v1/workspace  (Authorization: Bearer <accessToken>)
   → receive { id, name, directory, version }
4. GET {host}/api/v1/auth/me
   → receive { role, scopes }
5. Show confirmation preview:
   ┌──────────────────────────────────────┐
   │ Connected to: Main                   │
   │ Host:    abc-123.trycloudflare.com   │
   │ Role:    admin                       │
   │ Expires: 2026-04-03 14:30 (24h)     │
   └──────────────────────────────────────┘
   [Add Workspace]   [Cancel]
6. User confirms:
   → Store JWT in OS keychain via Tauri Stronghold, keyed by "workspace:<id>"
   → Upsert WorkspaceEntry by id:
       Existing id → update host + tokenId + expiresAt + refreshDeadline (reconnect)
       New id      → insert new entry
7. Close modal, switch active workspace to the newly added one
```

**Keychain:** Raw JWT (`accessToken`) stored in Tauri Stronghold or OS credential store, keyed by `workspace:<id>`. The workspace store (Tauri Store / localStorage) holds only `tokenId`, `expiresAt`, `refreshDeadline` — never the raw token.

---

## 3. JWT Lifecycle for Remote Workspaces

### Token Retrieval

When connecting to a remote workspace, retrieve the JWT from the keychain by key `workspace:<id>`, then set `Authorization: Bearer <token>` header on the API client.

### Token Refresh

The existing API client attempts `POST /api/v1/auth/refresh` on 401. On success:
- Write the new JWT back to the keychain (same key `workspace:<id>`)
- Update `expiresAt` and `refreshDeadline` in `WorkspaceEntry`

### Reconnect Needed State

A remote workspace enters **Reconnect Needed** state when any of:
- 401 and `refreshDeadline` has passed (token cannot be refreshed)
- Host is unreachable (network error on any API request)
- 401/403 that is not recoverable via refresh

**UX:**
- Badge on workspace icon in sidebar: "Reconnect"
- Clicking the workspace → opens Add Workspace modal with Remote tab active
- User pastes new `openacp://` link → same connection flow as above
- `id` from new link matches existing entry → updates `host` + JWT in place (no new entry created)

The user action is always the same regardless of reason: paste a new link.

---

## 4. Workspace Info Refresh

On app startup and when switching to a workspace, refresh `name` and `directory` in the stored entry:
- **Local:** re-run `instances list --json` via `invoke_cli`, find entry by `id`, update fields if changed
- **Remote:** `GET {host}/api/v1/workspace` if connected, update `name` and `directory` if changed

This keeps display info current without requiring the user to re-add workspaces after renaming an instance.

---

## Files to Add / Modify

### New Files (app)
- `src/openacp/components/add-workspace/index.tsx` — modal wrapper, tab switcher
- `src/openacp/components/add-workspace/local-tab.tsx` — known instances list + folder browse
- `src/openacp/components/add-workspace/remote-tab.tsx` — URL input + code exchange flow
- `src/openacp/components/add-workspace/create-instance.tsx` — clone/create new instance sub-screen

### Modified Files (app)
- `src/openacp/api/workspace-store.ts` — migrate to `WorkspaceEntry` schema, update persistence key
- `src/openacp/app.tsx` — add "+" button to sidebar rail, wire Add Workspace modal, migrate instance state to `WorkspaceEntry[]`
- `src-tauri/src/lib.rs` — remove `discover_workspaces()`, add `invoke_cli()` Tauri command
- `src/openacp/api/client.ts` — on JWT refresh success, write new token back to keychain; on reconnect-needed, expose state to UI
- `src/openacp/context/workspace.tsx` — update to use `WorkspaceEntry`; for remote workspaces, load JWT from keychain at connect time
