# Plugins UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Plugins button to the sidebar that opens a modal with Installed and Marketplace tabs, enabling plugin management (enable/disable/uninstall) and CLI command display for install/configure.

**Architecture:** Three new SolidJS components (`plugins-modal.tsx`, `plugins-installed.tsx`, `plugins-marketplace.tsx`) are composed under the existing `SidebarPanel`. API calls go through `createApiClient`. No test framework is available — verify visually in `pnpm tauri dev`.

**Tech Stack:** SolidJS (signals, createResource, createStore, onCleanup), `@openacp/ui` components (Dialog, Tabs, Switch, Tooltip, Spinner, Toast), Tailwind CSS 4, TypeScript strict.

**Prerequisite:** Core API plan (`2026-04-03-plugins-api.md`) must be fully deployed before testing this UI.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/openacp/types.ts` | Add `InstalledPlugin`, `MarketplacePlugin`, `MarketplaceCategory` types |
| Modify | `src/openacp/api/client.ts` | Add `listPlugins`, `getMarketplace`, `enablePlugin`, `disablePlugin`, `uninstallPlugin` |
| Modify | `src/openacp/components/sidebar.tsx` | Add Plugins button at bottom, wire modal open signal |
| Create | `src/openacp/components/plugins-modal.tsx` | Modal shell: Dialog + Tabs state |
| Create | `src/openacp/components/plugins-installed.tsx` | Installed tab: list, enable/disable toggle, configure panel, uninstall |
| Create | `src/openacp/components/plugins-marketplace.tsx` | Marketplace tab: search, install flow with polling |

---

### Task 1: Add types

**Files:**
- Modify: `src/openacp/types.ts`

- [ ] **Step 1: Add plugin types**

Open `src/openacp/types.ts` and append at the end:

```ts
// ─── Plugin types ──────────────────────────────────────────────────────────

export interface InstalledPlugin {
  name: string
  version: string
  description?: string
  source: 'builtin' | 'npm' | 'local'
  enabled: boolean
  loaded: boolean
  failed: boolean
  essential: boolean
  hasConfigure: boolean
}

export interface MarketplacePlugin {
  name: string
  displayName?: string
  description: string
  npm: string
  version: string
  minCliVersion: string
  category: string
  tags: string[]
  icon: string
  author: string
  verified: boolean
  featured: boolean
  installed: boolean
}

export interface MarketplaceCategory {
  id: string
  name: string
  icon: string
}
```

- [ ] **Step 2: Build to verify types compile**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm build 2>&1 | grep -E "error|Error" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/types.ts
git commit -m "feat(app): add InstalledPlugin and MarketplacePlugin types"
```

---

### Task 2: Add API client methods

**Files:**
- Modify: `src/openacp/api/client.ts`

- [ ] **Step 1: Add plugin methods to createApiClient**

In `src/openacp/api/client.ts`, find the `return {` block at the end of `createApiClient`. Add these methods before the closing `}`:

```ts
    /** List all installed plugins with runtime state */
    async listPlugins(): Promise<{ plugins: import('../types').InstalledPlugin[] }> {
      return api('/plugins')
    },

    /** Fetch marketplace plugins (proxied from registry, with installed flag) */
    async getMarketplace(): Promise<{
      plugins: import('../types').MarketplacePlugin[]
      categories: import('../types').MarketplaceCategory[]
    }> {
      return api('/plugins/marketplace')
    },

    /** Enable a plugin via hot-load */
    async enablePlugin(name: string): Promise<void> {
      await api(`/plugins/${encodeURIComponent(name)}/enable`, { method: 'POST' })
    },

    /** Disable a plugin via hot-unload */
    async disablePlugin(name: string): Promise<void> {
      await api(`/plugins/${encodeURIComponent(name)}/disable`, { method: 'POST' })
    },

    /** Uninstall a plugin (remove from registry + unload) */
    async uninstallPlugin(name: string): Promise<void> {
      await api(`/plugins/${encodeURIComponent(name)}`, { method: 'DELETE' })
    },
```

- [ ] **Step 2: Build to verify**

```bash
pnpm build 2>&1 | grep -E "error|Error" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/api/client.ts
git commit -m "feat(app): add plugin API client methods"
```

