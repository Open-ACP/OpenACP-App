import * as React from "react"
import { ArrowsOut } from "@phosphor-icons/react"

import { useChat, type PendingItem } from "../../context/chat"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"

/** Resolves a display label from the sender field per the priority order:
 *  displayName → username → "You" (null/undefined) → "Unknown" (present but no name). */
function resolveSenderLabel(sender: PendingItem["sender"]): string {
  if (sender == null) return "You"
  if (sender.displayName) return sender.displayName
  if (sender.username) return sender.username
  return "Unknown"
}

function PendingItemModal({
  item,
  open,
  onOpenChange,
}: {
  item: PendingItem
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const senderLabel = resolveSenderLabel(item.sender)
  const timestamp = new Date(item.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{senderLabel}</DialogTitle>
          <DialogDescription>{timestamp}</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap break-words">
          {item.text}
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}

function PendingRow({ item }: { item: PendingItem }) {
  const [open, setOpen] = React.useState(false)
  const senderLabel = resolveSenderLabel(item.sender)

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40">
        <span className="text-xs font-medium text-foreground shrink-0 max-w-[80px] truncate">
          {senderLabel}
        </span>
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {item.text}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0"
          aria-label="View full message"
        >
          <ArrowsOut className="size-3.5 opacity-50 hover:opacity-100 transition-opacity" />
        </button>
      </div>
      <PendingItemModal item={item} open={open} onOpenChange={setOpen} />
    </>
  )
}

export function PendingIndicator() {
  const chat = useChat()
  const items = chat.pending()

  if (items.length === 0) return null

  const countLabel =
    items.length === 1 ? "1 message waiting" : `${items.length} messages waiting`

  return (
    <div className="border-t border-border/50 bg-background/80 backdrop-blur">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <div className="size-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
        <span className="text-xs text-muted-foreground">{countLabel}</span>
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        {items.map((item) => (
          <PendingRow key={item.turnId} item={item} />
        ))}
      </div>
    </div>
  )
}
