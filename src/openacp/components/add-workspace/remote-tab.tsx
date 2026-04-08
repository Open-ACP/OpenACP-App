import React, { useState } from 'react'
import type { WorkspaceEntry } from '../../api/workspace-store'

interface ConnectionPreview {
  host: string; accessToken: string; tokenId: string; expiresAt: string; refreshDeadline: string
  role: string; scopes: string[]; workspaceId: string; workspaceName: string; workspaceDirectory: string
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

async function connectWithCode(host: string, code: string): Promise<ConnectionPreview> {
  const exchangeRes = await fetch(`${host}/api/v1/auth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
  if (!exchangeRes.ok) { const err = await exchangeRes.json().catch(() => ({})); throw new Error((err as any)?.error?.message ?? exchangeRes.statusText) }
  const { accessToken, tokenId, expiresAt, refreshDeadline } = await exchangeRes.json()
  const wsRes = await fetch(`${host}/api/v1/workspace`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!wsRes.ok) throw new Error('Failed to fetch workspace info')
  const ws = await wsRes.json()
  let role = 'user'; let scopes: string[] = []
  try { const meRes = await fetch(`${host}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } }); if (meRes.ok) { const me = await meRes.json(); role = me.role ?? 'user'; scopes = me.scopes ?? [] } } catch {}
  return { host, accessToken, tokenId, expiresAt, refreshDeadline, role, scopes, workspaceId: ws.id, workspaceName: ws.name, workspaceDirectory: ws.directory }
}

export function RemoteTab(props: { onAdd: (entry: WorkspaceEntry) => void }) {
  const [input, setInput] = useState(''); const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ConnectionPreview | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleConnect() {
    setError(null); const parsed = parseLink(input.trim())
    if (!parsed) { setError('Invalid link. Paste an openacp:// or https:// invite link.'); return }
    setLoading(true)
    try { setPreview(await connectWithCode(parsed.host, parsed.code)) } catch (e: any) { setError(e.message ?? 'Connection failed') } finally { setLoading(false) }
  }

  async function handleConfirm() {
    const p = preview; if (!p) return; setSaving(true)
    try {
      const { setKeychainToken } = await import('../../api/keychain')
      await setKeychainToken(p.workspaceId, p.accessToken)
      props.onAdd({ id: p.workspaceId, name: p.workspaceName, directory: p.workspaceDirectory, type: 'remote', host: p.host, tokenId: p.tokenId, role: p.role, expiresAt: p.expiresAt, refreshDeadline: p.refreshDeadline })
    } catch (e: any) { setError(e.message ?? 'Failed to save') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      {!preview ? (
        <>
          <div>
            <p className="text-sm font-medium text-foreground mb-1">Connect to a remote workspace</p>
            <p className="text-xs text-muted-foreground">
              Run <code className="font-mono bg-secondary px-1 py-0.5 rounded text-foreground-weak text-xs">openacp remote</code> on the remote machine, then paste the invite link.
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
        </>
      ) : (
        <>
          <div>
            <p className="text-sm font-medium text-foreground mb-1">Connection successful</p>
            <p className="text-xs text-muted-foreground">Review details before adding.</p>
          </div>
          <div className="rounded-lg border border-border-weak overflow-hidden">
            <div className="flex justify-between items-center px-3 py-2.5">
              <span className="text-xs text-muted-foreground">Workspace</span>
              <span className="text-sm font-medium text-foreground">{preview.workspaceName}</span>
            </div>
            <div className="border-t border-border-weak" />
            <div className="flex justify-between items-center px-3 py-2.5">
              <span className="text-xs text-muted-foreground">Server</span>
              <span className="text-xs text-foreground-weak font-mono truncate max-w-48">{preview.host.replace(/^https?:\/\//, '')}</span>
            </div>
            <div className="border-t border-border-weak" />
            <div className="flex justify-between items-center px-3 py-2.5">
              <span className="text-xs text-muted-foreground">Access</span>
              <span className="text-xs text-foreground-weak capitalize">{preview.role}</span>
            </div>
            <div className="border-t border-border-weak" />
            <div className="flex justify-between items-center px-3 py-2.5">
              <span className="text-xs text-muted-foreground">Expires</span>
              <span className="text-xs text-foreground-weak">{new Date(preview.expiresAt).toLocaleString()}</span>
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setPreview(null); setError(null) }}
              className="h-9 px-4 rounded-lg border border-border-weak text-sm font-medium text-foreground-weak hover:bg-accent transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="flex-1 h-9 rounded-lg bg-foreground text-background text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              {saving ? 'Adding...' : 'Add workspace'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