---

### Task 3: Create PluginsModal shell

**Files:**
- Create: `src/openacp/components/plugins-modal.tsx`

- [ ] **Step 1: Create modal shell with tabs**

Create `src/openacp/components/plugins-modal.tsx`:

```tsx
import { createSignal, Show } from "solid-js"
import { Dialog } from "@openacp/ui/dialog"
import { Tabs } from "@openacp/ui/tabs"
import { InstalledTab } from "./plugins-installed"
import { MarketplaceTab } from "./plugins-marketplace"
import { useWorkspace } from "../context/workspace"

interface Props {
  open: boolean
  onClose: () => void
}

export function PluginsModal(props: Props) {
  const workspace = useWorkspace()
  const [activeTab, setActiveTab] = createSignal<"installed" | "marketplace">("installed")

  return (
    <Show when={props.open}>
      <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.onClose() }}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content class="w-[720px] max-h-[560px] flex flex-col">
            <Dialog.Header>
              <Dialog.Title>Plugins</Dialog.Title>
              <Dialog.CloseButton />
            </Dialog.Header>

            <Tabs value={activeTab()} onChange={setActiveTab} class="flex flex-col flex-1 min-h-0">
              <Tabs.List class="shrink-0 px-4">
                <Tabs.Trigger value="installed">Installed</Tabs.Trigger>
                <Tabs.Trigger value="marketplace">Marketplace</Tabs.Trigger>
              </Tabs.List>

              <div class="flex-1 min-h-0 overflow-y-auto">
                <Tabs.Content value="installed">
                  <InstalledTab workspace={workspace} />
                </Tabs.Content>
                <Tabs.Content value="marketplace">
                  <MarketplaceTab workspace={workspace} />
                </Tabs.Content>
              </div>
            </Tabs>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </Show>
  )
}
```

- [ ] **Step 2: Build to check for import errors**

```bash
pnpm build 2>&1 | grep -E "error|Error" | head -10
```

Expected: errors about missing `plugins-installed` and `plugins-marketplace` — this is fine, they'll be created next.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/plugins-modal.tsx
git commit -m "feat(app): add PluginsModal shell with tabs"
```

---

### Task 4: Add Plugins button to sidebar

**Files:**
- Modify: `src/openacp/components/sidebar.tsx`

- [ ] **Step 1: Add button and wire modal**

In `src/openacp/components/sidebar.tsx`:

1. Add import at the top:
```ts
import { createSignal } from "solid-js"
import { PluginsModal } from "./plugins-modal"
```

2. Inside `SidebarPanel`, add a signal for modal state:
```ts
const [pluginsOpen, setPluginsOpen] = createSignal(false)
```

3. Change the outer `div`'s `class` to use `flex flex-col` and ensure `overflow-hidden` is kept.

4. Change the session list `div` to add `flex-1` explicitly if not present, and mark it as `min-h-0`.

5. Add the Plugins button and modal AFTER the session list div (before the closing `</div>` of the panel):

```tsx
      {/* Plugins button — fixed bottom */}
      <div class="shrink-0 pt-1 pb-2">
        <button
          class="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-12-medium text-text-base hover:bg-surface-raised-base-hover transition-colors"
          onClick={() => setPluginsOpen(true)}
        >
          <Icon name="puzzle-piece" size="small" class="text-icon-weak" />
          Plugins
        </button>
      </div>

      <PluginsModal open={pluginsOpen()} onClose={() => setPluginsOpen(false)} />
```

- [ ] **Step 2: Build to verify**

```bash
pnpm build 2>&1 | grep -E "error|Error" | head -10
```

Expected: still errors about missing installed/marketplace components — proceed to next task.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/sidebar.tsx
git commit -m "feat(app): add Plugins button to sidebar bottom"
```

---

### Task 5: Create InstalledTab

**Files:**
- Create: `src/openacp/components/plugins-installed.tsx`

- [ ] **Step 1: Create InstalledTab component**

Create `src/openacp/components/plugins-installed.tsx`:

