# Remote Identity Claim — App Design

**Date:** 2026-04-14
**Scope:** App (`remote-tab.tsx`, `client.ts`, `workspace-store.ts`)

## Problem

After connecting to a remote workspace, the JWT token has no linked identity on the server. Tokens are anonymous — the server admin cannot see who has access, and conversation history has no owner. Additionally, when a user reconnects with a new invite link (after refresh deadline), the server creates a new anonymous identity disconnected from the old one.

## Goals

1. **Mandatory identity claim** on first connect — user must provide display name + optional username before the workspace is added.
2. **Automatic re-linking** on reconnect — App silently links the new token to the old identity using the stored `identitySecret`. No UI required.
3. **Graceful fallback** — if the old secret is no longer valid, fall back to the first-time identity claim flow.

## Security Note: `identitySecret` vs `tokenId`

Re-linking uses a dedicated `identitySecret` field, **not** the `tokenId`. The reason: `tokenId` equals the JWT's `sub` claim — JWT payloads are base64-encoded and readable by anyone who has the token. `identitySecret` is a separate random hex string generated at token creation time, never embedded in the JWT, and only returned once at exchange time. It is stored in the App's keychain and is unguessable by anyone who only has the JWT.

## Flows

### Flow 1: First-time connect

1. User pastes invite link → clicks **Connect**
2. App calls `POST /auth/exchange` → receives `{ accessToken, tokenId, expiresAt, refreshDeadline, identitySecret }`
3. App calls `GET /workspace`, `GET /auth/me` → workspace info + role
4. App checks `workspaceStore`: workspaceId is **not** in store → first-time path
5. Confirmation screen shows workspace info + identity section (display name + username inputs)
6. User fills display name (required), username (optional) → clicks **Add workspace**
7. App calls `POST /identity/setup { displayName, username }` (authenticated with new JWT)
8. App stores workspace entry (including `identitySecret`) + saves JWT to keychain → done

### Flow 2: Reconnect (refresh deadline exceeded, new invite link)

1. User pastes new invite link → clicks **Connect**
2. App calls `POST /auth/exchange` → new `{ accessToken, tokenId, identitySecret (new) }`
3. App checks `workspaceStore`: workspaceId **already exists** → reconnect path
4. App calls `POST /identity/setup { identitySecret: existing.identitySecret }` silently (no UI)
   - Uses the **old** `identitySecret` from existing `WorkspaceEntry`
5. Server looks up token by `identitySecret` → finds userId → links new token to same userId
6. Confirmation screen shows workspace info only (no identity section), with hint "Reconnecting as [name]"
7. User clicks **Reconnect** → App updates existing `WorkspaceEntry` (replaces `tokenId`, `expiresAt`, `refreshDeadline`, `host`, `identitySecret` with new values) → done

**Fallback:** If step 4 returns 401 (secret not recognized or token purged) → show identity section as in Flow 1.

### Flow 3: Normal token refresh (within 7-day deadline)

Silent background refresh. No changes, no UI.

## UI: Confirmation Screen

### First-time variant

```
Connection successful
Review details before adding.

┌─────────────────────────────────────┐
│ Workspace    "Lucas's Dev"          │
├─────────────────────────────────────┤
│ Server       tunnel.example.com     │
├─────────────────────────────────────┤
│ Access       admin                  │
├─────────────────────────────────────┤
│ Expires      Apr 21, 2026           │
└─────────────────────────────────────┘

YOUR IDENTITY
Display name  [                    ]  ← required
Username      [@ (optional)        ]  ← optional

[Back]                 [Add workspace]  ← disabled if displayName empty
```

### Reconnect variant

```
Connection successful
Reconnecting your existing workspace.

┌─────────────────────────────────────┐
│ Workspace    "Lucas's Dev"          │
├─────────────────────────────────────┤
│ Server       tunnel.example.com     │
├─────────────────────────────────────┤
│ Access       admin                  │
├─────────────────────────────────────┤
│ Expires      Apr 21, 2026           │
└─────────────────────────────────────┘

Reconnecting as Lucas Chen            ← fetched from /identity/setup response

[Back]                    [Reconnect]
```

