import * as React from "react"
import { ArrowsOut } from "@phosphor-icons/react"

import { useChat, type PendingItem } from "../../context/chat"
import { Button } from "../ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"

/**
 * Formats an ISO timestamp to HH:MM using en-GB locale for consistent output
 * across machines regardless of system locale settings.
 */
function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

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
  const timestamp = formatTimestamp(item.timestamp)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{senderLabel}</DialogTitle>
          <DialogDescription>{timestamp}</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap break-words">
          {item.text}
        </div>
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
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => setOpen(true)}
          className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
          aria-label="View full message"
        >
          <ArrowsOut className="size-3.5" />
        </Button>
      </div>
      <PendingItemModal item={item} open={open} onOpenChange={setOpen} />
    </>
  )
}

export function PendingIndicator() {
  const chat = useChat()

  // chat.pending() uses `|| []` fallback which creates a new array reference each call;
  // memoize to avoid unnecessary re-renders of child rows.
  const items = React.useMemo(() => chat.pending(), [chat])

  if (items.length === 0) return null

  const countLabel =
    items.length === 1 ? "1 message waiting" : `${items.length} messages waiting`

  return (
    <div className="border-t border-border/50 bg-background/80 backdrop-blur">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <div className="size-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
        <span className="text-xs text-muted-foreground">{countLabel}</span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {items.map((item) => (
          <PendingRow key={item.turnId} item={item} />
        ))}
      </div>
    </div>
  )
}
