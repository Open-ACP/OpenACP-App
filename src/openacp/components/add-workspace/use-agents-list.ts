import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"

export interface AgentEntry {
  key: string
  name: string
  version: string
  installed: boolean
  available: boolean
  description: string
}

interface AgentsListState {
  agents: AgentEntry[] | null // null = still loading
  error: string | null
}

// Module-level promise cache. Survives across mounts within the same session.
let inflight: Promise<AgentEntry[]> | null = null

function fetchAgents(): Promise<AgentEntry[]> {
  if (inflight) return inflight
  inflight = (async () => {
    const result = await invoke<string>("run_openacp_agents_list")
    const raw = typeof result === "string" ? JSON.parse(result) : result
    let list: AgentEntry[]
    if (Array.isArray(raw)) list = raw
    else if (raw?.data?.agents) list = raw.data.agents
    else list = []
    return list
  })()
  // Drop cache on failure so a retry is possible; keep on success
  inflight.catch(() => {
    inflight = null
  })
  return inflight
}

/** Invalidate the module-level cache. Call after install/uninstall. */
export function invalidateAgentsList(): void {
  inflight = null
}

/** Kicks off (or reuses) the fetch. Returns a state hook for consumers. */
export function useAgentsList(): AgentsListState {
  const [state, setState] = useState<AgentsListState>({ agents: null, error: null })
  useEffect(() => {
    let cancelled = false
    fetchAgents().then(
      (agents) => {
        if (!cancelled) setState({ agents, error: null })
      },
      (err) => {
        if (!cancelled) setState({ agents: [], error: String(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

/** Fire-and-forget warm-up. Use from a parent that wants to start the fetch early. */
export function prefetchAgentsList(): void {
  void fetchAgents()
}