## State Machine

```
idle
  → connecting (after [Connect] click)
      → preview_firsttime (workspaceId not in store)
          → saving → done
      → reconnecting_silent (workspaceId in store, calling /identity/setup with identitySecret)
          → preview_reconnect (success) → saving → done
          → preview_firsttime (fallback: 401 from /identity/setup)
              → saving → done
      → error (exchange failed)
```

## Validation

| Field        | Rule                                                              |
|---|---|
| Display name | Required; min 1 char after trim; max 200 chars                   |
| Username     | Optional; if provided: `^[a-zA-Z0-9_.-]+$`; server returns 409 if taken → inline error |

## Component Changes

### `ConnectionPreview` interface

Add:
```typescript
isReconnect: boolean            // true if workspaceId already in store
identitySecret: string          // from exchange response (new token's secret)
existingDisplayName?: string    // populated after silent re-link success, shown as hint
```

### `connectWithCode()` function

Signature changes to accept existing workspaces:
```typescript
async function connectWithCode(
  host: string,
  code: string,
  existingWorkspaces: WorkspaceEntry[]
): Promise<ConnectionPreview>
```

After exchange + workspace fetch, check `existingWorkspaces` for matching `id === ws.id`. If found:
1. Attempt `POST /identity/setup { identitySecret: existing.identitySecret }` with the new JWT.
2. On success: set `isReconnect = true`, `existingDisplayName` from response.
3. On 401: set `isReconnect = false` (fallback to first-time form).

`RemoteTab` receives `existingWorkspaces` as a prop from the parent (already available in the add-workspace modal context).

### `handleConfirm()` function

- If `isReconnect`: update existing `WorkspaceEntry` (replace `tokenId`, `expiresAt`, `refreshDeadline`, `host`, `identitySecret`). Do not add a new entry.
- If first-time: call `setupIdentity({ displayName, username })`, then add new `WorkspaceEntry` (including `identitySecret`).

## API Client Changes (`client.ts`)

New method:
```typescript
/**
 * Claims or re-links an identity for the current JWT token.
 * - First-time: creates a new user with displayName + optional username.
 * - Reconnect: links to existing user via identitySecret (silent, no display name needed).
 */
async setupIdentity(opts: {
  displayName?: string
  username?: string
  identitySecret?: string
}): Promise<{ userId: string; displayName: string; username?: string }>
// → POST /api/v1/identity/setup
```

## WorkspaceEntry Changes (`workspace-store.ts`)

Add one field:
```typescript
identitySecret?: string  // opaque secret used for identity re-linking on reconnect
```

Exchange response now includes `identitySecret` — App stores it alongside the workspace entry.

## Error Handling

| Scenario | Behavior |
|---|---|
| Exchange fails (bad code, expired) | Error message on first screen, stays on input step |
| `/identity/setup` 409 username conflict | Inline error under username field: "Username already taken" — only error that blocks Add workspace |
| `/identity/setup` 401 on reconnect | Fallback to first-time identity form |
| `/identity/setup` 404 (identity plugin not installed) | Log and proceed — identity simply not available on this server |
| `/identity/setup` 5xx / network error | Log and proceed — identity setup non-critical, don't block workspace add |

Only 409 blocks the user. All other errors from `/identity/setup` are silent failures — the workspace is still added, identity just won't be claimed on servers that don't support it.

## Storage

| Data | Location | Reason |
|---|---|---|
| JWT (`accessToken`) | System keychain (`workspace:<id>`) | Grants full API access — must be in secure store |
| `identitySecret` | `WorkspaceEntry` (Tauri store) | Does not grant API access alone; Tauri store is sufficient |
| `tokenId`, `expiresAt`, etc. | `WorkspaceEntry` (Tauri store) | Non-sensitive metadata |
