import type { InstanceListEntry, WorkspaceEntry } from '../../api/workspace-store.js'

export function CreateInstance(_props: {
  path: string
  existingInstances: InstanceListEntry[]
  onAdd: (e: WorkspaceEntry) => void
  onClose: () => void
}) {
  return <div>Create instance (coming soon)</div>
}
