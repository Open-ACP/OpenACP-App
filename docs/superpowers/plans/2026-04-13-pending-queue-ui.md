# Pending Queue UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal `PendingIndicator` with a full pending queue list panel that shows each queued message (with sender name and prompt preview) above the input area, plus a modal to view the full prompt.

**Architecture:** Rewrite `pending-indicator.tsx` in-place to export a `PendingQueue` component that renders a scrollable list of `PendingQueueItem` rows and a `Dialog` modal per item. Remove the `ownTurnIds` early-return guard in `handleMessageQueued` so that own messages that are genuinely queued also appear in the list.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui (`Dialog`), `@phosphor-icons/react`

---

## File Map

| File | Action |
|------|--------|
| `src/openacp/components/chat/pending-indicator.tsx` | Rewrite — new `PendingQueue` component with list + modal |
| `src/openacp/context/chat.tsx` | Modify — remove `ownTurnIds` skip in `handleMessageQueued` |
| `src/openacp/components/composer.tsx` | No change needed — import name `PendingIndicator` stays the same (export alias) |

---

## Task 1: Rewrite pending-indicator.tsx as PendingQueue

**Files:**
- Rewrite: `src/openacp/components/chat/pending-indicator.tsx`

This task rewrites the file completely. The new component renders a panel with:
- An amber pulse dot + item count header
- A scrollable list (max-height 200px) of `PendingQueueItem` rows
- Each row: sender name (truncated, max 80px) + prompt preview (1 line, truncated) + expand icon button
- Clicking the expand icon opens a `Dialog` modal showing full prompt text, adapter source, and timestamp

Sender label resolution order:
1. `sender.displayName`
2. `sender.username`
3. `sender === null` or `sender === undefined` → `"You"`
4. `sender` present but no displayName/username → `"Unknown"`

- [ ] **Step 1: Rewrite the file**

Replace the full contents of `src/openacp/components/chat/pending-indicator.tsx` with:

```typescript
import { useState } from "react"
import { ArrowsOut } from "@phosphor-icons/react"
import { useChat } from "../../context/chat"
import type { PendingItem } from "../../context/chat"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog"
import { Button } from "../ui/button"

function senderLabel(item: PendingItem): string {
  if (item.sender?.displayName) return item.sender.displayName
  if (item.sender?.username) return item.sender.username
  // sender absent or null → own message
  if (item.sender === null || item.sender === undefined) return "You"
  return "Unknown"
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return iso
  }
}

interface PendingItemModalProps {
  item: PendingItem
  open: boolean
  onClose: () => void
}

function PendingItemModal({ item, open, onClose }: PendingItemModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{senderLabel(item)}</DialogTitle>
          <DialogDescription>
            {formatTimestamp(item.timestamp)}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap break-words">
          {item.text}
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}

interface PendingQueueItemRowProps {
  item: PendingItem
  onView: () => void
}

function PendingQueueItemRow({ item, onView }: PendingQueueItemRowProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 group">
      <span className="text-xs font-medium text-foreground shrink-0 max-w-[80px] truncate">
        {senderLabel(item)}
      </span>
      <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
        {item.text}
      </span>
      <button
        type="button"
        onClick={onView}
        className="shrink-0 text-muted-foreground opacity-50 hover:opacity-100 transition-opacity"
        aria-label="View full message"
      >
        <ArrowsOut className="size-3.5" />
      </button>
    </div>
  )
}

export function PendingIndicator() {
  const chat = useChat()
  const items = chat.pending()
  const [selectedItem, setSelectedItem] = useState<PendingItem | null>(null)

  if (items.length === 0) return null

  return (
    <>
      <div className="border-t border-border/50 bg-background/80 backdrop-blur">
        {/* Header row */}
        <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
          <div className="size-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <span>
            {items.length === 1 ? "1 message waiting" : `${items.length} messages waiting`}
          </span>
        </div>

        {/* Scrollable item list */}
        <div className="max-h-[200px] overflow-y-auto">
          {items.map((item) => (
            <PendingQueueItemRow
              key={item.turnId}
              item={item}
              onView={() => setSelectedItem(item)}
            />
          ))}
        </div>
      </div>

      {selectedItem && (
        <PendingItemModal
          item={selectedItem}
          open={true}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build
```

Expected: TypeScript check passes, no errors. If `PendingItem` is not exported from `chat.tsx`, fix in Task 2 before re-running.

