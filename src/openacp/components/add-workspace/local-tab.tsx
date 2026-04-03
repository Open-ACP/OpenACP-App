import { createSignal, createResource, For, Show } from 'solid-js'
import { discoverLocalInstances, type InstanceListEntry, type WorkspaceEntry } from '../../api/workspace-store.js'
import { CreateInstance } from './create-instance.js'
import { invoke } from '@tauri-apps/api/core'

interface LocalTabProps {
  onAdd: (entry: WorkspaceEntry) => void
  existingIds?: string[]
}

type BrowseResult =
  | { type: 'known'; instance: InstanceListEntry }
  | { type: 'unregistered'; path: string }
  | { type: 'new'; path: string }

async function checkBrowsedPath(selectedPath: string, knownInstances: InstanceListEntry[]): Promise<BrowseResult> {
  const match = knownInstances.find(i => i.directory === selectedPath)
  if (match) return { type: 'known', instance: match }

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
    props.onAdd({
      id: inst.id,
      name: inst.name ?? inst.id,
      directory: inst.directory,
      type: 'local',
    })
  }

  return (
    <div class="space-y-5">
      {/* Known workspaces on this machine */}
      <div>
        <p class="text-12-medium text-text-weaker uppercase tracking-wider mb-3">Workspaces on this machine</p>
        <Show when={instances.loading}>
          <p class="text-14-regular text-text-weak py-2">Looking for workspaces...</p>
        </Show>
        <Show when={!instances.loading && (instances() ?? []).length === 0}>
          <p class="text-14-regular text-text-weak py-2">No workspaces found on this machine.</p>
        </Show>
        <div class="space-y-2">
          <For each={instances() ?? []}>
            {(inst) => {
              const alreadyAdded = () => props.existingIds?.includes(inst.id) ?? false
              const isRunning = () => inst.status === 'running'
              return (
                <button
                  type="button"
                  disabled={alreadyAdded()}
                  onClick={() => handleSelectInstance(inst)}
                  class="w-full text-left rounded-xl border transition-colors p-4"
                  classList={{
                    'border-border-base opacity-60 cursor-not-allowed': alreadyAdded(),
                    'border-border-base hover:border-border-hover hover:bg-surface-raised-base-hover': !alreadyAdded(),
                  }}
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-15-semibold text-text-strong">{inst.name ?? inst.id}</span>
                        <Show when={alreadyAdded()}>
                          <span class="text-11-medium text-text-weaker bg-surface-raised-base px-2 py-0.5 rounded-full">Added</span>
                        </Show>
                      </div>
                      <div class="space-y-0.5">
                        <p class="text-12-regular text-text-weak truncate">
                          <span class="text-text-weaker">Folder </span>{inst.directory}
                        </p>
                        <Show when={inst.port} fallback={
                          <p class="text-12-regular text-text-weaker">Not running</p>
                        }>
                          <p class="text-12-regular text-text-weak">
                            <span class="text-text-weaker">Address </span>
                            <span class="font-mono">http://localhost:{inst.port}</span>
                          </p>
                        </Show>
                      </div>
                    </div>
                    <span
                      class="shrink-0 text-11-medium px-2 py-1 rounded-full mt-0.5"
                      classList={{
                        'bg-green-500/15 text-green-500': isRunning(),
                        'bg-surface-raised-base text-text-weaker': !isRunning(),
                      }}
                    >
                      {isRunning() ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </button>
              )
            }}
          </For>
        </div>
      </div>

      {/* Open a folder */}
      <div class="border-t border-border-base pt-5">
        <p class="text-12-medium text-text-weaker uppercase tracking-wider mb-3">Open a folder</p>
        <button
          type="button"
          onClick={handleBrowse}
          class="w-full px-4 py-3 rounded-xl border border-border-base text-14-medium text-text-base hover:bg-surface-raised-base-hover hover:border-border-hover transition-colors text-left flex items-center gap-3"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" class="text-text-weak shrink-0">
            <path d="M2.5 5.83333V15.8333H17.5V7.5H9.58333L7.5 5.83333H2.5Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>Choose a folder to open or create a workspace...</span>
        </button>
      </div>

      {/* Result after folder selection */}
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
      <div class="p-4 bg-surface-raised-base rounded-xl border border-border-base space-y-3">
        <div>
          <p class="text-14-medium text-text-strong mb-1">Workspace found</p>
          <p class="text-13-regular text-text-weak">
            This folder is already set up as <strong class="text-text-base">{inst.name ?? inst.id}</strong>. Click Add to open it here.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onClick={() => props.onAdd({
              id: inst.id,
              name: inst.name ?? inst.id,
              directory: inst.directory,
              type: 'local',
            })}
            class="px-4 py-1.5 rounded-lg bg-accent-base text-white text-13-medium hover:opacity-90 transition-opacity"
          >
            Add workspace
          </button>
          <button type="button" onClick={props.onClose} class="text-13-regular text-text-weak hover:text-text-base transition-colors">
            Back
          </button>
        </div>
      </div>
    )
  }

  if (result.type === 'unregistered') {
    return (
      <div class="p-4 bg-surface-raised-base rounded-xl border border-border-base space-y-3">
        <div>
          <p class="text-14-medium text-text-strong mb-1">Existing workspace detected</p>
          <p class="text-13-regular text-text-weak">
            This folder already has an OpenACP workspace. Click Add to register it.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <RegisterExistingButton path={result.path} onAdd={props.onAdd} />
          <button type="button" onClick={props.onClose} class="text-13-regular text-text-weak hover:text-text-base transition-colors">
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
      setError(e.message ?? 'Failed to add workspace')
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
        class="px-4 py-1.5 rounded-lg bg-accent-base text-white text-13-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading() ? 'Adding...' : 'Add workspace'}
      </button>
      <Show when={error()}>
        <p class="text-12-regular text-red-500">{error()}</p>
      </Show>
    </>
  )
}
