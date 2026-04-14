# Remote Identity Claim — App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the remote workspace connect flow to claim identity on first connect and silently re-link identity on reconnect, using `identitySecret` returned by the server.

**Architecture:** `WorkspaceEntry` gains an `identitySecret` field. `RemoteTab` detects reconnect (same workspaceId already in store), attempts silent re-link via `/identity/setup`, and shows an identity form only on first connect. `AddWorkspaceModal` passes the full `existingWorkspaces` array down so `RemoteTab` can match by workspaceId.

**Tech Stack:** TypeScript, React, Tauri Store

**Spec:** `docs/superpowers/specs/2026-04-14-remote-identity-claim-design.md`

**Prerequisite:** Server plan (`OpenACP`) tasks 1–4 must be deployed before end-to-end testing.

---

## File Map

| File | Change |
|---|---|
| `src/openacp/api/workspace-store.ts` | Add `identitySecret?: string` to `WorkspaceEntry` |
| `src/openacp/api/client.ts` | Add `setupIdentity()` method |
| `src/openacp/components/add-workspace/index.tsx` | Change `existingIds: string[]` prop to `existingWorkspaces: WorkspaceEntry[]` |
| `src/openacp/app.tsx` | Pass `workspaces` instead of `workspaces.map(w => w.id)` |
| `src/openacp/components/add-workspace/remote-tab.tsx` | Full UI update: identity section, reconnect detection, state machine |

---

## Task 1: Add `identitySecret` to `WorkspaceEntry` and `setupIdentity()` to API client

**Files:**
- Modify: `src/openacp/api/workspace-store.ts`
- Modify: `src/openacp/api/client.ts`

- [ ] **Step 1: Add `identitySecret` to `WorkspaceEntry`**

In `src/openacp/api/workspace-store.ts`, add the field after `refreshDeadline`:

```typescript
export interface WorkspaceEntry {
  id: string               // instance id — primary key, immutable
  name: string             // display name
  directory: string        // absolute path to project folder (parent of .openacp)
  type: 'local' | 'remote'
  // Remote only:
  host?: string            // current tunnel/remote host URL (mutable, updated on reconnect)
  tokenId?: string         // JWT token id (for reference/revocation)
  role?: string            // token role
  expiresAt?: string       // JWT expiry ISO 8601
  refreshDeadline?: string // JWT refresh deadline ISO 8601
  /**
   * Per-token secret for identity re-linking on reconnect.
   * Returned by the server at exchange time, stored here (not in keychain)
   * because it does not grant API access on its own.
   */
  identitySecret?: string
  // Enhanced rail fields (all optional for backwards compat):
  lastActiveAt?: string    // ISO 8601, updated on workspace switch
  pinned?: boolean         // pinned to top of rail
  sortOrder?: number       // manual drag order (undefined = auto-sort by recency)
  customName?: string      // user-defined display name, overrides folder name
}
```

- [ ] **Step 2: Add `setupIdentity()` to `client.ts`**

In `src/openacp/api/client.ts`, add after the `me()` method:

```typescript
/**
 * Claims or re-links an identity for the current JWT token.
 *
 * Three server-side paths (handled transparently):
 * - identitySecret: re-links new token to existing user (silent reconnect).
 * - displayName: creates new user (first-time setup).
 * - linkCode: links to existing user via multi-device code (not used here).
 *
 * Throws on non-2xx responses. Callers should handle:
 * - 401 — invalid identitySecret (fallback to first-time form)
 * - 409 — username already taken (show inline error)
 * - 404/5xx — identity plugin not available (proceed silently)
 */
async setupIdentity(opts: {
  displayName?: string
  username?: string
  identitySecret?: string
}): Promise<{ userId: string; displayName: string; username?: string }> {
  return api('/identity/setup', {
    method: 'POST',
    body: JSON.stringify(opts),
  })
},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build 2>&1 | head -30
```

Expected: PASS (field is optional, no breaking changes).

