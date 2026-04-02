import { createSignal, Show } from 'solid-js'
import type { WorkspaceEntry } from '../../api/workspace-store.js'

interface RemoteTabProps {
  onAdd: (entry: WorkspaceEntry) => void
}

interface ConnectionPreview {
  host: string
  accessToken: string
  tokenId: string
  expiresAt: string
  refreshDeadline: string
  role: string
  scopes: string[]
  workspaceId: string
  workspaceName: string
  workspaceDirectory: string
}

function parseLink(input: string): { host: string; code: string } | null {
  try {
    if (input.startsWith('openacp://connect')) {
      // Custom scheme: openacp://connect?host=...&code=...
      const params = new URLSearchParams(input.replace('openacp://connect?', ''))
      const rawHost = params.get('host')
      const code = params.get('code')
      if (!rawHost || !code) return null
      // Normalize host: prepend https:// only if no protocol prefix present
      const normalizedHost = rawHost.startsWith('http://') || rawHost.startsWith('https://')
        ? rawHost
        : `https://${rawHost}`
      return { host: normalizedHost, code }
    }
    const url = new URL(input)
    const code = url.searchParams.get('code')
    if (!code) return null
    const host = `${url.protocol}//${url.host}`
    return { host, code }
  } catch {
    return null
  }
}

async function connectWithCode(host: string, code: string): Promise<ConnectionPreview> {
  // Step 1: Exchange code for JWT
  const exchangeRes = await fetch(`${host}/api/v1/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!exchangeRes.ok) {
    const err = await exchangeRes.json().catch(() => ({}))
    const msg = (err as any)?.error?.message ?? exchangeRes.statusText
    throw new Error(msg)
  }
  const { accessToken, tokenId, expiresAt, refreshDeadline } = await exchangeRes.json()

  // Step 2: Get workspace info
  const wsRes = await fetch(`${host}/api/v1/workspace`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!wsRes.ok) throw new Error('Failed to fetch workspace info')
  const ws = await wsRes.json()

  // Step 3: Get token info (role/scopes) — gracefully handle missing endpoint
  let role = 'user'
  let scopes: string[] = []
  try {
    const meRes = await fetch(`${host}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (meRes.ok) {
      const me = await meRes.json()
      role = me.role ?? 'user'
      scopes = me.scopes ?? []
    }
  } catch {
    // endpoint not available — use defaults
  }

  return {
    host,
    accessToken,
    tokenId,
    expiresAt,
    refreshDeadline,
    role,
    scopes,
    workspaceId: ws.id,
    workspaceName: ws.name,
    workspaceDirectory: ws.directory,
  }
}

export function RemoteTab(props: RemoteTabProps) {
  const [input, setInput] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [preview, setPreview] = createSignal<ConnectionPreview | null>(null)
  const [saving, setSaving] = createSignal(false)

  async function handleConnect() {
    setError(null)
    const parsed = parseLink(input().trim())
    if (!parsed) {
      setError('Invalid link format. Paste an openacp:// link or https:// URL.')
      return
    }
    setLoading(true)
    try {
      const result = await connectWithCode(parsed.host, parsed.code)
      setPreview(result)
    } catch (e: any) {
      setError(e.message ?? 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    const p = preview()
    if (!p) return
    setSaving(true)
    try {
      // Store JWT in keychain (keychain module stub — Task 8 will replace with real impl)
      const { setKeychainToken } = await import('../../api/keychain.js')
      await setKeychainToken(p.workspaceId, p.accessToken)

      // Build WorkspaceEntry (no raw token stored here)
      const entry: WorkspaceEntry = {
        id: p.workspaceId,
        name: p.workspaceName,
        directory: p.workspaceDirectory,
        type: 'remote',
        host: p.host,
        tokenId: p.tokenId,
        role: p.role,
        expiresAt: p.expiresAt,
        refreshDeadline: p.refreshDeadline,
      }
      props.onAdd(entry)
    } catch (e: any) {
      setError(e.message ?? 'Failed to save workspace')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="space-y-4">
      <Show when={!preview()}>
        <div class="space-y-3">
          <label class="block">
            <span class="text-12-regular text-text-weaker block mb-1">Paste openacp:// link or URL</span>
            <textarea
              value={input()}
              onInput={(e) => setInput(e.currentTarget.value)}
              placeholder="openacp://connect?host=abc-123.trycloudflare.com&code=..."
              rows={3}
              class="w-full px-3 py-2 rounded-lg border border-border-base bg-surface-raised-base text-14-regular text-text-base font-mono resize-none"
            />
          </label>
          <Show when={error()}>
            <p class="text-12-regular text-red-500">{error()}</p>
          </Show>
          <button
            type="button"
            onClick={handleConnect}
            disabled={loading() || !input().trim()}
            class="w-full px-4 py-2 rounded-lg bg-accent-base text-white text-14-medium disabled:opacity-50 transition-colors"
          >
            {loading() ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </Show>

      <Show when={preview()}>
        {(p) => (
          <div class="space-y-4">
            <div class="p-4 bg-surface-raised-base rounded-lg space-y-2">
              <div class="flex justify-between items-center">
                <span class="text-12-regular text-text-weak">Workspace</span>
                <span class="text-14-medium text-text-strong">{p().workspaceName}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-12-regular text-text-weak">Host</span>
                <span class="text-12-regular text-text-base font-mono truncate max-w-48">{p().host.replace('https://', '')}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-12-regular text-text-weak">Role</span>
                <span class="text-14-regular text-text-base">{p().role}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-12-regular text-text-weak">Expires</span>
                <span class="text-12-regular text-text-base">{new Date(p().expiresAt).toLocaleString()}</span>
              </div>
            </div>
            <Show when={error()}>
              <p class="text-12-regular text-red-500">{error()}</p>
            </Show>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => { setPreview(null); setError(null) }}
                class="px-3 py-2 text-14-regular text-text-weak hover:text-text-base transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving()}
                class="flex-1 px-4 py-2 rounded-lg bg-accent-base text-white text-14-medium disabled:opacity-50 transition-colors"
              >
                {saving() ? 'Saving...' : 'Add Workspace'}
              </button>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
