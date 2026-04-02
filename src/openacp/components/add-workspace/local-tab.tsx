import { createSignal, createResource, For, Show } from 'solid-js'
import { discoverLocalInstances, type InstanceListEntry, type WorkspaceEntry } from '../../api/workspace-store.js'
import { CreateInstance } from './create-instance.js'
import { invoke } from '@tauri-apps/api/core'

interface LocalTabProps {
  onAdd: (entry: WorkspaceEntry) => void
  existingIds?: string[]  // already-added workspace ids
}

type BrowseResult =
  | { type: 'known'; instance: InstanceListEntry }
  | { type: 'unregistered'; path: string }
  | { type: 'new'; path: string }

async function checkBrowsedPath(selectedPath: string, knownInstances: InstanceListEntry[]): Promise<BrowseResult> {
  // Check if path matches a known instance's directory
  const match = knownInstances.find(i => i.directory === selectedPath)
  if (match) return { type: 'known', instance: match }

  // Check if path has .openacp/config.json (unregistered existing instance)
  try {
    const hasConfig = await invoke<boolean>('path_exists', {
      path: `${selectedPath}/.openacp/config.json`,
    })
    if (hasConfig) return { type: 'unregistered', path: selectedPath }
  } catch {}

  return { type: 'new', path: selectedPath }
}

export function LocalTab(props: LocalTabProps) {
  const [instances] = createResource(discoverLocalInstances)
  const [browseResult, setBrowseResult] = createSignal<BrowseResult | null>(null)

  async function handleBrowse() {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false })
    if (!selected || typeof selected !== 'string') return
    const result = await checkBrowsedPath(selected, instances() ?? [])
    setBrowseResult(result)
  }

  function handleSelectInstance(inst: InstanceListEntry) {
    const entry: WorkspaceEntry = {
      id: inst.id,
      name: inst.name ?? inst.id,
      directory: inst.directory,
      type: 'local',
    }
    props.onAdd(entry)
  }

  return (
    <div class="space-y-4">
      {/* Known instances */}
      <div>
        <p class="text-12-regular text-text-weaker uppercase tracking-wide mb-2">Known Instances</p>
        <Show when={instances.loading}>
          <p class="text-14-regular text-text-weak">Scanning...</p>
        </Show>
        <Show when={!instances.loading && (instances() ?? []).length === 0}>
          <p class="text-14-regular text-text-weak">No instances found.</p>
        </Show>
        <For each={instances() ?? []}>
          {(inst) => {
            const alreadyAdded = () => props.existingIds?.includes(inst.id) ?? false
            return (
              <button
                type="button"
                disabled={alreadyAdded()}
                onClick={() => handleSelectInstance(inst)}
                class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors"
                classList={{
                  'opacity-50 cursor-not-allowed': alreadyAdded(),
                  'hover:bg-surface-raised-base-hover': !alreadyAdded(),
                }}
              >
                <span class={`text-xs ${inst.status === 'running' ? 'text-green-500' : 'text-text-weaker'}`}>
                  {inst.status === 'running' ? '●' : '○'}
                </span>
                <span class="flex-1 min-w-0">
                  <span class="text-14-medium text-text-strong block truncate">{inst.name ?? inst.id}</span>
                  <span class="text-12-regular text-text-weak block truncate">{inst.directory}{inst.port ? ` :${inst.port}` : ''}</span>
                </span>
                <Show when={alreadyAdded()}>
                  <span class="text-12-regular text-text-weaker">&#10003; Added</span>
                </Show>
              </button>
            )
          }}
        </For>
      </div>

      {/* Browse folder */}
      <div class="border-t border-border-base pt-4">
        <button
          type="button"
          onClick={handleBrowse}
          class="w-full px-4 py-2 rounded-lg border border-border-base text-14-medium text-text-base hover:bg-surface-raised-base-hover transition-colors"
        >
          Browse for a folder...
        </button>
      </div>

      {/* Browse result */}
      <Show when={browseResult()}>
        <BrowseResultView
          result={browseResult()!}
          instances={instances() ?? []}
          onAdd={props.onAdd}
          onClose={() => setBrowseResult(null)}
        />
      </Show>
    </div>
  )
}

function BrowseResultView(props: {
  result: BrowseResult
  instances: InstanceListEntry[]
  onAdd: (e: WorkspaceEntry) => void
  onClose: () => void
}) {
  const result = props.result

  if (result.type === 'known') {
    const inst = result.instance
    return (
      <div class="p-3 bg-surface-raised-base rounded-lg text-14-regular text-text-base">
        <p>This folder is already registered as <strong>{inst.name ?? inst.id}</strong>.</p>
        <div class="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => props.onAdd({
              id: inst.id,
              name: inst.name ?? inst.id,
              directory: inst.directory,
              type: 'local',
            })}
            class="px-3 py-1 rounded-lg bg-surface-raised-base-hover border border-border-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors"
          >
            Add workspace
          </button>
          <button type="button" onClick={props.onClose} class="text-sm text-text-weak hover:underline">
            Back
          </button>
        </div>
      </div>
    )
  }

  if (result.type === 'unregistered') {
    return (
      <div class="p-3 bg-surface-raised-base rounded-lg text-14-regular text-text-base">
        <p>Found an existing OpenACP instance at this path.</p>
        <div class="flex items-center gap-2">
          <RegisterExistingButton path={result.path} onAdd={props.onAdd} />
          <button type="button" onClick={props.onClose} class="text-sm text-text-weak hover:underline">
            Back
          </button>
        </div>
      </div>
    )
  }

  // type === 'new'
  return (
    <CreateInstance
      path={result.path}
      existingInstances={props.instances}
      onAdd={props.onAdd}
      onClose={props.onClose}
    />
  )
}

function RegisterExistingButton(props: { path: string; onAdd: (e: WorkspaceEntry) => void }) {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  async function register() {
    setLoading(true)
    setError(null)
    try {
      const stdout = await invoke<string>('invoke_cli', {
        args: ['instances', 'create', '--dir', props.path, '--no-interactive', '--json'],
      })
      const result = JSON.parse(stdout)
      const data = result?.data ?? result
      props.onAdd({
        id: data.id,
        name: data.name ?? data.id,
        directory: data.directory,
        type: 'local',
      })
    } catch (e: any) {
      setError(e.message ?? 'Failed to register')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={register}
        disabled={loading()}
        class="mt-2 px-3 py-1 rounded-lg border border-border-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors disabled:opacity-50"
      >
        {loading() ? 'Registering...' : 'Register this instance'}
      </button>
      <Show when={error()}>
        <p class="text-12-regular text-red-500 mt-1">{error()}</p>
      </Show>
    </>
  )
}
