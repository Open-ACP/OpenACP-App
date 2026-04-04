import React, { useState, useEffect } from 'react'
import { discoverLocalInstances, type InstanceListEntry, type WorkspaceEntry } from '../../api/workspace-store'
import { CreateInstance } from './create-instance'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'

interface LocalTabProps { onAdd: (entry: WorkspaceEntry) => void; existingIds?: string[] }

type BrowseResult = { type: 'known'; instance: InstanceListEntry } | { type: 'unregistered'; path: string } | { type: 'new'; path: string }

async function checkBrowsedPath(selectedPath: string, knownInstances: InstanceListEntry[]): Promise<BrowseResult> {
  const match = knownInstances.find(i => i.directory === selectedPath)
  if (match) return { type: 'known', instance: match }
  try {
    const hasConfig = await invoke<boolean>('path_exists', { path: `${selectedPath}/.openacp/config.json` })
    if (hasConfig) return { type: 'unregistered', path: selectedPath }
  } catch {}
  return { type: 'new', path: selectedPath }
}

export function LocalTab(props: LocalTabProps) {
  const [instances, setInstances] = useState<InstanceListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null)

  useEffect(() => {
    discoverLocalInstances().then((r) => { setInstances(r); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  async function handleBrowse() {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false })
    if (!selected || typeof selected !== 'string') return
    const result = await checkBrowsedPath(selected, instances)
    setBrowseResult(result)
  }

  function handleSelectInstance(inst: InstanceListEntry) {
    props.onAdd({ id: inst.id, name: inst.name ?? inst.id, directory: inst.directory, type: 'local' })
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-12-medium text-text-weaker uppercase tracking-wider mb-3">Workspaces on this machine</p>
        {loading && <p className="text-14-regular text-text-weak py-2">Looking for workspaces...</p>}
        {!loading && instances.length === 0 && <p className="text-14-regular text-text-weak py-2">No workspaces found on this machine.</p>}
        <div className="space-y-2">
          {instances.map((inst) => {
            const alreadyAdded = props.existingIds?.includes(inst.id) ?? false
            const isRunning = inst.status === 'running'
            return (
              <button key={inst.id} type="button" disabled={alreadyAdded} onClick={() => handleSelectInstance(inst)}
                className={`w-full text-left rounded-xl border transition-colors p-4 ${alreadyAdded ? 'border-border-base opacity-60 cursor-not-allowed' : 'border-border-base hover:border-border-hover hover:bg-surface-raised-base-hover'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-15-semibold text-text-strong">{inst.name ?? inst.id}</span>
                      {alreadyAdded && (
                        <Badge variant="secondary" className="text-11-medium">Added</Badge>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-12-regular text-text-weak truncate"><span className="text-text-weaker">Folder </span>{inst.directory}</p>
                      {inst.port ? (
                        <p className="text-12-regular text-text-weak"><span className="text-text-weaker">Address </span><span className="font-mono">http://localhost:{inst.port}</span></p>
                      ) : (
                        <p className="text-12-regular text-text-weaker">Not running</p>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant={isRunning ? "outline" : "secondary"}
                    className={`shrink-0 text-11-medium mt-0.5 ${isRunning ? 'bg-green-500/15 text-green-500 border-transparent' : ''}`}
                  >
                    {isRunning ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <div className="border-t border-border-base pt-5">
        <p className="text-12-medium text-text-weaker uppercase tracking-wider mb-3">Open a folder</p>
        <Button
          type="button"
          variant="outline"
          onClick={handleBrowse}
          className="w-full px-4 py-3 rounded-xl text-14-medium text-text-base h-auto justify-start gap-3"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-text-weak shrink-0"><path d="M2.5 5.83333V15.8333H17.5V7.5H9.58333L7.5 5.83333H2.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>Choose a folder to open or create a workspace...</span>
        </Button>
      </div>
      {browseResult && <BrowseResultView result={browseResult} instances={instances} onAdd={props.onAdd} onClose={() => setBrowseResult(null)} />}
    </div>
  )
}

function BrowseResultView(props: { result: BrowseResult; instances: InstanceListEntry[]; onAdd: (e: WorkspaceEntry) => void; onClose: () => void }) {
  const result = props.result
  if (result.type === 'known') {
    const inst = result.instance
    return (
      <div className="p-4 bg-surface-raised-base rounded-xl border border-border-base space-y-3">
        <div><p className="text-14-medium text-text-strong mb-1">Workspace found</p><p className="text-13-regular text-text-weak">This folder is already set up as <strong className="text-text-base">{inst.name ?? inst.id}</strong>. Click Add to open it here.</p></div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => props.onAdd({ id: inst.id, name: inst.name ?? inst.id, directory: inst.directory, type: 'local' })}
            className="px-4 py-1.5 text-13-medium h-auto"
          >
            Add workspace
          </Button>
          <Button type="button" variant="ghost" onClick={props.onClose} className="text-13-regular text-text-weak h-auto">Back</Button>
        </div>
      </div>
    )
  }
  if (result.type === 'unregistered') {
    return (
      <div className="p-4 bg-surface-raised-base rounded-xl border border-border-base space-y-3">
        <div><p className="text-14-medium text-text-strong mb-1">Existing workspace detected</p><p className="text-13-regular text-text-weak">This folder already has an OpenACP workspace. Click Add to register it.</p></div>
        <div className="flex items-center gap-2">
          <RegisterExistingButton path={result.path} onAdd={props.onAdd} />
          <Button type="button" variant="ghost" onClick={props.onClose} className="text-13-regular text-text-weak h-auto">Back</Button>
        </div>
      </div>
    )
  }
  return <CreateInstance path={result.path} existingInstances={props.instances} onAdd={props.onAdd} onClose={props.onClose} />
}

function RegisterExistingButton(props: { path: string; onAdd: (e: WorkspaceEntry) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function register() {
    setLoading(true); setError(null)
    try {
      const stdout = await invoke<string>('invoke_cli', { args: ['instances', 'create', '--dir', props.path, '--no-interactive', '--json'] })
      const result = JSON.parse(stdout); const data = result?.data ?? result
      props.onAdd({ id: data.id, name: data.name ?? data.id, directory: data.directory, type: 'local' })
    } catch (e: any) { setError(e.message ?? 'Failed to add workspace') } finally { setLoading(false) }
  }
  return (
    <>
      <Button
        type="button"
        onClick={register}
        disabled={loading}
        className="px-4 py-1.5 text-13-medium h-auto"
      >
        {loading ? 'Adding...' : 'Add workspace'}
      </Button>
      {error && <p className="text-12-regular text-red-500">{error}</p>}
    </>
  )
}
