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
    if (!parsed) { setError('Invalid link format. Paste an openacp:// link or https:// URL.'); return }
    setLoading(true)
    try { setPreview(await connectWithCode(parsed.host, parsed.code)) } catch (e: any) { setError(e.message ?? 'Connection failed') } finally { setLoading(false) }
  }

  async function handleConfirm() {
    const p = preview; if (!p) return; setSaving(true)
    try {
      const { setKeychainToken } = await import('../../api/keychain')
      await setKeychainToken(p.workspaceId, p.accessToken)
      props.onAdd({ id: p.workspaceId, name: p.workspaceName, directory: p.workspaceDirectory, type: 'remote', host: p.host, tokenId: p.tokenId, role: p.role, expiresAt: p.expiresAt, refreshDeadline: p.refreshDeadline })
    } catch (e: any) { setError(e.message ?? 'Failed to save workspace') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      {!preview ? (
        <div className="space-y-4">
          <div><p className="text-14-medium text-text-strong mb-1">Connect to a remote workspace</p><p className="text-13-regular text-text-weak">Run <code className="font-mono bg-surface-raised-base px-1 py-0.5 rounded text-text-base">openacp remote</code> on the remote machine, then paste the invite link below.</p></div>
          <label className="block"><span className="text-12-medium text-text-weaker uppercase tracking-wider block mb-2">Invite link</span>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="openacp://connect?host=...&code=..." rows={3} className="w-full px-3 py-2 rounded-xl border border-border-base bg-surface-raised-base text-13-regular text-text-base font-mono resize-none focus:outline-none focus:ring-1 focus:ring-accent-base" />
          </label>
          {error && <p className="text-12-regular text-red-500">{error}</p>}
          <button type="button" onClick={handleConnect} disabled={loading || !input.trim()} className="w-full px-4 py-2.5 rounded-xl bg-accent-base text-white text-14-medium disabled:opacity-50 hover:opacity-90 transition-opacity">{loading ? 'Connecting...' : 'Connect'}</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div><p className="text-14-medium text-text-strong mb-1">Connection successful</p><p className="text-13-regular text-text-weak">Review the details below before adding this workspace.</p></div>
          <div className="rounded-xl border border-border-base divide-y divide-border-base overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3"><span className="text-13-regular text-text-weak">Workspace</span><span className="text-14-medium text-text-strong">{preview.workspaceName}</span></div>
            <div className="flex justify-between items-center px-4 py-3"><span className="text-13-regular text-text-weak">Server address</span><span className="text-12-regular text-text-base font-mono truncate max-w-48">{preview.host.replace(/^https?:\/\//, '')}</span></div>
            <div className="flex justify-between items-center px-4 py-3"><span className="text-13-regular text-text-weak">Access level</span><span className="text-13-regular text-text-base capitalize">{preview.role}</span></div>
            <div className="flex justify-between items-center px-4 py-3"><span className="text-13-regular text-text-weak">Session expires</span><span className="text-12-regular text-text-base">{new Date(preview.expiresAt).toLocaleString()}</span></div>
          </div>
          {error && <p className="text-12-regular text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setPreview(null); setError(null) }} className="px-4 py-2.5 rounded-xl border border-border-base text-14-regular text-text-weak hover:text-text-base hover:border-border-hover transition-colors">Back</button>
            <button type="button" onClick={handleConfirm} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-accent-base text-white text-14-medium disabled:opacity-50 hover:opacity-90 transition-opacity">{saving ? 'Adding...' : 'Add workspace'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
