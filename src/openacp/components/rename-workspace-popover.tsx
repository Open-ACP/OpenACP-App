import React, { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog"
import { Button } from "./ui/button"

export interface RenameWorkspaceDialogProps {
  open: boolean
  currentName: string
  onSave: (newName: string) => void
  onClose: () => void
}

export function RenameWorkspaceDialog({ open, currentName, onSave, onClose }: RenameWorkspaceDialogProps) {
  const [value, setValue] = useState(currentName)

  // Reset value when dialog opens with new name
  React.useEffect(() => {
    if (open) setValue(currentName)
  }, [open, currentName])

  function handleSubmit() {
    const trimmed = value.trim()
    if (trimmed) onSave(trimmed)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Rename workspace</DialogTitle>
          <DialogDescription>Enter a new name for this workspace.</DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground outline-none focus:border-primary"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit() }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!value.trim()} onClick={handleSubmit}>Rename</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