- [ ] **Step 4: Commit**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add src/openacp/api/workspace-store.ts src/openacp/api/client.ts
git commit -m "feat(remote): add identitySecret to WorkspaceEntry and setupIdentity to API client"
```

---

## Task 2: Pass `existingWorkspaces` through `AddWorkspaceModal` to `RemoteTab`

**Files:**
- Modify: `src/openacp/components/add-workspace/index.tsx`
- Modify: `src/openacp/app.tsx`

- [ ] **Step 1: Update `AddWorkspaceModal` props**

In `src/openacp/components/add-workspace/index.tsx`:

Replace:
```typescript
import type { WorkspaceEntry } from "../../api/workspace-store";
```
(already imported — no change needed)

Update the props interface:
```typescript
interface AddWorkspaceModalProps {
  onAdd: (entry: WorkspaceEntry) => void;
  onSetup?: (path: string, instanceId: string, instanceName?: string) => void;
  onClose: () => void;
  existingWorkspaces: WorkspaceEntry[];   // ← was existingIds: string[]
  defaultTab?: "local" | "remote";
}
```

Inside the component body, derive `existingIds` for `LocalTab` from `existingWorkspaces`:
```typescript
export function AddWorkspaceModal(props: AddWorkspaceModalProps) {
  const [tab, setTab] = useState<"local" | "remote">(
    props.defaultTab ?? "local",
  );
  const existingIds = props.existingWorkspaces.map(w => w.id);
  // ...
```

Update the `RemoteTab` render call to pass `existingWorkspaces`:
```typescript
<RemoteTab onAdd={props.onAdd} existingWorkspaces={props.existingWorkspaces} />
```

`LocalTab` keeps receiving `existingIds={existingIds}` (derived above) — no change to LocalTab.

- [ ] **Step 2: Update `app.tsx` to pass `workspaces` instead of IDs**

In `src/openacp/app.tsx`, find the `<AddWorkspaceModal>` render and change:
```typescript
// Before:
existingIds={workspaces.map((w) => w.id)}

// After:
existingWorkspaces={workspaces}
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build 2>&1 | head -30
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add src/openacp/components/add-workspace/index.tsx src/openacp/app.tsx
git commit -m "feat(remote): pass existingWorkspaces through AddWorkspaceModal to RemoteTab"
```

---

## Task 3: Update `RemoteTab` — identity section, reconnect detection, state machine

**Files:**
- Modify: `src/openacp/components/add-workspace/remote-tab.tsx`

This is the main UI change. The component gains:
- An identity section (display name + username inputs) shown on first connect
- Silent re-link logic during the connecting phase for reconnects
- Reconnect variant of the confirmation screen

- [ ] **Step 1: Implement the updated `RemoteTab`**

Replace the full content of `src/openacp/components/add-workspace/remote-tab.tsx`:

```typescript
import React, { useState } from 'react'
import type { WorkspaceEntry } from '../../api/workspace-store'
import { createApiClient } from '../../api/client'

interface ConnectionPreview {
  host: string
  accessToken: string
  tokenId: string
  expiresAt: string
  refreshDeadline: string
  identitySecret: string
  role: string
  scopes: string[]
  workspaceId: string
  workspaceName: string
  workspaceDirectory: string
  /** True when workspaceId already exists in store and silent re-link succeeded. */
  isReconnect: boolean
  /** Display name of re-linked user — shown in reconnect confirmation. */
  existingDisplayName?: string
}

function parseLink(input: string): { host: string; code: string } | null {
  try {
    if (input.startsWith('openacp://connect')) {
      const params = new URLSearchParams(input.replace('openacp://connect?', ''))
      const rawHost = params.get('host'); const code = params.get('code')
      if (!rawHost || !code) return null
      const normalizedHost = rawHost.startsWith('http://') || rawHost.startsWith('https://') ? rawHost : `https://${rawHost}`
      return { host: normalizedHost, code }
    }
    const url = new URL(input); const code = url.searchParams.get('code')
    if (!code) return null
    return { host: `${url.protocol}//${url.host}`, code }
  } catch { return null }
}

async function connectWithCode(
  host: string,
  code: string,
  existingWorkspaces: WorkspaceEntry[],
): Promise<ConnectionPreview> {
  // Step 1: exchange one-time code for JWT + identitySecret
  const exchangeRes = await fetch(`${host}/api/v1/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!exchangeRes.ok) {
    const err = await exchangeRes.json().catch(() => ({}))
    throw new Error((err as any)?.error?.message ?? exchangeRes.statusText)
  }
  const { accessToken, tokenId, expiresAt, refreshDeadline, identitySecret } = await exchangeRes.json()

  // Step 2: fetch workspace info and role
  const wsRes = await fetch(`${host}/api/v1/workspace`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!wsRes.ok) throw new Error('Failed to fetch workspace info')
  const ws = await wsRes.json()

  let role = 'user'; let scopes: string[] = []
  try {
    const meRes = await fetch(`${host}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (meRes.ok) { const me = await meRes.json(); role = me.role ?? 'user'; scopes = me.scopes ?? [] }
  } catch {}

  // Step 3: detect reconnect — workspaceId already in store with an identitySecret
  const existingEntry = existingWorkspaces.find(e => e.id === ws.id)
  let isReconnect = false
  let existingDisplayName: string | undefined

  if (existingEntry?.identitySecret) {
    // Attempt silent re-link using the old token's identitySecret
    try {
      const tempClient = createApiClient({ url: host, token: accessToken })
      const user = await tempClient.setupIdentity({ identitySecret: existingEntry.identitySecret })
      isReconnect = true
      existingDisplayName = user.displayName
    } catch {
      // 401: old secret not recognized → fall through to first-time form
      // 404/5xx: identity plugin not available → proceed without identity
    }
  }

  return {
    host, accessToken, tokenId, expiresAt, refreshDeadline, identitySecret,
    role, scopes, workspaceId: ws.id, workspaceName: ws.name,
    workspaceDirectory: ws.directory, isReconnect, existingDisplayName,
  }
}

export function RemoteTab(props: {
  onAdd: (entry: WorkspaceEntry) => void
  existingWorkspaces: WorkspaceEntry[]
}) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ConnectionPreview | null>(null)
  const [saving, setSaving] = useState(false)
  // Identity form fields (first-time connect only)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)

  async function handleConnect() {
    setError(null)
    const parsed = parseLink(input.trim())
    if (!parsed) { setError('Invalid link. Paste an openacp:// or https:// invite link.'); return }
    setLoading(true)
    try {
      setPreview(await connectWithCode(parsed.host, parsed.code, props.existingWorkspaces))
    } catch (e: any) {
      setError(e.message ?? 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    const p = preview; if (!p) return
    setSaving(true); setUsernameError(null)

    try {
      // First-time: claim identity before saving workspace
      if (!p.isReconnect) {
        const res = await fetch(`${p.host}/api/v1/identity/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.accessToken}` },
          body: JSON.stringify({
            displayName: displayName.trim(),
            ...(username.trim() && { username: username.trim().replace(/^@/, '') }),
          }),
        })
        if (res.status === 409) {
          setUsernameError('Username already taken')
          setSaving(false)
          return
        }
        // 404 (identity plugin not installed) or 5xx — proceed silently
      }

      // Save JWT to keychain
      const { setKeychainToken } = await import('../../api/keychain.js')
      await setKeychainToken(p.workspaceId, p.accessToken)

      // upsertWorkspace in onAdd handles both new entry and reconnect update
      props.onAdd({
        id: p.workspaceId,
        name: p.workspaceName,
        directory: p.workspaceDirectory,
        type: 'remote',
        host: p.host,
        tokenId: p.tokenId,
        role: p.role,
        expiresAt: p.expiresAt,
        refreshDeadline: p.refreshDeadline,
        identitySecret: p.identitySecret,
      })
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Input screen
  if (!preview) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground mb-1">Connect to a remote workspace</p>
          <p className="text-xs text-muted-foreground">
            Run <code className="font-mono bg-secondary px-1 py-0.5 rounded text-fg-weak text-xs">openacp remote</code> on the remote machine, then paste the invite link.
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Invite link</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="openacp://connect?host=...&code=..."
            rows={3}
            className="w-full rounded-lg border border-border-weak bg-card px-3 py-2 font-mono text-xs text-foreground resize-none outline-none focus:border-foreground/30 placeholder:text-muted-foreground transition-colors"
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          onClick={handleConnect}
          disabled={loading || !input.trim()}
          className="w-full h-9 rounded-lg bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    )
  }

  // Confirmation screen
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground mb-1">Connection successful</p>
        <p className="text-xs text-muted-foreground">
          {preview.isReconnect ? 'Reconnecting your existing workspace.' : 'Review details before adding.'}
        </p>
      </div>

      {/* Workspace info */}
      <div className="rounded-lg border border-border-weak overflow-hidden">
        <div className="flex justify-between items-center px-3 py-2.5">
          <span className="text-xs text-muted-foreground">Workspace</span>
          <span className="text-sm font-medium text-foreground">{preview.workspaceName}</span>
        </div>
        <div className="border-t border-border-weak" />
        <div className="flex justify-between items-center px-3 py-2.5">
          <span className="text-xs text-muted-foreground">Server</span>
          <span className="text-xs text-fg-weak font-mono truncate max-w-48">{preview.host.replace(/^https?:\/\//, '')}</span>
        </div>
        <div className="border-t border-border-weak" />
        <div className="flex justify-between items-center px-3 py-2.5">
          <span className="text-xs text-muted-foreground">Access</span>
          <span className="text-xs text-fg-weak capitalize">{preview.role}</span>
        </div>
        <div className="border-t border-border-weak" />
        <div className="flex justify-between items-center px-3 py-2.5">
          <span className="text-xs text-muted-foreground">Expires</span>
          <span className="text-xs text-fg-weak">{new Date(preview.expiresAt).toLocaleString()}</span>
        </div>
      </div>

      {/* Identity section — first-time only */}
      {!preview.isReconnect && (
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your identity</p>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Lucas Chen"
              className="w-full rounded-lg border border-border-weak bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30 placeholder:text-muted-foreground transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Username <span className="text-muted-foreground/60">(optional)</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">@</span>
              <input
                value={username}
                onChange={(e) => { setUsername(e.target.value); setUsernameError(null) }}
                placeholder="lucas"
                className="w-full rounded-lg border border-border-weak bg-card pl-7 pr-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30 placeholder:text-muted-foreground transition-colors"
              />
            </div>
            {usernameError && <p className="text-xs text-destructive mt-1">{usernameError}</p>}
          </div>
        </div>
      )}

      {/* Reconnect identity hint */}
      {preview.isReconnect && preview.existingDisplayName && (
        <p className="text-xs text-muted-foreground">
          Reconnecting as <span className="text-foreground font-medium">{preview.existingDisplayName}</span>
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => { setPreview(null); setError(null); setDisplayName(''); setUsername('') }}
          className="h-9 px-4 rounded-lg border border-border-weak text-sm font-medium text-fg-weak hover:bg-accent transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving || (!preview.isReconnect && !displayName.trim())}
          className="flex-1 h-9 rounded-lg bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          {saving ? 'Saving...' : preview.isReconnect ? 'Reconnect' : 'Add workspace'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build 2>&1 | head -40
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Manual smoke test — first-time connect**

Start a local OpenACP server with identity plugin enabled. Generate an invite code:
```bash
openacp remote
```

In the App:
1. Open "Add workspace" → Remote tab
2. Paste the invite link → click Connect
3. Verify: confirmation screen shows workspace info + "Your identity" section
4. Fill display name + optional username → click "Add workspace"
5. Verify: workspace appears in list, connected

- [ ] **Step 4: Manual smoke test — reconnect**

With the workspace already added (from step 3):
1. Generate a new invite link (simulate token expiry): `openacp remote`
2. Open "Add workspace" → Remote tab
3. Paste new invite link → click Connect
4. Verify: confirmation screen shows "Reconnecting your existing workspace." + "Reconnecting as [name]" hint (no identity form)
5. Click "Reconnect"
6. Verify: existing workspace entry updated (not duplicated)

- [ ] **Step 5: Commit**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add src/openacp/components/add-workspace/remote-tab.tsx
git commit -m "feat(remote): identity claim on first connect, silent re-link on reconnect

First-time: mandatory display name + optional username form shown before
adding workspace. Reconnect: App silently re-links identity using stored
identitySecret, no user input required. Falls back to first-time form if
identitySecret is no longer valid."
```
