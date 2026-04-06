# Add Workspace Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Add Workspace modal to the desktop app supporting Local (CLI-discovered instances) and Remote (code-exchange auth) workspace types, with complete workspace metadata storage and JWT lifecycle management.

**Architecture:** Migrate `WorkspaceData` store to `WorkspaceEntry[]` keyed by instance `id`. Replace Tauri's `discover_workspaces` (direct file read) with `invoke_cli` (sidecar invocation). New `AddWorkspace` modal has Local and Remote tabs. Remote auth uses code-exchange flow per `openacp remote` link. JWT stored in OS keychain via Tauri Stronghold, keyed by `workspace:<id>`.

**Tech Stack:** SolidJS, TypeScript, Tauri 2 (Rust), `@tauri-apps/plugin-shell` (sidecar), `@tauri-apps/plugin-store` (workspace persistence), Tailwind CSS 4

**Prerequisite:** Core Plan (`2026-04-02-instances-cli-auth-exchange.md`) must be complete — `openacp instances list --json`, `openacp instances create --json`, and `POST /auth/exchange` must be deployed.

---

## File Map

**New files:**

- `src/openacp/components/add-workspace/index.tsx` — modal wrapper, tab switcher
- `src/openacp/components/add-workspace/local-tab.tsx` — known instances list + folder browse
- `src/openacp/components/add-workspace/remote-tab.tsx` — URL input + code exchange flow
- `src/openacp/components/add-workspace/create-instance.tsx` — clone/create sub-screen

**Modified files:**

- `src/openacp/api/workspace-store.ts` — migrate to `WorkspaceEntry` schema
- `src-tauri/src/lib.rs` — add `invoke_cli`, remove `discover_workspaces`
- `src/openacp/app.tsx` — migrate state to `WorkspaceEntry[]`, add "+" button, wire modal
- `src/openacp/context/workspace.tsx` — adapt to `WorkspaceEntry`, keychain token retrieval
- `src/openacp/api/client.ts` — write refreshed JWT back to keychain, expose reconnect state

---

## Task 1: WorkspaceEntry Schema & Store Migration

**Files:**

- Modify: `src/openacp/api/workspace-store.ts`

- [ ] **Step 1: Define new types and rewrite workspace-store.ts**

Replace the entire contents of `src/openacp/api/workspace-store.ts`:

```typescript
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";

export interface WorkspaceEntry {
  id: string; // instance id — primary key, immutable
  name: string; // display name
  directory: string; // absolute path to project folder (parent of .openacp)
  type: "local" | "remote";
  // Remote only:
  host?: string; // current tunnel/remote host URL (mutable, updated on reconnect)
  tokenId?: string; // JWT token id (for reference/revocation)
  role?: string; // token role
  expiresAt?: string; // JWT expiry ISO 8601
  refreshDeadline?: string; // JWT refresh deadline ISO 8601
}

export interface InstanceListEntry {
  id: string;
  name: string | null;
  directory: string;
  root: string;
  status: "running" | "stopped";
  port: number | null;
}

const STORE_KEY = "workspaces_v2";

let store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!store) store = await Store.load("openacp.bin");
  return store;
}

export async function loadWorkspaces(): Promise<WorkspaceEntry[]> {
  try {
    const s = await getStore();
    const data = await s.get<WorkspaceEntry[]>(STORE_KEY);
    if (Array.isArray(data)) return data;
  } catch {}
  // Fallback to localStorage (dev/browser)
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as WorkspaceEntry[];
  } catch {}
  return [];
}

export async function saveWorkspaces(entries: WorkspaceEntry[]): Promise<void> {
  try {
    const s = await getStore();
    await s.set(STORE_KEY, entries);
    await s.save();
  } catch {}
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  } catch {}
}

export async function upsertWorkspace(
  entry: WorkspaceEntry,
): Promise<WorkspaceEntry[]> {
  const all = await loadWorkspaces();
  const idx = all.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...entry };
  } else {
    all.push(entry);
  }
  await saveWorkspaces(all);
  return all;
}

export async function removeWorkspace(id: string): Promise<WorkspaceEntry[]> {
  const all = await loadWorkspaces();
  const filtered = all.filter((e) => e.id !== id);
  await saveWorkspaces(filtered);
  return filtered;
}

export async function discoverLocalInstances(): Promise<InstanceListEntry[]> {
  try {
    const stdout = await invoke<string>("invoke_cli", {
      args: ["instances", "list", "--json"],
    });
    const parsed = JSON.parse(stdout);
    // parsed is { success: true, data: [...] } from jsonSuccess
    const data = parsed?.data ?? parsed;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
npx tsc --noEmit
```

Expected: No errors in workspace-store.ts

- [ ] **Step 3: Commit**

```bash
git add src/openacp/api/workspace-store.ts
git commit -m "feat: migrate workspace store to WorkspaceEntry schema"
```

---

## Task 2: `invoke_cli` Tauri Command

**Files:**

- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `invoke_cli` command and remove `discover_workspaces`**

In `src-tauri/src/lib.rs`:

1. Find and **delete** the `discover_workspaces` function and its `#[tauri::command]` annotation.

2. Add the new `invoke_cli` command (add after `get_workspace_server_info`):

