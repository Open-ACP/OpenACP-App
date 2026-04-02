import { createSignal, Show } from 'solid-js'
import { LocalTab } from './local-tab.js'
import { RemoteTab } from './remote-tab.js'
import type { WorkspaceEntry } from '../../api/workspace-store.js'

interface AddWorkspaceModalProps {
  onAdd: (entry: WorkspaceEntry) => void
  onClose: () => void
  existingIds: string[]
  defaultTab?: 'local' | 'remote'
}

export function AddWorkspaceModal(props: AddWorkspaceModalProps) {
  const [tab, setTab] = createSignal<'local' | 'remote'>(props.defaultTab ?? 'local')

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div class="bg-background-raised w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div class="flex items-center justify-between px-6 py-4 border-b border-border-base">
          <h2 class="text-16-semibold text-text-strong">Add Workspace</h2>
          <button
            type="button"
            onClick={props.onClose}
            class="text-text-weak hover:text-text-base text-xl leading-none transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div class="flex border-b border-border-base">
          <button
            type="button"
            classList={{
              "px-6 py-3 text-14-medium border-b-2 transition-colors": true,
              "border-text-base text-text-base": tab() === 'local',
              "border-transparent text-text-weak hover:text-text-base": tab() !== 'local',
            }}
            onClick={() => setTab('local')}
          >
            Local
          </button>
          <button
            type="button"
            classList={{
              "px-6 py-3 text-14-medium border-b-2 transition-colors": true,
              "border-text-base text-text-base": tab() === 'remote',
              "border-transparent text-text-weak hover:text-text-base": tab() !== 'remote',
            }}
            onClick={() => setTab('remote')}
          >
            Remote
          </button>
        </div>

        {/* Tab content */}
        <div class="p-6">
          <Show when={tab() === 'local'}>
            <LocalTab onAdd={props.onAdd} existingIds={props.existingIds} />
          </Show>
          <Show when={tab() === 'remote'}>
            <RemoteTab onAdd={props.onAdd} />
          </Show>
        </div>
      </div>
    </div>
  )
}
