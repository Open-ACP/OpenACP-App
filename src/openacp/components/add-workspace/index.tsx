import React, { useState } from 'react'
import { LocalTab } from './local-tab'
import { RemoteTab } from './remote-tab'
import type { WorkspaceEntry } from '../../api/workspace-store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'

interface AddWorkspaceModalProps {
  onAdd: (entry: WorkspaceEntry) => void
  onClose: () => void
  existingIds: string[]
  defaultTab?: 'local' | 'remote'
}

export function AddWorkspaceModal(props: AddWorkspaceModalProps) {
  const [tab, setTab] = useState<'local' | 'remote'>(props.defaultTab ?? 'local')

  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose() }}>
      <DialogContent className="bg-background-weak w-full max-w-lg rounded-xl p-0 overflow-hidden gap-0" showCloseButton={false}>
        <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-border-base gap-0">
          <DialogTitle className="text-16-semibold text-text-strong">Add Workspace</DialogTitle>
          <button type="button" onClick={props.onClose} className="text-text-weak hover:text-text-base text-xl leading-none transition-colors">&times;</button>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'local' | 'remote')} className="gap-0">
          <TabsList variant="line" className="w-full justify-start px-0 border-b border-border-base rounded-none h-auto">
            <TabsTrigger value="local" className="px-6 py-3 text-14-medium rounded-none">Local</TabsTrigger>
            <TabsTrigger value="remote" className="px-6 py-3 text-14-medium rounded-none">Remote</TabsTrigger>
          </TabsList>
          <TabsContent value="local" className="p-6">
            <LocalTab onAdd={props.onAdd} existingIds={props.existingIds} />
          </TabsContent>
          <TabsContent value="remote" className="p-6">
            <RemoteTab onAdd={props.onAdd} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