```rust
#[tauri::command]
async fn invoke_cli(args: Vec<String>, app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;
    let output = app
        .shell()
        .sidecar("openacp")
        .map_err(|e| e.to_string())?
        .args(&args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(if stderr.is_empty() {
            format!("CLI exited with status: {}", output.status)
        } else {
            stderr
        })
    }
}
```

3. In the `Builder::new()` chain (where `tauri::generate_handler![]` is called), replace `discover_workspaces` with `invoke_cli`:

```rust
// Before: discover_workspaces,
// After:  invoke_cli,
```

- [ ] **Step 2: Build Tauri to verify Rust compiles**

```bash
npx tauri build --debug 2>&1 | tail -20
```

Expected: Builds successfully (or only non-fatal warnings)

- [ ] **Step 3: Verify invoke_cli works in dev**

```bash
npx tauri dev
```

In the app's browser console:

```javascript
await window.__TAURI__.core.invoke("invoke_cli", {
  args: ["instances", "list", "--json"],
});
```

Expected: JSON string with instances array

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add invoke_cli Tauri command, remove discover_workspaces"
```

---

## Task 3: Migrate `app.tsx` State to WorkspaceEntry

**Files:**

- Modify: `src/openacp/app.tsx`
- Modify: `src/openacp/context/workspace.tsx`

- [ ] **Step 1: Update app.tsx store shape**

In `src/openacp/app.tsx`, replace the current store definition and initialization. The goal is to store `WorkspaceEntry[]` instead of `string[]` of instance IDs, while keeping the same UI behavior.

Find the current store definition (uses `createStore`) and replace:

```typescript
// OLD (approximate):
// const [store, setStore] = createStore({ instances: string[], active: string | null, ... })

// NEW:
import {
  loadWorkspaces,
  saveWorkspaces,
  discoverLocalInstances,
  type WorkspaceEntry,
} from "./api/workspace-store.js";

const [store, setStore] = createStore<{
  workspaces: WorkspaceEntry[];
  activeId: string | null;
  ready: boolean;
  server: ServerInfo | null;
  loading: boolean;
  error: string | null;
}>({
  workspaces: [],
  activeId: null,
  ready: false,
  server: null,
  loading: false,
  error: null,
});
```

- [ ] **Step 2: Update initialization logic**

Replace `refreshInstanceMap` / `discoverWorkspaces` calls with `loadWorkspaces`:

```typescript
onMount(async () => {
  const saved = await loadWorkspaces();
  setStore("workspaces", saved);

  if (saved.length > 0) {
    const lastActive = saved[saved.length - 1]!.id;
    setStore("activeId", lastActive);
    await resolveServer(lastActive);
  }
});
```

- [ ] **Step 3: Update `resolveServer` to use WorkspaceEntry**

```typescript
async function resolveServer(id: string) {
  setStore("loading", true);
  setStore("error", null);
  const entry = store.workspaces.find((w) => w.id === id);
  if (!entry) {
    setStore("loading", false);
    return;
  }

  if (entry.type === "local") {
    // Read api-secret via existing get_workspace_server_info Tauri command (keep this one)
    try {
      const info = await invoke<{ url: string; token: string }>(
        "get_workspace_server_info",
        { instanceId: id },
      );
      setStore("server", info);
      setStore("ready", true);
    } catch (e) {
      setStore("error", "Server not reachable");
      startRetry(id);
    }
  } else {
    // Remote: get token from keychain
    const { getKeychainToken } = await import("./api/keychain.js");
    const token = await getKeychainToken(id);
    if (!token || !entry.host) {
      setStore("error", "Reconnect needed");
      return;
    }
    setStore("server", { url: entry.host, token });
    setStore("ready", true);
  }
  setStore("loading", false);
}
```

- [ ] **Step 4: Update `persistWorkspaces` calls**

Replace `persistInstances` → `saveWorkspaces(store.workspaces)`.

- [ ] **Step 5: Update WorkspaceProvider in workspace.tsx**

In `src/openacp/context/workspace.tsx`, update `WorkspaceContext` to use `WorkspaceEntry`:

```typescript
import type { WorkspaceEntry } from "../api/workspace-store.js";

export interface WorkspaceContext {
  workspace: WorkspaceEntry;
  server: { url: string; token: string };
  client: ReturnType<typeof createApiClient>;
}
```

`WorkspaceProvider` receives `workspace: WorkspaceEntry` and `server` as props instead of just `instanceId`.

- [ ] **Step 6: Verify app loads with migrated state**

```bash
npx tauri dev
```

App should still work for existing local workspaces.

- [ ] **Step 7: Commit**

```bash
git add src/openacp/app.tsx src/openacp/context/workspace.tsx
git commit -m "feat: migrate app state to WorkspaceEntry, wire discoverLocalInstances"
```

---

## Task 4: Add Workspace Modal Shell

**Files:**

- Create: `src/openacp/components/add-workspace/index.tsx`

- [ ] **Step 1: Create modal shell with Local/Remote tabs**

```tsx
// src/openacp/components/add-workspace/index.tsx
import { createSignal, Show } from "solid-js";
import { LocalTab } from "./local-tab.js";
import { RemoteTab } from "./remote-tab.js";
import type { WorkspaceEntry } from "../../api/workspace-store.js";

