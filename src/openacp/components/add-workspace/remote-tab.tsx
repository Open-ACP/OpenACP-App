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

/** Extract HTTP status code from the error messages thrown by createApiClient's api() helper. */
function extractApiStatus(e: unknown): number {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const match = (e as Error).message.match(/^API (\d+)/)
    if (match) return parseInt(match[1], 10)
  }
  return 0
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
  let isReconnect = false
  let existingDisplayName: string | undefined
  const meRes = await fetch(`${host}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!meRes.ok) throw new Error(`Failed to fetch auth info (${meRes.status})`)
  const me = await meRes.json()
  role = me.role ?? 'user'
  scopes = me.scopes ?? []
  // If token already linked (e.g. still valid after re-generating link on same server),
  // treat as reconnect so we skip the identity form
  if (me.claimed && me.displayName) {
    isReconnect = true
    existingDisplayName = me.displayName
  }

  // Step 3: detect reconnect — workspaceId already in store with a stored identitySecret
  const existingEntry = existingWorkspaces.find(e => e.id === ws.id)

  if (existingEntry?.identitySecret) {
    // Attempt re-link using the old token's identitySecret.
    // On 401 the secret is no longer valid — fall through to first-time form.
    try {
      const tempClient = createApiClient({ url: host, token: accessToken })
      const user = await tempClient.setupIdentity({ identitySecret: existingEntry.identitySecret })
      isReconnect = true
      existingDisplayName = user.displayName
    } catch (e: unknown) {
      const status = extractApiStatus(e)
      if (status === 401) {
        // Old identitySecret is no longer valid — show first-time identity form
        isReconnect = false
      } else {
        // Any other error (network, 5xx) — surface to user, don't hide it
        throw new Error(`Identity re-link failed (${status ?? 'network error'})`)
      }
    }
  } else if (existingEntry) {
    // Workspace exists but never had identitySecret stored (old app version).
    // Show identity form since we can't re-link silently.
    isReconnect = false
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
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)

  const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/
  function validateUsername(v: string): string | null {
    if (!v) return 'Username is required'
    if (!USERNAME_RE.test(v)) return 'Only letters, numbers, _ . - allowed. No spaces.'
    return null
  }

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

    if (!p.isReconnect) {
      const usernameVal = username.trim().replace(/^@/, '')
      const err = validateUsername(usernameVal)
      if (err) { setUsernameError(err); return }
    }

    setSaving(true); setUsernameError(null)

    let confirmedDisplayName: string | undefined

    try {
      if (!p.isReconnect) {
        const usernameVal = username.trim().replace(/^@/, '')
        // displayName falls back to username if not provided
        const displayNameVal = displayName.trim() || usernameVal

        // First-time connect: claim identity before saving workspace.
        const res = await fetch(`${p.host}/api/v1/identity/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.accessToken}` },
          body: JSON.stringify({
            displayName: displayNameVal,
            username: usernameVal,
          }),
        })
        if (res.status === 409 || res.status === 400) {
          const body = await res.json().catch(() => ({ error: 'Invalid input' }))
          setUsernameError(body.error ?? 'Invalid input')
          setSaving(false)
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error(body.error ?? `Identity setup failed (${res.status})`)
        }
        const identityData = await res.json()
        confirmedDisplayName = identityData?.displayName
      }

      // Save JWT to keychain
      const { setKeychainToken } = await import('../../api/keychain.js')
      await setKeychainToken(p.workspaceId, p.accessToken)

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
        displayName: p.isReconnect ? p.existingDisplayName : confirmedDisplayName,
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

      {/* Workspace info table */}
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
            <label className="text-xs text-muted-foreground block mb-1">Username</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">@</span>
              <input
                value={username}
                onChange={(e) => {
                  // Strip spaces and @ as the user types to prevent invalid input
                  const v = e.target.value.replace(/[@\s]/g, '')
                  setUsername(v)
                  setUsernameError(v ? validateUsername(v) : null)
                }}
                placeholder="lucas"
                autoFocus
                className="w-full rounded-lg border border-border-weak bg-card pl-7 pr-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30 placeholder:text-muted-foreground transition-colors"
              />
            </div>
            {usernameError && <p className="text-xs text-destructive mt-1">{usernameError}</p>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Display name <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Lucas Chen"
              className="w-full rounded-lg border border-border-weak bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30 placeholder:text-muted-foreground transition-colors"
            />
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
          onClick={() => { setPreview(null); setError(null); setUsername(''); setDisplayName(''); setUsernameError(null) }}
          className="h-9 px-4 rounded-lg border border-border-weak text-sm font-medium text-fg-weak hover:bg-accent transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving || (!preview.isReconnect && !username.trim())}
          className="flex-1 h-9 rounded-lg bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          {saving ? 'Saving...' : preview.isReconnect ? 'Reconnect' : 'Add workspace'}
        </button>
      </div>
    </div>
  )
}