- [ ] **Step 3: Commit**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add src/openacp/components/chat/pending-indicator.tsx
git commit -m "feat(pending-queue): rewrite PendingIndicator as full queue list with modal"
```

---

## Task 2: Export PendingItem type from chat context

**Files:**
- Modify: `src/openacp/context/chat.tsx`

The new component imports `PendingItem` from `chat.tsx`. Verify it is already exported; if not, add the `export` keyword.

- [ ] **Step 1: Check if PendingItem is exported**

Search for `export interface PendingItem` in `src/openacp/context/chat.tsx`. If found, skip to Task 3.

If NOT found (it's `interface PendingItem` without export), change line:

```typescript
interface PendingItem {
```

to:

```typescript
export interface PendingItem {
```

- [ ] **Step 2: Rebuild to confirm no import errors**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build
```

Expected: passes cleanly.

- [ ] **Step 3: Commit (only if a change was made)**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add src/openacp/context/chat.tsx
git commit -m "feat(chat): export PendingItem type for use in components"
```

---

## Task 3: Allow own messages in the pending queue

**Files:**
- Modify: `src/openacp/context/chat.tsx` — `handleMessageQueued` function

Currently, `handleMessageQueued` returns early if the incoming `turnId` belongs to this App instance (`ownTurnIds.current.has(ev.turnId)`). Remove this early return so own messages that are genuinely queued appear in the pending list.

- [ ] **Step 1: Locate the early return**

Find this block near the top of `handleMessageQueued` (around line 764–767):

```typescript
function handleMessageQueued(ev: MessageQueuedEvent) {
  // Skip if this app instance sent this message
  if (ownTurnIds.current.has(ev.turnId)) return
  // Race condition guard
  if (sendingRef.current && ev.sessionId === store.activeSession) return
```

- [ ] **Step 2: Remove the ownTurnIds early return**

Change the function opening to:

```typescript
function handleMessageQueued(ev: MessageQueuedEvent) {
  // Race condition guard: if we are mid-send and this is our active session,
  // the message will go straight to processing — skip adding to pending.
  if (sendingRef.current && ev.sessionId === store.activeSession) return
```

> **Why:** The `sendingRef` guard already covers the in-flight case (message goes straight to processing, no genuine queue). The `ownTurnIds` guard was overly broad — it also blocked own messages that arrived in the queue because another message was already processing. Those should appear in the pending list.

- [ ] **Step 3: Verify new Core path still handles own messages in handleMessageProcessing**

Confirm the existing block in `handleMessageProcessing` (around line 824) still correctly handles own turn cleanup:

```typescript
if (ownTurnIds.current.has(ev.turnId)) {
  // Self-sent: user message already visible via optimistic UI.
  // Create assistant message now.
  ...
  ownTurnIds.current.delete(ev.turnId)
```

This block must remain intact. It runs on `message:processing`, which removes from `ownTurnIds` and creates the assistant message. The pending item for this turnId will be removed by the `message:processing` handler's `pendingBySession` cleanup (verify that cleanup exists; if not, add it in the next step).

- [ ] **Step 4: Verify handleMessageProcessing removes the item from pendingBySession**

Search for the removal of the pending item in `handleMessageProcessing`. It should contain something like:

```typescript
setStore((draft) => {
  const pending = draft.pendingBySession[sid]
  if (pending) {
    const idx = pending.findIndex((p) => p.turnId === ev.turnId)
    if (idx !== -1) pending.splice(idx, 1)
  }
  ...
})
```

If this removal is missing, add it inside the `setStore` call at the start of `handleMessageProcessing`.

- [ ] **Step 5: Build to verify no regressions**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build
```

Expected: passes cleanly.

- [ ] **Step 6: Commit**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add src/openacp/context/chat.tsx
git commit -m "feat(chat): show own queued messages in pending list, remove ownTurnIds guard from handleMessageQueued"
```

---

## Task 4: Manual verification

No automated test framework is configured. Verify the feature manually.

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm dev
```

- [ ] **Step 2: Test — external message appears in pending list**

Send a message to the session from Telegram or via the API while another message is processing. Verify:
- A pending panel appears above the input with the sender name and truncated prompt
- The amber pulse dot is visible
- Clicking the expand icon opens the modal with full text, timestamp

- [ ] **Step 3: Test — multiple messages stack in order**

Queue 2–3 messages from different sources. Verify they appear top→bottom in arrival order.

- [ ] **Step 4: Test — item disappears when processing starts**

Watch a pending item. When the AI starts responding to it, verify it disappears from the pending list and a conversation entry appears.

- [ ] **Step 5: Test — own message in queue**

Send a message while the AI is still generating a previous response. If the Core queues it (depends on Core behavior), verify it appears as "You: [prompt]" in the pending list.

- [ ] **Step 6: Test — view more modal**

Click the expand icon on a pending item with long text. Verify the modal shows the full text, scrolls if needed, and closes cleanly.

- [ ] **Step 7: Final commit if any fixes applied**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add -p
git commit -m "fix(pending-queue): <describe fix>"
```
