import React, { useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog"
import { Button } from "./ui/button"
import { Spinner } from "./ui/spinner"
import type { WorkspaceEntry } from "../api/workspace-store"

interface ReconnectDialogProps {
  open: boolean
  workspace: WorkspaceEntry
  onReconnect: (newHost: string) => Promise<void>
  onFallbackToAdd: () => void
  onClose: () => void
}

export function ReconnectDialog({
  open,
  workspace,
  onReconnect,
  onFallbackToAdd,
  onClose,
}: ReconnectDialogProps) {
  const [host, setHost] = useState(workspace.host ?? "")
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const handleReconnect = useCallback(async () => {
    const trimmed = host.trim().replace(/\/+$/, "")
    if (!trimmed) return
    setStatus("connecting")
    setErrorMsg("")
    try {
      await onReconnect(trimmed)
      onClose()
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message ?? "Connection failed"
      if (msg.includes("401") || msg.includes("auth") || msg.includes("token")) {
        setStatus("error")
        setErrorMsg("Authentication expired. Use a new share link to reconnect.")
      } else {
        setStatus("error")
        setErrorMsg(msg)
      }
    }
  }, [host, onReconnect, onClose])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reconnect workspace</DialogTitle>
          <DialogDescription>
            Update the host URL for "{workspace.customName || workspace.name}" and reconnect.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground outline-none focus:border-primary"
            placeholder="https://tunnel-url.example.com"
            value={host}
            onChange={(e) => { setHost(e.target.value); setStatus("idle") }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleReconnect()
            }}
          />
          {status === "error" && (
            <p className="text-xs text-destructive">{errorMsg}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={status === "connecting"}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => { onClose(); onFallbackToAdd() }}
            disabled={status === "connecting"}
          >
            Use share link
          </Button>
          <Button
            onClick={handleReconnect}
            disabled={!host.trim() || status === "connecting"}
          >
            {status === "connecting" ? <Spinner className="size-3.5" /> : "Reconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
