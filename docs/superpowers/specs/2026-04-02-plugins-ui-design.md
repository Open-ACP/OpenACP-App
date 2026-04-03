# Plugins UI Design

## Overview

Add a "Plugins" button at the bottom of the sidebar in `SidebarPanel`. Clicking it opens a
modal dialog with two tabs: "Installed" (all plugins for the current workspace) and
"Marketplace" (plugins available to install). Users can enable/disable/uninstall plugins
directly in the app, and get CLI commands for install/configure actions that require an
interactive terminal wizard.

## Framework Notes

This codebase uses **SolidJS**, not React. All new components must use:
- `createSignal` for local state
- `createResource` for async data fetching
- `createEffect`, `onCleanup` for side effects and cleanup
- `Show`, `For`, `Switch/Match` for conditional/list rendering
- `createStore` for complex state

## Entry Point: Sidebar Button

In `SidebarPanel` (`src/openacp/components/sidebar.tsx`), add a fixed bottom section that
sits outside the scrollable session list div.

```
┌─────────────────────┐
│  Session list       │  ← flex-1, overflow-y-auto
│  ...                │
├─────────────────────┤
│  🧩 Plugins         │  ← shrink-0, always visible
└─────────────────────┘
```

Uses a plain button (matching the sidebar's style) with puzzle-piece icon and "Plugins" label.
A `createSignal<boolean>(false)` controls modal open state.

## Modal Structure

Uses the existing `Dialog` component (`@openacp/ui/dialog`). Approximate size: 720×560px.

Two tabs via the existing `Tabs` component (`@openacp/ui/tabs`):
- **Installed** — default active tab
- **Marketplace**

### Tab: Installed

Fetches `GET /plugins` via `createResource`. Groups: builtin plugins first, then npm/local.

Each plugin row:
```
[icon] Plugin Name          [Built-in | npm]  [● Running | ○ Disabled | ✕ Failed]
       Short description                       [Configure]  [● toggle]  [Uninstall?]
```

- **source badge**: "Built-in" (muted) or "npm" (blue)
- **status badge**: "Running" (green dot), "Disabled" (gray), "Failed" (red — tooltip on hover shows boot error via `GET /plugins` failed state)
- **Configure button**: shown only if `hasConfigure: true`. Replaces the row content with the
  inline configure panel (see Configure Flow). Hidden if `hasConfigure: false`.
- **Enable/disable toggle**: `createSignal` for optimistic state. Calls `POST /plugins/:name/enable`
  or `POST /plugins/:name/disable`. Shows spinner while in-flight. On API error, reverts optimistic
  state and shows error toast.
- **Uninstall button**: shown only if `source !== 'builtin'`. On click, shows confirmation dialog
  ("Uninstall @openacp/translator? This cannot be undone."). On confirm, calls
  `DELETE /plugins/:name` and refreshes list.
- **Essential plugins** (`essential: true`): toggle is disabled with tooltip "Essential plugins
  cannot be disabled". No uninstall button.

### Tab: Marketplace

Fetches `GET /plugins/marketplace` via `createResource`. Renders a search input; filtering is
client-side across `name`, `displayName`, `description`, and `tags`.

Each plugin card:
```
[icon] Plugin Name          [✓ Verified]
       Short description     [Install]  or  [Installed ✓]
       by author · category
```

- Already installed plugins: Install button replaced with "Installed ✓" (disabled).
- `verified: false`: show "⚠ Unverified" badge.
- `minCliVersion` higher than current server version: show "Requires OpenACP vX.X.X" warning,
  Install button disabled. Server version is available from `workspace.server.version`.
- Fetch error (503 from API or network failure): show empty state "Marketplace unavailable" with
  a "Retry" button that re-triggers the resource.

## Install Flow

When user clicks "Install" on a marketplace plugin:

1. The modal content slides to an install panel showing:
   ```
   Run in your terminal:

     openacp plugin install @openacp/translator --dir /workspace/path

   After install completes, restart the server:

     openacp restart --dir /workspace/path
   ```
   Each command has an individual "Copy" button.

2. App begins polling `GET /plugins` every 3 seconds using `setInterval`.
   `onCleanup` cancels the interval when the component unmounts or the modal closes.

3. When the plugin appears in the list:
   - Clear the interval.
   - Show toast: "Plugin installed! Please restart the server."
   - Refetch the Installed tab resource.

4. Polling timeout: if the plugin is not detected after 5 minutes, clear the interval and show
   "Install not detected. Did the command complete successfully?" with a manual "Refresh" button.

**Command generation rules:**
- Local workspace: include `--dir <workspace.directory>`.
- Global instance (workspace.directory === homedir): omit `--dir` (default instance).
- Remote workspace (`workspace.type === 'remote'`): omit `--dir`, add note "Run this on the
  machine hosting the server."

## Configure Flow

When user clicks "Configure" on an installed plugin, the plugin row expands inline showing:

```
Run in your terminal:

  openacp plugin configure @openacp/telegram --dir /workspace/path

Restart the server to apply changes:

  openacp restart --dir /workspace/path
```

Each command has a "Copy" button. A "Close" button collapses the panel. No polling, no
hot-reload — the user manages the restart manually.

Same command generation rules as Install Flow for `--dir` flag.

## API Client

Add plugin methods to `createApiClient` in `src/openacp/api/client.ts`:

```ts
async listPlugins(): Promise<{ plugins: InstalledPlugin[] }>
async getMarketplace(): Promise<{ plugins: MarketplacePlugin[]; categories: MarketplaceCategory[] }>
async enablePlugin(name: string): Promise<void>
async disablePlugin(name: string): Promise<void>
async uninstallPlugin(name: string): Promise<void>
```

## New Types

Add to `src/openacp/types.ts`:

```ts
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

## New Files

- `src/openacp/components/plugins-modal.tsx` — modal shell with tab state
- `src/openacp/components/plugins-installed.tsx` — Installed tab, plugin rows, enable/disable/uninstall
- `src/openacp/components/plugins-marketplace.tsx` — Marketplace tab, search, install flow

## Edge Cases

| Scenario | Behavior |
|---|---|
| Enable plugin that previously failed | API re-attempts `boot()`, returns 500 if still fails; app shows error toast |
| Disable essential plugin | API returns 409, app shows error toast, toggle reverts to enabled |
| Uninstall builtin plugin | Uninstall button not rendered (source === 'builtin') |
| Marketplace fetch fails | Show empty state with Retry button |
| Plugin `minCliVersion` too high | Warning badge on card, Install button disabled |
| Polling times out (5 min) | Stop polling, show manual Refresh prompt |
| Modal closes during polling | `onCleanup` cancels the interval |
| Remote workspace | Show command without `--dir`, add host note |
| Global instance (homedir) | Show command without `--dir` |
| Multiple actions in flight on same row | Disable all action buttons on that row while any request is pending |
| npm plugin enable fails (bad module) | API returns 500 with "Try restarting the server", app shows error toast |
