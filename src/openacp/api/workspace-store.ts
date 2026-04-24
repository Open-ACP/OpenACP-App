import { invoke } from '@tauri-apps/api/core'

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
  /**
   * Display name of the linked user. Set at connect/reconnect time.
   */
  displayName?: string
  // Enhanced rail fields (all optional for backwards compat):
  lastActiveAt?: string    // ISO 8601, updated on workspace switch
  pinned?: boolean         // pinned to top of rail
  sortOrder?: number       // manual drag order (undefined = auto-sort by recency)
  customName?: string      // user-defined display name, overrides folder name
}

export interface InstanceListEntry {
  id: string
  name: string | null
  directory: string
  root: string
  status: 'running' | 'stopped'
  port: number | null
}

const STORE_KEY = 'workspaces_v2'

let StoreClass: any = null
let store: any = null

async function getStore(): Promise<any> {
  if (store) return store
  if (!StoreClass) {
    try {
      const mod = await import('@tauri-apps/plugin-store')
      StoreClass = mod.Store
    } catch {
      return null
    }
  }
  try {
    store = await StoreClass.load('openacp.bin')
    return store
  } catch {
    return null
  }
}

export async function loadWorkspaces(): Promise<WorkspaceEntry[]> {
  try {
    const s = await getStore()
    if (s) {
      const data = (await s.get(STORE_KEY)) as WorkspaceEntry[] | undefined
      if (Array.isArray(data)) return data
    }
  } catch {}
  // Fallback to localStorage (dev/browser)
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return JSON.parse(raw) as WorkspaceEntry[]
  } catch {}
  return []
}

export async function saveWorkspaces(entries: WorkspaceEntry[]): Promise<void> {
  try {
    const s = await getStore()
    if (s) {
      await s.set(STORE_KEY, entries)
      await s.save()
    }
  } catch {}
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries))
  } catch {}
}

export async function upsertWorkspace(entry: WorkspaceEntry): Promise<WorkspaceEntry[]> {
  const all = await loadWorkspaces()
  const idx = all.findIndex(e => e.id === entry.id)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...entry }
  } else {
    all.push(entry)
  }
  await saveWorkspaces(all)
  return all
}

export async function removeWorkspace(id: string): Promise<WorkspaceEntry[]> {
  const all = await loadWorkspaces()
  const filtered = all.filter(e => e.id !== id)
  await saveWorkspaces(filtered)
  return filtered
}

export async function patchWorkspace(
  id: string,
  patch: Partial<WorkspaceEntry>,
): Promise<WorkspaceEntry[]> {
  const all = await loadWorkspaces()
  const idx = all.findIndex(e => e.id === id)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch }
    await saveWorkspaces(all)
  }
  return all
}

let instancesCache: Promise<InstanceListEntry[]> | null = null

export function invalidateInstancesCache(): void {
  instancesCache = null
}

export async function discoverLocalInstances(): Promise<InstanceListEntry[]> {
  if (instancesCache) return instancesCache
  instancesCache = (async () => {
    try {
      return await invoke<InstanceListEntry[]>('list_local_instances')
    } catch (err) {
      console.warn('[discoverLocalInstances] Rust path failed, falling back to CLI:', err)
      // CLI fallback: invoke_cli instances list --json
      try {
        const stdout = await invoke<string>('invoke_cli', { args: ['instances', 'list', '--json'] })
        const raw = typeof stdout === 'string' ? JSON.parse(stdout) : stdout
        const data = raw?.data ?? raw
        const list: Array<{ id: string; name?: string | null; directory: string; root: string; status?: string; port?: number | null }> =
          Array.isArray(data) ? data : (data?.instances ?? [])
        return list.map(item => ({
          id: item.id,
          name: item.name ?? null,
          directory: item.directory,
          root: item.root,
          status: (item.status === 'running' ? 'running' : 'stopped') as 'running' | 'stopped',
          port: item.port ?? null,
        }))
      } catch (cliErr) {
        console.error('[discoverLocalInstances] CLI fallback also failed:', cliErr)
        return []
      }
    }
  })().catch((err) => { instancesCache = null; throw err })
  return instancesCache
}

// ---------------------------------------------------------------------------
// Backward-compat shims — callers will be migrated in subsequent tasks
// ---------------------------------------------------------------------------

/** @deprecated Use loadWorkspaces / upsertWorkspace instead */
export interface InstanceInfo {
  id: string
  root: string
  workspace: string
}

/** @deprecated Use loadWorkspaces instead */
export async function loadWorkspaceData(): Promise<{ instances: string[]; lastActive: string | null }> {
  const entries = await loadWorkspaces()
  return {
    instances: entries.map(e => e.id),
    lastActive: entries.length > 0 ? entries[entries.length - 1].id : null,
  }
}

/** @deprecated Use saveWorkspaces / upsertWorkspace instead */
export async function saveWorkspaceData(data: { instances: string[]; lastActive: string | null }): Promise<void> {
  const existing = await loadWorkspaces()
  const existingMap = new Map(existing.map(e => [e.id, e]))
  const merged: WorkspaceEntry[] = data.instances.map(id => {
    const e = existingMap.get(id)
    if (e) return e
    return { id, name: id, directory: '', type: 'local' as const }
  })
  await saveWorkspaces(merged)
}

/** @deprecated Use discoverLocalInstances() instead */
export async function discoverWorkspaces(): Promise<InstanceInfo[]> {
  console.warn('discoverWorkspaces() is deprecated and no longer functional. Use discoverLocalInstances().')
  return []
}
