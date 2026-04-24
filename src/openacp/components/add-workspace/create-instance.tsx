import React, { useState } from 'react'
import type { InstanceListEntry, WorkspaceEntry } from '../../api/workspace-store'
import { invalidateInstancesCache } from '../../api/workspace-store'
import { createWorkspace, startWorkspaceServer, WorkspaceServiceError } from '../../api/workspace-service'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

interface CreateInstanceProps {
  path: string
  existingInstances: InstanceListEntry[]
  onAdd: (entry: WorkspaceEntry) => void
  onSetup?: (path: string, instanceId: string, instanceName: string) => void
  onClose: () => void
}

export function CreateInstance(props: CreateInstanceProps) {
  const [mode, setMode] = useState<'choose' | 'clone' | 'new'>('choose')
  const [cloneFrom, setCloneFrom] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const folderName = props.path.split('/').pop() ?? 'workspace'

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const result = await createWorkspace(props.path, {
        name: name || folderName,
        fromPath: mode === 'clone' && cloneFrom ? cloneFrom : undefined,
      })
      invalidateInstancesCache()

      if (mode === 'clone') {
        // Clone has config ready — start server and add workspace
        try {
          await startWorkspaceServer(props.path)
        } catch { /* server may take a moment */ }
        props.onAdd({ id: result.id, name: result.name, directory: result.directory, type: 'local' })
      } else {
        // New — needs onboarding (agent setup, then start)
        props.onSetup?.(props.path, result.id, result.name)
      }
    } catch (e) {
      if (e instanceof WorkspaceServiceError) {
        setError(e.message)
      } else {
        setError(typeof e === 'string' ? e : (e as any)?.message ?? 'Failed to create workspace')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">No OpenACP instance at <code className="text-foreground">{folderName}</code></p>
      {mode === 'choose' && (
        <div className="space-y-1.5">
          {props.existingInstances.length > 0 && (
            <button type="button" onClick={() => setMode('clone')} className="w-full text-left px-3 py-2.5 rounded-lg border border-border-weak hover:bg-accent transition-colors">
              <span className="text-sm font-medium text-foreground block">Clone from existing</span>
              <span className="text-xs text-muted-foreground block">Copy config from another instance</span>
            </button>
          )}
          <button type="button" onClick={() => setMode('new')} className="w-full text-left px-3 py-2.5 rounded-lg border border-border-weak hover:bg-accent transition-colors">
            <span className="text-sm font-medium text-foreground block">Create new</span>
            <span className="text-xs text-muted-foreground block">Start with a fresh instance</span>
          </button>
        </div>
      )}
      {mode === 'clone' && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm-regular text-muted-foreground block mb-1">Clone from</span>
            <Select value={cloneFrom ?? ''} onValueChange={(v) => setCloneFrom(v || null)}>
              <SelectTrigger className="w-full rounded-lg">
                <SelectValue placeholder="Select instance..." />
              </SelectTrigger>
              <SelectContent>
                {props.existingInstances.map((inst) => (
                  <SelectItem key={inst.id} value={inst.directory}>
                    {inst.name ?? inst.id} ({inst.directory})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <NameInput value={name} folderName={folderName} onInput={setName} />
          <ActionButtons onBack={() => setMode('choose')} onConfirm={handleCreate} disabled={!cloneFrom || loading} loading={loading} error={error} />
        </div>
      )}
      {mode === 'new' && (
        <div className="space-y-3">
          <NameInput value={name} folderName={folderName} onInput={setName} />
          <ActionButtons onBack={() => setMode('choose')} onConfirm={handleCreate} disabled={loading} loading={loading} error={error} />
        </div>
      )}
    </div>
  )
}

function NameInput(props: { value: string; folderName: string; onInput: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm-regular text-muted-foreground block mb-1">Instance name</span>
      <Input
        type="text"
        value={props.value}
        placeholder={props.folderName}
        onChange={(e) => props.onInput(e.target.value)}
        className="w-full rounded-lg text-md-regular"
      />
    </label>
  )
}

function ActionButtons(props: { onBack: () => void; onConfirm: () => void; disabled: boolean; loading: boolean; error: string | null }) {
  return (
    <>
      {props.error && <p className="text-sm-regular text-destructive">{props.error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={props.onBack} className="px-3 py-1 text-md-regular text-muted-foreground h-auto">Back</Button>
        <Button
          type="button"
          onClick={props.onConfirm}
          disabled={props.disabled}
          className="flex-1 px-3 py-1 text-md-medium h-auto text-primary-foreground"
        >
          {props.loading ? 'Creating...' : 'Create workspace'}
        </Button>
      </div>
    </>
  )
}
