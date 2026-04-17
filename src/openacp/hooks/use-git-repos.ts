import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"

export interface GitRepoInfo {
  name: string
  path: string
  branch: string
}

export type GitMode = "single" | "multi" | "none"

const POLL_INTERVAL = 5000

// ── Shared cache per directory ──────────────────────────────────────
// All hook instances for the same directory share one poll + one result.
interface CacheEntry {
  mode: GitMode
  repos: GitRepoInfo[]
  loading: boolean
  listeners: Set<() => void>
  timer: ReturnType<typeof setInterval> | null
  refCount: number
}

const cache = new Map<string, CacheEntry>()

function serialize(repos: GitRepoInfo[]): string {
  return repos.map((r) => `${r.path}:${r.branch}`).join("|")
}

function getOrCreate(directory: string): CacheEntry {
  let entry = cache.get(directory)
  if (entry) return entry

  entry = {
    mode: "none",
    repos: [],
    loading: true,
    listeners: new Set(),
    timer: null,
    refCount: 0,
  }
  cache.set(directory, entry)
  return entry
}

function poll(directory: string) {
  const entry = cache.get(directory)
  if (!entry) return

  invoke<GitRepoInfo[]>("discover_git_repos", { directory })
    .then((result) => {
      const prev = serialize(entry.repos)
      const next = serialize(result)
      if (prev === next && !entry.loading) return // no change, skip re-render

      if (result.length === 0) {
        entry.mode = "none"
        entry.repos = []
      } else if (result.length === 1 && result[0].path === directory) {
        entry.mode = "single"
        entry.repos = result
      } else {
        entry.mode = "multi"
        entry.repos = result
      }
      entry.loading = false
      entry.listeners.forEach((fn) => fn())
    })
    .catch(() => {
      if (entry.mode !== "none" || entry.loading) {
        entry.mode = "none"
        entry.repos = []
        entry.loading = false
        entry.listeners.forEach((fn) => fn())
      }
    })
}

export function useGitRepos(directory: string) {
  const [, forceRender] = useState(0)
  const entryRef = useRef<CacheEntry>(null!)

  // Subscribe on mount, unsubscribe on unmount
  useEffect(() => {
    const entry = getOrCreate(directory)
    entryRef.current = entry
    entry.refCount++

    const listener = () => forceRender((n) => n + 1)
    entry.listeners.add(listener)

    // Start polling if first subscriber
    if (entry.refCount === 1) {
      poll(directory)
      entry.timer = setInterval(() => poll(directory), POLL_INTERVAL)
    } else {
      // Already have data, trigger initial render
      forceRender((n) => n + 1)
    }

    return () => {
      entry.listeners.delete(listener)
      entry.refCount--
      if (entry.refCount === 0) {
        if (entry.timer) clearInterval(entry.timer)
        cache.delete(directory)
      }
    }
  }, [directory])

  const entry = entryRef.current ?? getOrCreate(directory)

  const refresh = useCallback(() => poll(directory), [directory])

  return useMemo(
    () => ({ mode: entry.mode, repos: entry.repos, loading: entry.loading, refresh }),
    [entry.mode, entry.repos, entry.loading, refresh],
  )
}
