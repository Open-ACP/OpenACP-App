import { createSignal, For, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import type { InstanceListEntry, WorkspaceEntry } from '../../api/workspace-store.js'

interface CreateInstanceProps {
  path: string
  existingInstances: InstanceListEntry[]
  onAdd: (entry: WorkspaceEntry) => void
  onClose: () => void
}

export function CreateInstance(props: CreateInstanceProps) {
  const [mode, setMode] = createSignal<'choose' | 'clone' | 'new'>('choose')
  const [cloneFrom, setCloneFrom] = createSignal<string | null>(null)
  const [name, setName] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const folderName = () => props.path.split('/').pop() ?? 'workspace'

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const args = ['instances', 'create', '--dir', props.path]
      if (name()) args.push('--name', name())
      if (mode() === 'clone' && cloneFrom()) {
        args.push('--from', cloneFrom()!)
      } else {
        args.push('--no-interactive')
      }
      args.push('--json')
      const stdout = await invoke<string>('invoke_cli', { args })
      const result = JSON.parse(stdout)
      const data = result?.data ?? result
      props.onAdd({
        id: data.id,
        name: data.name ?? data.id,
        directory: data.directory,
        type: 'local',
      })
    } catch (e: any) {
      setError(e.message ?? 'Failed to create instance')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="space-y-4 p-3 bg-surface-raised-base rounded-lg">
      <p class="text-14-regular text-text-base">
        No OpenACP instance at <code class="text-12-regular text-text-strong">{folderName()}</code>
      </p>

      <Show when={mode() === 'choose'}>
        <div class="space-y-2">
          <Show when={props.existingInstances.length > 0}>
            <button
              type="button"
              onClick={() => setMode('clone')}
              class="w-full text-left px-3 py-2 rounded-lg border border-border-base text-14-regular text-text-base hover:bg-surface-raised-base-hover transition-colors"
            >
              <span class="text-14-medium text-text-strong">Clone from existing</span>
              <span class="text-12-regular text-text-weak block">Copy config from another instance</span>
            </button>
          </Show>
          <button
            type="button"
            onClick={() => setMode('new')}
            class="w-full text-left px-3 py-2 rounded-lg border border-border-base text-14-regular text-text-base hover:bg-surface-raised-base-hover transition-colors"
          >
            <span class="text-14-medium text-text-strong">Create new</span>
            <span class="text-12-regular text-text-weak block">Start with a fresh instance</span>
          </button>
        </div>
      </Show>

      <Show when={mode() === 'clone'}>
        <div class="space-y-3">
          <label class="block">
            <span class="text-12-regular text-text-weak block mb-1">Clone from</span>
            <select
              value={cloneFrom() ?? ''}
              onInput={(e) => setCloneFrom(e.currentTarget.value || null)}
              class="w-full px-3 py-2 rounded-lg border border-border-base bg-surface-raised-base text-14-regular text-text-base"
            >
              <option value="">Select instance...</option>
              <For each={props.existingInstances}>
                {(inst) => <option value={inst.directory}>{inst.name ?? inst.id} ({inst.directory})</option>}
              </For>
            </select>
          </label>
          <NameInput value={name()} folderName={folderName()} onInput={setName} />
          <ActionButtons
            onBack={() => setMode('choose')}
            onConfirm={handleCreate}
            disabled={!cloneFrom() || loading()}
            loading={loading()}
            error={error()}
          />
        </div>
      </Show>

      <Show when={mode() === 'new'}>
        <div class="space-y-3">
          <NameInput value={name()} folderName={folderName()} onInput={setName} />
          <ActionButtons
            onBack={() => setMode('choose')}
            onConfirm={handleCreate}
            disabled={loading()}
            loading={loading()}
            error={error()}
          />
        </div>
      </Show>
    </div>
  )
}

function NameInput(props: { value: string; folderName: string; onInput: (v: string) => void }) {
  return (
    <label class="block">
      <span class="text-12-regular text-text-weak block mb-1">Instance name</span>
      <input
        type="text"
        value={props.value}
        placeholder={props.folderName}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        class="w-full px-3 py-2 rounded-lg border border-border-base bg-surface-raised-base text-14-regular text-text-base"
      />
    </label>
  )
}

function ActionButtons(props: {
  onBack: () => void
  onConfirm: () => void
  disabled: boolean
  loading: boolean
  error: string | null
}) {
  return (
    <>
      <Show when={props.error}>
        <p class="text-12-regular text-red-500">{props.error}</p>
      </Show>
      <div class="flex gap-2">
        <button
          type="button"
          onClick={props.onBack}
          class="px-3 py-1 text-14-regular text-text-weak hover:text-text-base transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={props.onConfirm}
          disabled={props.disabled}
          class="flex-1 px-3 py-1 rounded-lg bg-accent-base text-white text-14-medium disabled:opacity-50 transition-colors"
        >
          {props.loading ? 'Creating...' : 'Create workspace'}
        </button>
      </div>
    </>
  )
}
