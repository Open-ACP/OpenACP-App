import React, { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { InstanceListEntry, WorkspaceEntry } from '../../api/workspace-store'

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
            <select value={cloneFrom ?? ''} onChange={(e) => setCloneFrom(e.target.value || null)} className="w-full px-3 py-2 rounded-lg border border-border-base bg-surface-raised-base text-14-regular text-text-base">
              <option value="">Select instance...</option>
              {props.existingInstances.map((inst) => <option key={inst.id} value={inst.directory}>{inst.name ?? inst.id} ({inst.directory})</option>)}
            </select>
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
      <input type="text" value={props.value} placeholder={props.folderName} onChange={(e) => props.onInput(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border-base bg-surface-raised-base text-14-regular text-text-base" />
    </label>
  )
}

function ActionButtons(props: { onBack: () => void; onConfirm: () => void; disabled: boolean; loading: boolean; error: string | null }) {
  return (
    <>
      {props.error && <p className="text-12-regular text-red-500">{props.error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={props.onBack} className="px-3 py-1 text-14-regular text-text-weak hover:text-text-base transition-colors">Back</button>
        <button type="button" onClick={props.onConfirm} disabled={props.disabled} className="flex-1 px-3 py-1 rounded-lg bg-accent-base text-white text-14-medium disabled:opacity-50 transition-colors">{props.loading ? 'Creating...' : 'Create workspace'}</button>
      </div>
    </>
  )
}
