import { invoke } from '@tauri-apps/api/core'

export interface AgentEntry {
  key: string
  name: string
  version: string
  installed: boolean
  available: boolean
  description: string
}

let cached: Promise<AgentEntry[]> | null = null

function fetchAgents(): Promise<AgentEntry[]> {
  return invoke<string>('run_openacp_agents_list').then((result) => {
    const raw = typeof result === 'string' ? JSON.parse(result) : result
    if (Array.isArray(raw)) return raw as AgentEntry[]
    if (raw?.data?.agents) return raw.data.agents as AgentEntry[]
    return []
  })
}

/** Prefetch the agents list. Safe to call multiple times — reuses the in-flight/cached promise. */
export function prefetchAgents(): Promise<AgentEntry[]> {
  if (!cached) cached = fetchAgents().catch((err) => { cached = null; throw err })
  return cached
}

/** Invalidate the cache (e.g., after an install/uninstall). */
export function invalidateAgentsCache(): void {
  cached = null
}
