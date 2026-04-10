import { useMemo, useCallback } from 'react'
import type { WorkspaceEntry } from '../api/workspace-store'

export interface SortedWorkspacesResult {
  sorted: WorkspaceEntry[]
  pinnedIds: Set<string>
  togglePin: (id: string) => void
  reorder: (activeId: string, overId: string) => void
  rename: (id: string, newName: string) => void
  touchLastActive: (id: string) => void
}

function compareEntries(a: WorkspaceEntry, b: WorkspaceEntry): number {
  // Entries with sortOrder take precedence (manual drag order)
  if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder
  if (a.sortOrder != null) return -1
  if (b.sortOrder != null) return 1
  // Then by lastActiveAt descending (most recent first)
  if (a.lastActiveAt && b.lastActiveAt) return b.lastActiveAt.localeCompare(a.lastActiveAt)
  if (a.lastActiveAt) return -1
  if (b.lastActiveAt) return 1
  // Fallback: preserve array order (stable sort)
  return 0
}

export function useSortedWorkspaces(
  workspaces: WorkspaceEntry[],
  setWorkspaces: React.Dispatch<React.SetStateAction<WorkspaceEntry[]>>,
): SortedWorkspacesResult {
  const sorted = useMemo(() => {
    const pinned = workspaces.filter(w => w.pinned)
    const unpinned = workspaces.filter(w => !w.pinned)
    pinned.sort(compareEntries)
    unpinned.sort(compareEntries)
    return [...pinned, ...unpinned]
  }, [workspaces])

  const pinnedIds = useMemo(
    () => new Set(workspaces.filter(w => w.pinned).map(w => w.id)),
    [workspaces],
  )

  const togglePin = useCallback(
    (id: string) => {
      setWorkspaces(prev =>
        prev.map(w =>
          w.id === id
            ? { ...w, pinned: !w.pinned, sortOrder: undefined }
            : w,
        ),
      )
    },
    [setWorkspaces],
  )

  const reorder = useCallback(
    (activeId: string, overId: string) => {
      if (activeId === overId) return

      // Work on the sorted view to compute new positions
      const pinned = workspaces.filter(w => w.pinned).sort(compareEntries)
      const unpinned = workspaces.filter(w => !w.pinned).sort(compareEntries)

      const activeEntry = workspaces.find(w => w.id === activeId)
      if (!activeEntry) return

      // Determine which group the item belongs to
      const group = activeEntry.pinned ? pinned : unpinned
      const fromIdx = group.findIndex(w => w.id === activeId)
      const toIdx = group.findIndex(w => w.id === overId)
      if (fromIdx < 0 || toIdx < 0) return

      // Reorder within group
      const reordered = [...group]
      const [moved] = reordered.splice(fromIdx, 1)
      reordered.splice(toIdx, 0, moved)

      // Assign sortOrder values
      const updatedIds = new Map<string, number>()
      reordered.forEach((w, i) => updatedIds.set(w.id, i * 1000))

      setWorkspaces(prev =>
        prev.map(w =>
          updatedIds.has(w.id) ? { ...w, sortOrder: updatedIds.get(w.id) } : w,
        ),
      )
    },
    [workspaces, setWorkspaces],
  )

  const rename = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim()
      setWorkspaces(prev =>
        prev.map(w =>
          w.id === id
            ? { ...w, customName: trimmed || undefined }
            : w,
        ),
      )
    },
    [setWorkspaces],
  )

  const touchLastActive = useCallback(
    (id: string) => {
      setWorkspaces(prev =>
        prev.map(w =>
          w.id === id ? { ...w, lastActiveAt: new Date().toISOString() } : w,
        ),
      )
    },
    [setWorkspaces],
  )

  return { sorted, pinnedIds, togglePin, reorder, rename, touchLastActive }
}
