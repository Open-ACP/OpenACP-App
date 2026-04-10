import React, { useState, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { type InstanceListEntry, type WorkspaceEntry } from '../../api/workspace-store'
import {
  listWorkspaces,
  classifyDirectory,
  registerWorkspace,
  WorkspaceServiceError,
} from '../../api/workspace-service'
import { CreateInstance } from './create-instance'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '../ui/button'

interface LocalTabProps {
  onAdd: (entry: WorkspaceEntry) => void
  onSetup?: (path: string, instanceId: string) => void
  existingIds?: string[]
}

export function LocalTab(props: LocalTabProps) {
  const [instances, setInstances] = useState<InstanceListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [browseResult, setBrowseResult] = useState<
    | { type: 'registered'; instance: InstanceListEntry }
    | { type: 'unregistered'; directory: string }
    | { type: 'new'; directory: string }
    | null
  >(null)

  useEffect(() => {
    listWorkspaces().then(setInstances).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleBrowse() {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false })
    if (!selected || typeof selected !== 'string') return
    const result = await classifyDirectory(selected, instances)
    setBrowseResult(result)
  }

  function handleSelectInstance(inst: InstanceListEntry) {
    props.onAdd({ id: inst.id, name: inst.name ?? inst.id, directory: inst.directory, type: 'local' })
  }

  return (
    <div className="space-y-5">
      {/* Workspaces on machine */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Workspaces on this machine</p>
        {loading && <p className="text-sm text-muted-foreground py-3">Looking for workspaces...</p>}
        {!loading && instances.length === 0 && <p className="text-sm text-muted-foreground py-3">No workspaces found.</p>}
        {!loading && instances.length > 0 && (
          <div className="rounded-lg border border-border-weak overflow-hidden">
            {instances.map((inst, i) => {
              const alreadyAdded = props.existingIds?.includes(inst.id) ?? false
              const isRunning = inst.status === 'running'
              return (
                <div
                  key={inst.id}
                  className={`group flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer ${
                    i > 0 ? 'border-t border-border-weak' : ''
                  } ${alreadyAdded ? 'opacity-70' : ''} hover:bg-accent`}
                  onClick={() => handleSelectInstance(inst)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{inst.name ?? inst.id}</span>
                      {alreadyAdded && <span className="text-2xs text-muted-foreground">Added</span>}
                    </div>
                    <span className="text-xs text-muted-foreground truncate block font-mono">{inst.directory}</span>
                  </div>
                  {isRunning && (
                    <div className="size-2 rounded-full shrink-0" style={{ background: 'var(--surface-success-strong)' }} />
                  )}
                  {!alreadyAdded && !isRunning && (
                    <button
                      type="button"
                      className="shrink-0 size-6 flex items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-accent transition-all"
                      title="Remove from list"
                      onClick={async (e) => {
                        e.stopPropagation()
                        try {
                          await invoke('remove_instance_registration', { instanceId: inst.id })
                          setInstances(prev => prev.filter(x => x.id !== inst.id))
                        } catch (err) {
                          console.error('[local-tab] remove instance failed:', err)
                        }
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Browse folder */}
      <div className="border-t border-border-weak pt-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Open a folder</p>
        <button
          type="button"
          onClick={handleBrowse}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border-weak text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0"><path d="M2.5 5.83333V15.8333H17.5V7.5H9.58333L7.5 5.83333H2.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Choose a folder to open or create a workspace...
        </button>
      </div>

      {browseResult && (
        <BrowseResultView
          result={browseResult}
          instances={instances}
          onAdd={props.onAdd}
          onSetup={props.onSetup}
          onClose={() => setBrowseResult(null)}
        />
      )}
    </div>
  )
}

function BrowseResultView(props: {
  result: { type: 'registered'; instance: InstanceListEntry } | { type: 'unregistered'; directory: string } | { type: 'new'; directory: string }
  instances: InstanceListEntry[]
  onAdd: (e: WorkspaceEntry) => void
  onSetup?: (path: string, instanceId: string) => void
  onClose: () => void
}) {
  const result = props.result
  if (result.type === 'registered') {
    const inst = result.instance
    return (
      <div className="p-4 bg-secondary rounded-xl border border-border space-y-3">
        <div>
          <p className="text-md-medium text-foreground mb-1">Workspace found</p>
          <p className="text-sm-regular text-muted-foreground">
            This folder is already set up as <strong className="text-foreground-weak">{inst.name ?? inst.id}</strong>. Click Add to open it here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => props.onAdd({ id: inst.id, name: inst.name ?? inst.id, directory: inst.directory, type: 'local' })}
            className="px-4 py-1.5 text-sm-medium h-auto"
          >
            Add workspace
          </Button>
          <Button type="button" variant="ghost" onClick={props.onClose} className="text-sm-regular text-muted-foreground h-auto">Back</Button>
        </div>
      </div>
    )
  }
  if (result.type === 'unregistered') {
    return <RegisterExistingView path={result.directory} onAdd={props.onAdd} onClose={props.onClose} />
  }
  return <CreateInstance path={result.directory} existingInstances={props.instances} onAdd={props.onAdd} onSetup={props.onSetup} onClose={props.onClose} />
}

function RegisterExistingView(props: { path: string; onAdd: (e: WorkspaceEntry) => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function register() {
    setLoading(true)
    setError(null)
    try {
      const entry = await registerWorkspace(props.path)
      props.onAdd(entry)
    } catch (e) {
      if (e instanceof WorkspaceServiceError) {
        setError(e.message)
      } else {
        setError(typeof e === 'string' ? e : 'Failed to add workspace')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 bg-secondary rounded-xl border border-border space-y-3">
      <div>
        <p className="text-md-medium text-foreground mb-1">Existing workspace detected</p>
        <p className="text-sm-regular text-muted-foreground">This folder already has an OpenACP workspace. Click Add to register it.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={register}
          disabled={loading}
          className="px-4 py-1.5 text-sm-medium h-auto"
        >
          {loading ? 'Adding...' : 'Add workspace'}
        </Button>
        {error && <p className="text-sm-regular text-destructive">{error}</p>}
        <Button type="button" variant="ghost" onClick={props.onClose} className="text-sm-regular text-muted-foreground h-auto">Back</Button>
      </div>
    </div>
  )
}