interface AddWorkspaceModalProps {
  onAdd: (entry: WorkspaceEntry) => void;
  onClose: () => void;
  existingIds: string[]; // ids of already-added workspaces, passed down to LocalTab
}

export function AddWorkspaceModal(props: AddWorkspaceModalProps) {
  const [tab, setTab] = createSignal<"local" | "remote">("local");

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div class="bg-surface w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div class="flex items-center justify-between px-6 py-3 border-b border-border">
          <h2 class="text-lg font-semibold">Add Workspace</h2>
          <button
            onClick={props.onClose}
            class="text-muted hover:text-fg text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div class="flex border-b border-border">
          <button
            class={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab() === "local" ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
            onClick={() => setTab("local")}
          >
            Local
          </button>
          <button
            class={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab() === "remote" ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
            onClick={() => setTab("remote")}
          >
            Remote
          </button>
        </div>

        {/* Tab content */}
        <div class="p-6">
          <Show when={tab() === "local"}>
            <LocalTab onAdd={props.onAdd} existingIds={props.existingIds} />
          </Show>
          <Show when={tab() === "remote"}>
            <RemoteTab onAdd={props.onAdd} />
          </Show>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create stub files for LocalTab and RemoteTab**

```tsx
// src/openacp/components/add-workspace/local-tab.tsx
import type { WorkspaceEntry } from "../../api/workspace-store.js";
export function LocalTab(_props: { onAdd: (e: WorkspaceEntry) => void }) {
  return <div>Local tab (coming soon)</div>;
}
```

```tsx
// src/openacp/components/add-workspace/remote-tab.tsx
import type { WorkspaceEntry } from "../../api/workspace-store.js";
export function RemoteTab(_props: { onAdd: (e: WorkspaceEntry) => void }) {
  return <div>Remote tab (coming soon)</div>;
}
```

- [ ] **Step 3: Add "+" button to sidebar and wire modal in app.tsx**

In `src/openacp/app.tsx`, add:

```typescript
const [showAddWorkspace, setShowAddWorkspace] = createSignal(false);

function handleAddWorkspace(entry: WorkspaceEntry) {
  setStore("workspaces", (prev) => [...prev, entry]);
  saveWorkspaces(store.workspaces);
  setShowAddWorkspace(false);
  setStore("activeId", entry.id);
  resolveServer(entry.id);
}
```

In the JSX, inside the sidebar rail area, add a "+" button:

```tsx
<button
  onClick={() => setShowAddWorkspace(true)}
  class="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:text-fg hover:bg-surface-hover transition-colors"
  title="Add workspace"
>
  +
</button>

<Show when={showAddWorkspace()}>
  <AddWorkspaceModal
    onAdd={handleAddWorkspace}
    onClose={() => setShowAddWorkspace(false)}
    existingIds={store.workspaces.map(w => w.id)}
  />
</Show>
```

Import `AddWorkspaceModal` at top of `app.tsx`.

- [ ] **Step 4: Verify modal opens and closes**

```bash
npx tauri dev
```

Click "+" → modal opens with Local/Remote tabs → close button works.

- [ ] **Step 5: Commit**

```bash
git add src/openacp/components/add-workspace/ src/openacp/app.tsx
git commit -m "feat: add workspace modal shell with local/remote tabs"
```

---

## Task 5: Local Tab — Instances List

**Files:**

- Modify: `src/openacp/components/add-workspace/local-tab.tsx`

- [ ] **Step 1: Add `path_exists` Tauri command to lib.rs**

In `src-tauri/src/lib.rs`, add this command after `invoke_cli`:

```rust
#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}
```

In the `tauri::generate_handler![]` macro, add `path_exists`:

```rust
// Before: tauri::generate_handler![..., invoke_cli]
// After:  tauri::generate_handler![..., invoke_cli, path_exists]
```

Build to verify:

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
npx tauri build --debug 2>&1 | grep -E "error|warning\[" | head -20
```

Expected: No new errors.

- [ ] **Step 2: Implement local instances list**

Replace local-tab.tsx stub:

```tsx
// src/openacp/components/add-workspace/local-tab.tsx
import { createSignal, createResource, For, Show } from "solid-js";
import {
  discoverLocalInstances,
  type InstanceListEntry,
  type WorkspaceEntry,
} from "../../api/workspace-store.js";
import { CreateInstance } from "./create-instance.js";

interface LocalTabProps {
  onAdd: (entry: WorkspaceEntry) => void;
  existingIds?: string[]; // already-added workspace ids
}

export function LocalTab(props: LocalTabProps) {
  const [instances] = createResource(discoverLocalInstances);
  const [browseResult, setBrowseResult] = createSignal<BrowseResult | null>(
    null,
  );

  async function handleBrowse() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    const result = await checkBrowsedPath(selected, instances() ?? []);
    setBrowseResult(result);
  }

  function handleSelectInstance(inst: InstanceListEntry) {
    const entry: WorkspaceEntry = {
      id: inst.id,
      name: inst.name ?? inst.id,
      directory: inst.directory,
      type: "local",
    };
    props.onAdd(entry);
  }

  return (
    <div class="space-y-4">
      {/* Known instances */}
      <div>
        <p class="text-xs font-medium text-muted uppercase tracking-wide mb-2">
          Known Instances
        </p>
        <Show when={instances.loading}>
          <p class="text-sm text-muted">Scanning...</p>
        </Show>
        <Show when={!instances.loading && (instances() ?? []).length === 0}>
          <p class="text-sm text-muted">No instances found.</p>
        </Show>
        <For each={instances() ?? []}>
          {(inst) => {
            const alreadyAdded = () =>
              props.existingIds?.includes(inst.id) ?? false;
            return (
              <button
                disabled={alreadyAdded()}
                onClick={() => handleSelectInstance(inst)}
                class={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${alreadyAdded() ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-hover"}`}
              >
                <span
                  class={`text-xs ${inst.status === "running" ? "text-green-500" : "text-muted"}`}
                >
                  {inst.status === "running" ? "●" : "○"}
                </span>
                <span class="flex-1 min-w-0">
                  <span class="text-sm font-medium block truncate">
                    {inst.name ?? inst.id}
                  </span>
                  <span class="text-xs text-muted block truncate">
                    {inst.directory}
                    {inst.port ? ` :${inst.port}` : ""}
                  </span>
                </span>
                <Show when={alreadyAdded()}>
                  <span class="text-xs text-muted">✓ Added</span>
                </Show>
              </button>
            );
          }}
        </For>
      </div>

      {/* Browse folder */}
      <div class="border-t border-border pt-4">
        <button
          onClick={handleBrowse}
          class="w-full px-4 py-2 rounded-lg border border-border text-sm hover:bg-surface-hover transition-colors"
        >
          Browse for a folder...
        </button>
      </div>

      {/* Browse result */}
      <Show when={browseResult()}>
        <BrowseResultView
          result={browseResult()!}
          instances={instances() ?? []}
          onAdd={props.onAdd}
          onClose={() => setBrowseResult(null)}
        />
      </Show>
    </div>
  );
}
```

- [ ] **Step 3: Implement `checkBrowsedPath` utility**

Add at the bottom of `local-tab.tsx`:

```typescript
type BrowseResult =
  | { type: "known"; instance: InstanceListEntry }
  | { type: "unregistered"; path: string }
  | { type: "new"; path: string };

async function checkBrowsedPath(
  selectedPath: string,
  knownInstances: InstanceListEntry[],
): Promise<BrowseResult> {
  // Check if path matches a known instance's directory
  // Use invoke_cli to get absolute path (Tauri dialog already returns absolute)
  const match = knownInstances.find((i) => i.directory === selectedPath);
  if (match) return { type: "known", instance: match };

  // Check if path has .openacp/config.json (unregistered existing instance)
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const hasConfig = await invoke<boolean>("path_exists", {
      path: `${selectedPath}/.openacp/config.json`,
    });
    if (hasConfig) return { type: "unregistered", path: selectedPath };
  } catch {}

  return { type: "new", path: selectedPath };
}
```

- [ ] **Step 4: Implement `BrowseResultView`**

```tsx
function BrowseResultView(props: {
  result: BrowseResult;
  instances: InstanceListEntry[];
  onAdd: (e: WorkspaceEntry) => void;
  onClose: () => void;
}) {
  if (props.result.type === "known") {
    return (
      <div class="p-3 bg-surface-hover rounded-lg text-sm">
        <p>
          This folder is already registered as{" "}
          <strong>
            {props.result.instance.name ?? props.result.instance.id}
          </strong>
          .
        </p>
        <button
          onClick={() =>
            props.onAdd({
              id: props.result.instance.id,
              name: props.result.instance.name ?? props.result.instance.id,
              directory: props.result.instance.directory,
              type: "local",
            })
          }
          class="mt-2 px-3 py-1 rounded bg-accent text-white text-xs"
        >
          Add workspace
        </button>
      </div>
    );
  }

  if (props.result.type === "unregistered") {
    return (
      <div class="p-3 bg-surface-hover rounded-lg text-sm">
        <p>Found an existing OpenACP instance at this path.</p>
        <RegisterExistingButton path={props.result.path} onAdd={props.onAdd} />
      </div>
    );
  }

  // type === 'new'
  return (
    <CreateInstance
      path={props.result.path}
      existingInstances={props.instances}
      onAdd={props.onAdd}
      onClose={props.onClose}
    />
  );
}

function RegisterExistingButton(props: {
  path: string;
  onAdd: (e: WorkspaceEntry) => void;
}) {
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function register() {
    setLoading(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const stdout = await invoke<string>("invoke_cli", {
        args: [
          "instances",
          "create",
          "--dir",
          props.path,
          "--no-interactive",
          "--json",
        ],
      });
      const result = JSON.parse(stdout);
      const data = result?.data ?? result;
      props.onAdd({
        id: data.id,
        name: data.name ?? data.id,
        directory: data.directory,
        type: "local",
      });
    } catch (e: any) {
      setError(e.message ?? "Failed to register");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={register}
        disabled={loading()}
        class="mt-2 px-3 py-1 rounded bg-accent text-white text-xs disabled:opacity-50"
      >
        {loading() ? "Registering..." : "Register this instance"}
      </button>
      <Show when={error()}>
        <p class="text-xs text-red-500 mt-1">{error()}</p>
      </Show>
    </>
  );
}
```

- [ ] **Step 5: Verify local tab shows instances**

```bash
npx tauri dev
```

Click "+" → Local tab → instances appear with status indicators → clicking one calls `onAdd`.

- [ ] **Step 6: Commit**

```bash
git add src/openacp/components/add-workspace/local-tab.tsx src-tauri/src/lib.rs
git commit -m "feat: local tab with instances list and folder browse"
```

---

## Task 6: Local Tab — Create Instance Sub-Screen

**Files:**

- Create: `src/openacp/components/add-workspace/create-instance.tsx`

- [ ] **Step 1: Implement CreateInstance component**

```tsx
// src/openacp/components/add-workspace/create-instance.tsx
import { createSignal, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type {
  InstanceListEntry,
  WorkspaceEntry,
} from "../../api/workspace-store.js";

interface CreateInstanceProps {
  path: string;
  existingInstances: InstanceListEntry[];
  onAdd: (entry: WorkspaceEntry) => void;
  onClose: () => void;
}

export function CreateInstance(props: CreateInstanceProps) {
  const [mode, setMode] = createSignal<"choose" | "clone" | "new">("choose");
  const [cloneFrom, setCloneFrom] = createSignal<string | null>(null);
  const [name, setName] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const folderName = props.path.split("/").pop() ?? "workspace";

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const args = ["instances", "create", "--dir", props.path, "--json"];
      if (name()) args.push("--name", name());
      if (mode() === "clone" && cloneFrom()) {
        args.push("--from", cloneFrom()!);
      } else {
        args.push("--no-interactive");
      }
      const stdout = await invoke<string>("invoke_cli", { args });
      const result = JSON.parse(stdout);
      const data = result?.data ?? result;
      props.onAdd({
        id: data.id,
        name: data.name ?? data.id,
        directory: data.directory,
        type: "local",
      });
    } catch (e: any) {
      setError(e.message ?? "Failed to create instance");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="space-y-4 p-3 bg-surface-hover rounded-lg">
      <p class="text-sm font-medium">
        No OpenACP instance at <code class="text-xs">{folderName}</code>
      </p>

      <Show when={mode() === "choose"}>
        <div class="space-y-2">
          <Show when={props.existingInstances.length > 0}>
            <button
              onClick={() => setMode("clone")}
              class="w-full text-left px-3 py-2 rounded border border-border text-sm hover:bg-surface transition-colors"
            >
              <span class="font-medium">Clone from existing</span>
              <span class="block text-xs text-muted">
                Copy config from another instance
              </span>
            </button>
          </Show>
          <button
            onClick={() => setMode("new")}
            class="w-full text-left px-3 py-2 rounded border border-border text-sm hover:bg-surface transition-colors"
          >
            <span class="font-medium">Create new</span>
            <span class="block text-xs text-muted">
              Start with a fresh instance
            </span>
          </button>
        </div>
      </Show>

      <Show when={mode() === "clone"}>
        <div class="space-y-3">
          <label class="block">
            <span class="text-xs text-muted block mb-1">Clone from</span>
            <select
              value={cloneFrom() ?? ""}
              onInput={(e) => setCloneFrom(e.currentTarget.value || null)}
              class="w-full px-3 py-2 rounded border border-border bg-surface text-sm"
            >
              <option value="">Select instance...</option>
              <For each={props.existingInstances}>
                {(inst) => (
                  <option value={inst.directory}>
                    {inst.name ?? inst.id} ({inst.directory})
                  </option>
                )}
              </For>
            </select>
          </label>
          <NameInput value={name()} folderName={folderName} onInput={setName} />
          <ActionButtons
            onBack={() => setMode("choose")}
            onConfirm={handleCreate}
            disabled={!cloneFrom() || loading()}
            loading={loading()}
            error={error()}
          />
        </div>
      </Show>

      <Show when={mode() === "new"}>
        <div class="space-y-3">
          <NameInput value={name()} folderName={folderName} onInput={setName} />
          <ActionButtons
            onBack={() => setMode("choose")}
            onConfirm={handleCreate}
            disabled={loading()}
            loading={loading()}
            error={error()}
          />
        </div>
      </Show>
    </div>
  );
}

function NameInput(props: {
  value: string;
  folderName: string;
  onInput: (v: string) => void;
}) {
  return (
    <label class="block">
      <span class="text-xs text-muted block mb-1">Instance name</span>
      <input
        type="text"
        value={props.value}
        placeholder={props.folderName}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        class="w-full px-3 py-2 rounded border border-border bg-surface text-sm"
      />
    </label>
  );
}

function ActionButtons(props: {
  onBack: () => void;
  onConfirm: () => void;
  disabled: boolean;
  loading: boolean;
  error: string | null;
}) {
  return (
    <>
      <Show when={props.error}>
        <p class="text-xs text-red-500">{props.error}</p>
      </Show>
      <div class="flex gap-2">
        <button
          onClick={props.onBack}
          class="px-3 py-1 text-sm text-muted hover:text-fg"
        >
          Back
        </button>
        <button
          onClick={props.onConfirm}
          disabled={props.disabled}
          class="flex-1 px-3 py-1 rounded bg-accent text-white text-sm disabled:opacity-50"
        >
          {props.loading ? "Creating..." : "Create workspace"}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify create flow**

```bash
npx tauri dev
```

"Browse for folder" → pick empty folder → create options appear → clone or create new → workspace added.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/add-workspace/create-instance.tsx
git commit -m "feat: local tab create instance sub-screen (clone or new)"
```

---

## Task 7: Remote Tab — Code Exchange Flow

**Files:**

- Modify: `src/openacp/components/add-workspace/remote-tab.tsx`

- [ ] **Step 1: Implement full remote tab**

Replace remote-tab.tsx stub:

```tsx
// src/openacp/components/add-workspace/remote-tab.tsx
import { createSignal, Show } from "solid-js";
import type { WorkspaceEntry } from "../../api/workspace-store.js";

interface RemoteTabProps {
  onAdd: (entry: WorkspaceEntry) => void;
}

interface ConnectionPreview {
  host: string;
  accessToken: string;
  tokenId: string;
  expiresAt: string;
  refreshDeadline: string;
  role: string;
  scopes: string[];
  workspaceId: string;
  workspaceName: string;
  workspaceDirectory: string;
}

function parseLink(input: string): { host: string; code: string } | null {
  try {
    let url: URL;
    if (input.startsWith("openacp://connect")) {
      // Custom scheme: openacp://connect?host=...&code=...
      const params = new URLSearchParams(
        input.replace("openacp://connect?", ""),
      );
      const host = params.get("host");
      const code = params.get("code");
      if (!host || !code) return null;
      return { host: `https://${host}`, code };
    }
    url = new URL(input);
    const code = url.searchParams.get("code");
    if (!code) return null;
    const host = `${url.protocol}//${url.host}`;
    return { host, code };
  } catch {
    return null;
  }
}

async function connectWithCode(
  host: string,
  code: string,
): Promise<ConnectionPreview> {
  // Step 1: Exchange code for JWT
  const exchangeRes = await fetch(`${host}/api/v1/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!exchangeRes.ok) {
    const err = await exchangeRes.json().catch(() => ({}));
    const msg = (err as any)?.error?.message ?? exchangeRes.statusText;
    throw new Error(msg);
  }
  const { accessToken, tokenId, expiresAt, refreshDeadline } =
    await exchangeRes.json();

  // Step 2: Get workspace info
  const wsRes = await fetch(`${host}/api/v1/workspace`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!wsRes.ok) throw new Error("Failed to fetch workspace info");
  const ws = await wsRes.json();

  // Step 3: Get token info
  const meRes = await fetch(`${host}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) throw new Error("Failed to fetch token info");
  const me = await meRes.json();

  return {
    host,
    accessToken,
    tokenId,
    expiresAt,
    refreshDeadline,
    role: me.role,
    scopes: me.scopes,
    workspaceId: ws.id,
    workspaceName: ws.name,
    workspaceDirectory: ws.directory,
  };
}

export function RemoteTab(props: RemoteTabProps) {
  const [input, setInput] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [preview, setPreview] = createSignal<ConnectionPreview | null>(null);
  const [saving, setSaving] = createSignal(false);

  async function handleConnect() {
    setError(null);
    const parsed = parseLink(input().trim());
    if (!parsed) {
      setError(
        "Invalid link format. Paste an openacp:// link or https:// URL.",
      );
      return;
    }
    setLoading(true);
    try {
      const result = await connectWithCode(parsed.host, parsed.code);
      setPreview(result);
    } catch (e: any) {
      setError(e.message ?? "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    const p = preview();
    if (!p) return;
    setSaving(true);
    try {
      // Store JWT in keychain
      const { setKeychainToken } = await import("../../api/keychain.js");
      await setKeychainToken(p.workspaceId, p.accessToken);

      // Build WorkspaceEntry (no raw token stored here)
      const entry: WorkspaceEntry = {
        id: p.workspaceId,
        name: p.workspaceName,
        directory: p.workspaceDirectory,
        type: "remote",
        host: p.host,
        tokenId: p.tokenId,
        role: p.role,
        expiresAt: p.expiresAt,
        refreshDeadline: p.refreshDeadline,
      };
      props.onAdd(entry);
    } catch (e: any) {
      setError(e.message ?? "Failed to save workspace");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="space-y-4">
      <Show when={!preview()}>
        <div class="space-y-3">
          <label class="block">
            <span class="text-xs text-muted block mb-1">
              Paste openacp:// link or URL
            </span>
            <textarea
              value={input()}
              onInput={(e) => setInput(e.currentTarget.value)}
              placeholder="openacp://connect?host=abc-123.trycloudflare.com&code=..."
              rows={3}
              class="w-full px-3 py-2 rounded border border-border bg-surface text-sm font-mono resize-none"
            />
          </label>
          <Show when={error()}>
            <p class="text-xs text-red-500">{error()}</p>
          </Show>
          <button
            onClick={handleConnect}
            disabled={loading() || !input().trim()}
            class="w-full px-4 py-2 rounded bg-accent text-white text-sm disabled:opacity-50"
          >
            {loading() ? "Connecting..." : "Connect"}
          </button>
        </div>
      </Show>

      <Show when={preview()}>
        {(p) => (
          <div class="space-y-4">
            <div class="p-4 bg-surface-hover rounded-lg space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-muted">Workspace</span>
                <span class="font-medium">{p().workspaceName}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">Host</span>
                <span class="font-mono text-xs truncate max-w-48">
                  {p().host.replace("https://", "")}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">Role</span>
                <span>{p().role}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">Expires</span>
                <span>{new Date(p().expiresAt).toLocaleString()}</span>
              </div>
            </div>
            <Show when={error()}>
              <p class="text-xs text-red-500">{error()}</p>
            </Show>
            <div class="flex gap-2">
              <button
                onClick={() => {
                  setPreview(null);
                  setError(null);
                }}
                class="px-3 py-2 text-sm text-muted hover:text-fg"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving()}
                class="flex-1 px-4 py-2 rounded bg-accent text-white text-sm disabled:opacity-50"
              >
                {saving() ? "Saving..." : "Add Workspace"}
              </button>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/openacp/components/add-workspace/remote-tab.tsx
git commit -m "feat: remote tab with code exchange connection flow"
```

---

## Task 8: Keychain Storage & JWT Lifecycle

**Files:**

- Create: `src/openacp/api/keychain.ts`
- Modify: `src/openacp/api/client.ts`

- [ ] **Step 1: Add keychain Rust commands to lib.rs**

First, check `src-tauri/Cargo.toml` for `tauri-plugin-stronghold` or `keyring`. If neither is present, use a simple encrypted-file approach via `tauri-plugin-store` OR the in-memory+file implementation below.

In `src-tauri/src/lib.rs`, add at the top (after existing `use` statements):

```rust
use std::collections::HashMap;
use std::sync::Mutex;

static KEYCHAIN: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
```

Add the three commands after `path_exists`:

```rust
#[tauri::command]
fn keychain_set(key: String, value: String, app: tauri::AppHandle) -> Result<(), String> {
    let mut lock = KEYCHAIN.lock().map_err(|e| e.to_string())?;
    let map = lock.get_or_insert_with(HashMap::new);
    map.insert(key.clone(), value.clone());
    // Persist to app data dir
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let keychain_path = data_dir.join("keychain.json");
    let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
    std::fs::write(&keychain_path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn keychain_get(key: String, app: tauri::AppHandle) -> Result<Option<String>, String> {
    let mut lock = KEYCHAIN.lock().map_err(|e| e.to_string())?;
    if lock.is_none() {
        // Load from disk on first access
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let keychain_path = data_dir.join("keychain.json");
        if keychain_path.exists() {
            let raw = std::fs::read_to_string(&keychain_path).map_err(|e| e.to_string())?;
            let map: HashMap<String, String> = serde_json::from_str(&raw).unwrap_or_default();
            *lock = Some(map);
        } else {
            *lock = Some(HashMap::new());
        }
    }
    Ok(lock.as_ref().and_then(|m| m.get(&key).cloned()))
}

#[tauri::command]
fn keychain_delete(key: String, app: tauri::AppHandle) -> Result<(), String> {
    let mut lock = KEYCHAIN.lock().map_err(|e| e.to_string())?;
    if let Some(map) = lock.as_mut() {
        map.remove(&key);
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let keychain_path = data_dir.join("keychain.json");
        let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
        std::fs::write(&keychain_path, json).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

In `tauri::generate_handler![]`, add `keychain_set, keychain_get, keychain_delete`.

Add `serde_json` to `src-tauri/Cargo.toml` if not present:

```toml
serde_json = "1"
```

Build to verify:

```bash
npx tauri build --debug 2>&1 | grep -E "^error" | head -20
```

Expected: No errors.

- [ ] **Step 2: Create keychain.ts abstraction**

```typescript
// src/openacp/api/keychain.ts
// Keychain abstraction over Tauri keychain_set/get/delete commands.
// Key format: "workspace:<id>"
// Falls back to sessionStorage in dev/browser (tokens are NOT persisted to disk in fallback).

import { invoke } from "@tauri-apps/api/core";

function keychainKey(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

export async function setKeychainToken(
  workspaceId: string,
  token: string,
): Promise<void> {
  const key = keychainKey(workspaceId);
  try {
    await invoke("keychain_set", { key, value: token });
    return;
  } catch {}
  // Fallback: sessionStorage (non-persistent, cleared on close)
  try {
    sessionStorage.setItem(key, token);
  } catch {}
}

export async function getKeychainToken(
  workspaceId: string,
): Promise<string | null> {
  const key = keychainKey(workspaceId);
  try {
    const token = await invoke<string | null>("keychain_get", { key });
    if (token) return token;
  } catch {}
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function deleteKeychainToken(workspaceId: string): Promise<void> {
  const key = keychainKey(workspaceId);
  try {
    await invoke("keychain_delete", { key });
  } catch {}
  try {
    sessionStorage.removeItem(key);
  } catch {}
}
```

- [ ] **Step 3: Update `client.ts` to write refreshed token back to keychain**

In `src/openacp/api/client.ts`, find `tryRefreshToken()`. It currently updates an in-memory token. Add keychain update after success:

```typescript
// Find this (approximate existing code):
async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: currentToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    currentToken = data.accessToken;
    // ADD THESE LINES:
    if (workspaceId) {
      const { setKeychainToken } = await import("./keychain.js");
      await setKeychainToken(workspaceId, data.accessToken);
      onTokenRefreshed?.(data); // notify app to update WorkspaceEntry
    }
    return true;
  } catch {
    return false;
  }
}
```

`createApiClient` needs to accept `workspaceId` and an `onTokenRefreshed` callback. Update its signature and the call in `workspace.tsx`.

- [ ] **Step 4: Add reconnect-needed state to API client**

In `client.ts`, add a signal/callback for reconnect needed:

```typescript
// In createApiClient, add:
let onReconnectNeeded: (() => void) | undefined;

// In api() fetch wrapper, after all 401 handling fails:
if (res.status === 401 && !canRefresh) {
  onReconnectNeeded?.();
  throw new Error("Reconnect needed");
}

// Expose:
return {
  // ... existing methods ...
  setOnReconnectNeeded: (cb: () => void) => {
    onReconnectNeeded = cb;
  },
};
```

In `app.tsx`, after creating the client:

```typescript
client.setOnReconnectNeeded(() => {
  setStore("error", "reconnect-needed");
});
```

In the UI, when `store.error === 'reconnect-needed'`, show reconnect badge on the workspace in the sidebar and open the Add Workspace modal (Remote tab) when clicked.

- [ ] **Step 5: Verify remote workspace connect + reconnect flow**

1. Run `openacp remote` on core to generate a link
2. Open app → "+" → Remote tab → paste link → connect → confirm → workspace added
3. Verify JWT is retrieved from keychain on next app restart

- [ ] **Step 6: Commit**

```bash
git add src/openacp/api/keychain.ts src/openacp/api/client.ts src-tauri/src/lib.rs
git commit -m "feat: keychain token storage and JWT refresh lifecycle"
```

---

## Task 9: Workspace Info Refresh & Final Wiring

**Files:**

- Modify: `src/openacp/app.tsx`

- [ ] **Step 1: Add workspace info refresh on connect**

In `resolveServer`, after successfully connecting, refresh the stored `name` and `directory`:

```typescript
async function refreshWorkspaceInfo(id: string, client: ApiClient) {
  try {
    // For remote workspaces: call /api/v1/workspace
    const entry = store.workspaces.find((w) => w.id === id);
    if (!entry) return;
    if (entry.type === "remote") {
      const ws = await client.getWorkspaceInfo(); // add this to client.ts: GET /api/v1/workspace
      if (ws.name !== entry.name || ws.directory !== entry.directory) {
        const updated = { ...entry, name: ws.name, directory: ws.directory };
        setStore("workspaces", (prev) =>
          prev.map((w) => (w.id === id ? updated : w)),
        );
        saveWorkspaces(store.workspaces);
      }
    } else {
      // For local: re-run instances list and find by id
      const list = await discoverLocalInstances();
      const found = list.find((i) => i.id === id);
      if (
        found &&
        (found.name !== entry.name || found.directory !== entry.directory)
      ) {
        const updated = {
          ...entry,
          name: found.name ?? entry.name,
          directory: found.directory,
        };
        setStore("workspaces", (prev) =>
          prev.map((w) => (w.id === id ? updated : w)),
        );
        saveWorkspaces(store.workspaces);
      }
    }
  } catch {}
}
```

Add `client.getWorkspaceInfo()` to `client.ts`:

```typescript
getWorkspaceInfo: () => api<{ id: string; name: string; directory: string; version: string }>('/workspace'),
```

- [ ] **Step 2: Wire reconnect badge in sidebar**

In the sidebar workspace switcher section of `app.tsx`, for each workspace in `store.workspaces`, show a reconnect badge if that workspace has `error === 'reconnect-needed'`. Clicking opens `AddWorkspaceModal` with Remote tab active and the workspace `id` pre-set.

- [ ] **Step 3: Run full build and test**

```bash
pnpm build && npx tsc --noEmit
npx tauri build --debug 2>&1 | tail -30
```

Expected: No TypeScript errors, Tauri builds successfully

- [ ] **Step 4: Final commit**

```bash
git add src/openacp/app.tsx
git commit -m "feat: workspace info refresh and reconnect badge in sidebar"
```

---

## Self-Review Checklist

After all tasks are complete:

- [ ] `WorkspaceEntry` schema used throughout — no more raw `string[]` of instance IDs
- [ ] `invoke_cli` Tauri command works, `discover_workspaces` removed
- [ ] Local tab shows known instances with running/stopped status
- [ ] Folder browse correctly identifies known / unregistered / new cases using absolute paths
- [ ] Clone flow calls `instances create --from` and adds workspace by returned `id`
- [ ] Remote tab parses all three link formats (`openacp://`, `https://`, `http://`)
- [ ] Code exchange flow: exchange → workspace info → token info → preview → confirm
- [ ] JWT stored in keychain keyed by `workspace:<id>`, NOT in workspace store
- [ ] Existing workspace with same `id` gets updated (not duplicated) on reconnect
- [ ] JWT refresh writes new token back to keychain
- [ ] Reconnect needed state triggers on: expired past deadline, host unreachable, 401 unrecoverable
- [ ] Reconnect badge on sidebar opens Add Workspace modal (Remote tab)
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] Tauri build succeeds