```tsx
import { createResource, createSignal, For, Show } from "solid-js"
import { Icon } from "@openacp/ui/icon"
import { Switch } from "@openacp/ui/switch"
import { Tooltip } from "@openacp/ui/tooltip"
import { Spinner } from "@openacp/ui/spinner"
import { showToast } from "@openacp/ui/toast"
import type { InstalledPlugin } from "../types"
import { useWorkspace } from "../context/workspace"

type WorkspaceCtx = ReturnType<typeof useWorkspace>

interface Props {
  workspace: WorkspaceCtx
}

export function InstalledTab(props: Props) {
  const client = () => props.workspace.client
  const isRemote = () => props.workspace.workspace.type === 'remote'

  const [plugins, { refetch }] = createResource(() => client().listPlugins())
  const [configuringPlugin, setConfiguringPlugin] = createSignal<string | null>(null)
  const [pendingActions, setPendingActions] = createSignal<Set<string>>(new Set())

  function setActionPending(name: string, pending: boolean) {
    setPendingActions(prev => {
      const next = new Set(prev)
      if (pending) next.add(name)
      else next.delete(name)
      return next
    })
  }

  async function handleToggle(plugin: InstalledPlugin) {
    if (pendingActions().has(plugin.name)) return
    setActionPending(plugin.name, true)
    try {
      if (plugin.enabled) {
        await client().disablePlugin(plugin.name)
      } else {
        await client().enablePlugin(plugin.name)
      }
      await refetch()
    } catch (err: any) {
      showToast({ description: err?.message ?? "Action failed", variant: "error" })
    } finally {
      setActionPending(plugin.name, false)
    }
  }

  async function handleUninstall(plugin: InstalledPlugin) {
    if (!confirm(`Uninstall ${plugin.name}? This cannot be undone.`)) return
    setActionPending(plugin.name, true)
    try {
      await client().uninstallPlugin(plugin.name)
      await refetch()
    } catch (err: any) {
      showToast({ description: err?.message ?? "Uninstall failed", variant: "error" })
    } finally {
      setActionPending(plugin.name, false)
    }
  }

  function getConfigureCommand(name: string): string {
    if (isRemote()) return `openacp plugin configure ${name}`
    return `openacp plugin configure ${name} --dir ${props.workspace.directory}`
  }

  function getRestartCommand(): string {
    if (isRemote()) return `openacp restart`
    return `openacp restart --dir ${props.workspace.directory}`
  }

  return (
    <div class="p-4 flex flex-col gap-2">
      <Show when={plugins.loading}>
        <div class="flex justify-center py-8"><Spinner /></div>
      </Show>

      <Show when={plugins.error}>
        <div class="text-text-error text-14-regular text-center py-8">
          Failed to load plugins.
          <button class="underline ml-1" onClick={refetch}>Retry</button>
        </div>
      </Show>

      <For each={plugins()?.plugins}>
        {(plugin) => (
          <div class="border border-border-base rounded-lg p-3 flex flex-col gap-2">
            <div class="flex items-start justify-between gap-2">
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-14-medium text-text-strong truncate">{plugin.name}</span>
                  <span class={`text-11-medium px-1.5 py-0.5 rounded ${plugin.source === 'builtin' ? 'bg-surface-base text-text-weak' : 'bg-blue-500/10 text-blue-500'}`}>
                    {plugin.source === 'builtin' ? 'Built-in' : plugin.source}
                  </span>
                  <Show when={plugin.failed}>
                    <Tooltip value="Plugin failed to start at last boot" placement="top">
                      <span class="text-11-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-500">Failed</span>
                    </Tooltip>
                  </Show>
                  <Show when={!plugin.failed && plugin.loaded}>
                    <span class="text-11-medium text-green-500">● Running</span>
                  </Show>
                  <Show when={!plugin.failed && !plugin.loaded}>
                    <span class="text-11-medium text-text-weak">○ Disabled</span>
                  </Show>
                </div>
                <Show when={plugin.description}>
                  <span class="text-12-regular text-text-weak mt-0.5">{plugin.description}</span>
                </Show>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <Show when={plugin.hasConfigure}>
                  <button
                    class="text-12-medium text-text-base hover:text-text-strong transition-colors"
                    onClick={() => setConfiguringPlugin(prev => prev === plugin.name ? null : plugin.name)}
                  >
                    Configure
                  </button>
                </Show>

                <Show when={plugin.essential} fallback={
                  <Switch
                    checked={plugin.enabled}
                    disabled={pendingActions().has(plugin.name)}
                    onChange={() => handleToggle(plugin)}
                  />
                }>
                  <Tooltip value="Essential plugins cannot be disabled" placement="top">
                    <Switch checked={plugin.enabled} disabled />
                  </Tooltip>
                </Show>

                <Show when={plugin.source !== 'builtin'}>
                  <button
                    class="text-12-medium text-text-error hover:text-red-400 transition-colors disabled:opacity-40"
                    disabled={pendingActions().has(plugin.name)}
                    onClick={() => handleUninstall(plugin)}
                  >
                    Uninstall
                  </button>
                </Show>
              </div>
            </div>

            {/* Configure inline panel */}
            <Show when={configuringPlugin() === plugin.name}>
              <div class="mt-1 p-3 bg-surface-base rounded-md flex flex-col gap-2 border border-border-base">
                <CommandBlock
                  label="Run in your terminal:"
                  command={getConfigureCommand(plugin.name)}
                />
                <CommandBlock
                  label="Restart the server to apply changes:"
                  command={getRestartCommand()}
                />
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}

function CommandBlock(props: { label: string; command: string }) {
  const [copied, setCopied] = createSignal(false)

  async function copy() {
    await navigator.clipboard.writeText(props.command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class="flex flex-col gap-1">
      <span class="text-12-regular text-text-weak">{props.label}</span>
      <div class="flex items-center gap-2 bg-background-stronger rounded px-3 py-2">
        <code class="text-12-regular text-text-strong flex-1 font-mono">{props.command}</code>
        <button
          class="text-11-medium text-text-weak hover:text-text-base transition-colors shrink-0"
          onClick={copy}
        >
          {copied() ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build to verify**

```bash
pnpm build 2>&1 | grep -E "error|Error" | head -10
```

Expected: no errors (or only missing MarketplaceTab).

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/plugins-installed.tsx
git commit -m "feat(app): add InstalledTab with enable/disable/uninstall/configure"
```

