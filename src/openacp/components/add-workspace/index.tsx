import React, { useState } from 'react'
import { LocalTab } from './local-tab'
import { RemoteTab } from './remote-tab'
import type { WorkspaceEntry } from '../../api/workspace-store'

interface AddWorkspaceModalProps {
  onAdd: (entry: WorkspaceEntry) => void
  onClose: () => void
  existingIds: string[]
  defaultTab?: 'local' | 'remote'
}

export function AddWorkspaceModal(props: AddWorkspaceModalProps) {
  const [tab, setTab] = useState<'local' | 'remote'>(props.defaultTab ?? 'local')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-background-weak w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-base">
          <h2 className="text-16-semibold text-text-strong">Add Workspace</h2>
          <button type="button" onClick={props.onClose} className="text-text-weak hover:text-text-base text-xl leading-none transition-colors">&times;</button>
        </div>
        <div className="flex border-b border-border-base">
          <button type="button" className={`px-6 py-3 text-14-medium border-b-2 transition-colors ${tab === 'local' ? 'border-text-base text-text-base' : 'border-transparent text-text-weak hover:text-text-base'}`} onClick={() => setTab('local')}>Local</button>
          <button type="button" className={`px-6 py-3 text-14-medium border-b-2 transition-colors ${tab === 'remote' ? 'border-text-base text-text-base' : 'border-transparent text-text-weak hover:text-text-base'}`} onClick={() => setTab('remote')}>Remote</button>
        </div>
        <div className="p-6">
          {tab === 'local' && <LocalTab onAdd={props.onAdd} existingIds={props.existingIds} />}
          {tab === 'remote' && <RemoteTab onAdd={props.onAdd} />}
        </div>
      </div>
    </div>
  )
}
