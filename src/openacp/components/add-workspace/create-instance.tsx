import React, { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { InstanceListEntry, WorkspaceEntry } from '../../api/workspace-store'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

interface CreateInstanceProps { path: string; existingInstances: InstanceListEntry[]; onAdd: (entry: WorkspaceEntry) => void; onClose: () => void }

export function CreateInstance(props: CreateInstanceProps) {
  const [mode, setMode] = useState<'choose' | 'clone' | 'new'>('choose')
  const [cloneFrom, setCloneFrom] = useState<string | null>(null)
  const [name, setName] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null)
  const folderName = props.path.split('/').pop() ?? 'workspace'

  async function handleCreate() {
    setLoading(true); setError(null)
    try {
      const args = ['instances', 'create', '--dir', props.path]
      if (name) args.push('--name', name)
      if (mode === 'clone' && cloneFrom) args.push('--from', cloneFrom); else args.push('--no-interactive')
      args.push('--json')
      const stdout = await invoke<string>('invoke_cli', { args }); const result = JSON.parse(stdout); const data = result?.data ?? result
      props.onAdd({ id: data.id, name: data.name ?? data.id, directory: data.directory, type: 'local' })
    } catch (e: any) { setError(e.message ?? 'Failed to create instance') } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4 p-3 bg-surface-raised-base rounded-lg">
      <p className="text-14-regular text-text-base">No OpenACP instance at <code className="text-12-regular text-text-strong">{folderName}</code></p>
      {mode === 'choose' && (
        <div className="space-y-2">
          {props.existingInstances.length > 0 && (
            <button type="button" onClick={() => setMode('clone')} className="w-full text-left px-3 py-2 rounded-lg border border-border-base text-14-regular text-text-base hover:bg-surface-raised-base-hover transition-colors">
              <span className="text-14-medium text-text-strong">Clone from existing</span><span className="text-12-regular text-text-weak block">Copy config from another instance</span>
            </button>
          )}
          <button type="button" onClick={() => setMode('new')} className="w-full text-left px-3 py-2 rounded-lg border border-border-base text-14-regular text-text-base hover:bg-surface-raised-base-hover transition-colors">
            <span className="text-14-medium text-text-strong">Create new</span><span className="text-12-regular text-text-weak block">Start with a fresh instance</span>
          </button>
        </div>
      )}
      {mode === 'clone' && (
        <div className="space-y-3">
          <label className="block"><span className="text-12-regular text-text-weak block mb-1">Clone from</span>
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
    <label className="block"><span className="text-12-regular text-text-weak block mb-1">Instance name</span>
      <Input
        type="text"
        value={props.value}
        placeholder={props.folderName}
        onChange={(e) => props.onInput(e.target.value)}
        className="w-full rounded-lg text-14-regular"
      />
    </label>
  )
}

function ActionButtons(props: { onBack: () => void; onConfirm: () => void; disabled: boolean; loading: boolean; error: string | null }) {
  return (
    <>
      {props.error && <p className="text-12-regular text-red-500">{props.error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={props.onBack} className="px-3 py-1 text-14-regular text-text-weak h-auto">Back</Button>
        <Button
          type="button"
          onClick={props.onConfirm}
          disabled={props.disabled}
          className="flex-1 px-3 py-1 text-14-medium h-auto"
        >
          {props.loading ? 'Creating...' : 'Create workspace'}
        </Button>
      </div>
    </>
  )
}