---

### Task 6: Create MarketplaceTab with install flow

**Files:**
- Create: `src/openacp/components/plugins-marketplace.tsx`

- [ ] **Step 1: Create MarketplaceTab component**

Create `src/openacp/components/plugins-marketplace.tsx`:

```tsx
import { createResource, createSignal, For, Show, onCleanup } from "solid-js"
import { Spinner } from "@openacp/ui/spinner"
import { showToast } from "@openacp/ui/toast"
import type { MarketplacePlugin } from "../types"
import { useWorkspace } from "../context/workspace"

type WorkspaceCtx = ReturnType<typeof useWorkspace>

interface Props {
  workspace: WorkspaceCtx
}

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export function MarketplaceTab(props: Props) {
  const client = () => props.workspace.client
  const isRemote = () => props.workspace.workspace.type === 'remote'

  const [marketplace, { refetch: refetchMarketplace }] = createResource(
    () => client().getMarketplace()
  )
  const [search, setSearch] = createSignal("")
  const [installingPlugin, setInstallingPlugin] = createSignal<MarketplacePlugin | null>(null)
  const [pollTimedOut, setPollTimedOut] = createSignal(false)

  // Polling state — cleared on unmount
  let pollInterval: ReturnType<typeof setInterval> | null = null
  let pollTimeoutHandle: ReturnType<typeof setTimeout> | null = null

  onCleanup(() => {
    if (pollInterval) clearInterval(pollInterval)
    if (pollTimeoutHandle) clearTimeout(pollTimeoutHandle)
  })

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
    if (pollTimeoutHandle) { clearTimeout(pollTimeoutHandle); pollTimeoutHandle = null }
  }

  function startPolling(pluginName: string) {
    setPollTimedOut(false)

    pollInterval = setInterval(async () => {
      try {
        const result = await client().listPlugins()
        const found = result.plugins.some(p => p.name === pluginName)
        if (found) {
          stopPolling()
          showToast({ description: `Plugin installed! Please restart the server.`, variant: "success" })
          await refetchMarketplace()
        }
      } catch {
        // silently ignore poll errors
      }
    }, POLL_INTERVAL_MS)

    pollTimeoutHandle = setTimeout(() => {
      stopPolling()
      setPollTimedOut(true)
    }, POLL_TIMEOUT_MS)
  }

  function handleInstall(plugin: MarketplacePlugin) {
    setInstallingPlugin(plugin)
    startPolling(plugin.name)
  }

  function handleManualRefresh() {
    setPollTimedOut(false)
    refetchMarketplace()
  }

  function getInstallCommand(plugin: MarketplacePlugin): string {
    if (isRemote()) return `openacp plugin install ${plugin.npm}`
    return `openacp plugin install ${plugin.npm} --dir ${props.workspace.directory}`
  }

  function getRestartCommand(): string {
    if (isRemote()) return `openacp restart`
    return `openacp restart --dir ${props.workspace.directory}`
  }

  const filtered = () => {
    const q = search().toLowerCase()
    const plugins = marketplace()?.plugins ?? []
    if (!q) return plugins
    return plugins.filter(p => {
      const text = `${p.name} ${p.displayName ?? ''} ${p.description} ${(p.tags ?? []).join(' ')}`.toLowerCase()
      return text.includes(q)
    })
  }

  return (
    <div class="p-4 flex flex-col gap-4">
      {/* Install flow inline panel */}
      <Show when={installingPlugin()}>
        {(plugin) => (
          <div class="border border-border-base rounded-lg p-4 flex flex-col gap-3 bg-surface-base">
            <div class="flex items-center justify-between">
              <span class="text-14-medium text-text-strong">Installing {plugin().displayName ?? plugin().name}</span>
              <button
                class="text-12-regular text-text-weak hover:text-text-base"
                onClick={() => { stopPolling(); setInstallingPlugin(null) }}
              >
                Close
              </button>
            </div>

            <CommandBlock label="Run in your terminal:" command={getInstallCommand(plugin())} />
            <CommandBlock label="After install completes, restart the server:" command={getRestartCommand()} />

            <Show when={isRemote()}>
              <p class="text-12-regular text-text-weak italic">
                Run this on the machine hosting the server.
              </p>
            </Show>

            <div class="flex items-center gap-2 text-12-regular text-text-weak">
              <Show when={!pollTimedOut()} fallback={
                <span>
                  Install not detected. Did the command complete successfully?{' '}
                  <button class="underline text-text-base" onClick={handleManualRefresh}>Refresh</button>
                </span>
              }>
                <Spinner class="size-3" />
                <span>Waiting for install to complete…</span>
              </Show>
            </div>
          </div>
        )}
      </Show>

      {/* Search */}
      <input
        type="search"
        placeholder="Search plugins…"
        value={search()}
        onInput={(e) => setSearch(e.currentTarget.value)}
        class="w-full px-3 py-1.5 rounded-md border border-border-base bg-background-base text-14-regular text-text-strong placeholder:text-text-weak focus:outline-none focus:ring-2 focus:ring-border-focus"
      />

      <Show when={marketplace.loading}>
        <div class="flex justify-center py-8"><Spinner /></div>
      </Show>

      <Show when={marketplace.error}>
        <div class="text-text-error text-14-regular text-center py-8 flex flex-col items-center gap-2">
          <span>Marketplace unavailable</span>
          <button
            class="text-12-medium text-text-base border border-border-base rounded px-3 py-1 hover:bg-surface-raised-base-hover"
            onClick={refetchMarketplace}
          >
            Retry
          </button>
        </div>
      </Show>

      <For each={filtered()}>
        {(plugin) => (
          <div class="border border-border-base rounded-lg p-3 flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
              <span class="text-2xl shrink-0 mt-0.5">{plugin.icon}</span>
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-14-medium text-text-strong">{plugin.displayName ?? plugin.name}</span>
                  <Show when={plugin.verified}>
                    <span class="text-11-medium text-green-500">✓ Verified</span>
                  </Show>
                  <Show when={!plugin.verified}>
                    <span class="text-11-medium text-yellow-500">⚠ Unverified</span>
                  </Show>
                  <Show when={plugin.minCliVersion}>
                    <span class="text-11-medium text-text-weak">Requires OpenACP v{plugin.minCliVersion}</span>
                  </Show>
                </div>
                <span class="text-12-regular text-text-weak mt-0.5">{plugin.description}</span>
                <span class="text-11-regular text-text-weak mt-1">by {plugin.author} · {plugin.category}</span>
              </div>
            </div>

            <div class="shrink-0">
              <Show when={plugin.installed} fallback={
                <button
                  class="text-12-medium px-3 py-1.5 rounded-md border border-border-base hover:bg-surface-raised-base-hover transition-colors"
                  onClick={() => handleInstall(plugin)}
                >
                  Install
                </button>
              }>
                <span class="text-12-medium text-green-500">Installed ✓</span>
              </Show>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

function CommandBlock(props: { label: string; command: string }) {
  const [copied, setCopied] = createSignal(false)

  async function copy() {
    await navigator.clipboard.writeText(props.command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class="flex flex-col gap-1">
      <span class="text-12-regular text-text-weak">{props.label}</span>
      <div class="flex items-center gap-2 bg-background-stronger rounded px-3 py-2">
        <code class="text-12-regular text-text-strong flex-1 font-mono">{props.command}</code>
        <button
          class="text-11-medium text-text-weak hover:text-text-base transition-colors shrink-0"
          onClick={copy}
        >
          {copied() ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
pnpm build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/plugins-marketplace.tsx
git commit -m "feat(app): add MarketplaceTab with install flow and polling"
```

---

### Task 7: Verify WorkspaceContext field access

`InstalledTab` and `MarketplaceTab` use `props.workspace.directory`, `props.workspace.workspace.type`, and `props.workspace.client`. Verify these fields exist on the context before running a full build.

**Files:**
- Read: `src/openacp/context/workspace.tsx`

- [ ] **Step 1: Check WorkspaceContext exports**

```bash
grep -n "directory\|workspace\b\|client\b\|export\|return " /Users/lucas/code/openacp-workspace/OpenACP-App/src/openacp/context/workspace.tsx | head -30
```

Confirm:
- `directory: string` is returned from `useWorkspace()` (the workspace root path)
- `workspace` (a `WorkspaceEntry` with a `.type` field) is returned
- `client` (an `ApiClient`) is returned

If any field is missing, add it to the context return value in `src/openacp/context/workspace.tsx`. No new fields are expected to be needed based on the existing architecture.

- [ ] **Step 2: Full build**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit any fixes**

Only commit if changes were needed:

```bash
git add src/openacp/context/workspace.tsx
git commit -m "feat(app): expose workspace context fields for plugin components"
```

---

### Task 8: Manual verification

- [ ] **Step 1: Start dev app**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm tauri dev
```

- [ ] **Step 2: Verify sidebar button**

Connect to a local workspace. Confirm "Plugins" button appears at the bottom of the sidebar, below the session list. Confirm it doesn't scroll with the list.

- [ ] **Step 3: Verify Installed tab**

Click Plugins. Confirm:
- Installed tab is default active.
- Plugins list loads (spinner, then list).
- Built-in plugins show "Built-in" badge.
- Telegram shows as running (green dot) if server is running.
- Essential plugins have toggle disabled with tooltip.
- Non-builtin plugins show Uninstall button.
- Plugins with `hasConfigure: true` show Configure button.
- Clicking Configure expands the inline panel with copy-able commands.

- [ ] **Step 4: Verify enable/disable**

Disable a non-essential builtin plugin (e.g. `@openacp/context`). Confirm:
- Toggle shows spinner while in flight.
- Plugin shows as disabled after success.
- Re-enable it and confirm it shows as Running.

- [ ] **Step 5: Verify Marketplace tab**

Switch to Marketplace tab. Confirm:
- Search input works (filters by name/description).
- Already-installed plugins show "Installed ✓" with disabled Install button.
- Verified plugins show "✓ Verified".
- Clicking Install shows the inline panel with both commands and polling spinner.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(app): plugins modal complete — installed and marketplace tabs"
```
