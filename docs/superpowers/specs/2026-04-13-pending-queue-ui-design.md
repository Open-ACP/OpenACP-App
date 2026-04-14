# Pending Queue UI Design

**Date:** 2026-04-13
**Status:** Approved
**Scope:** App — rework `PendingIndicator` into a full pending queue list panel above the input area

---

## Overview

Replace the minimal `PendingIndicator` (single-line count text) with a rich list panel that shows each queued message in order, with sender identity and prompt preview. Users can expand any item to see the full prompt in a modal.

---

## Goals

- Show all messages currently waiting in the queue, in order (oldest → newest, top → bottom)
- Display sender identity when available; fall back gracefully
- Keep the UI compact and non-intrusive — does not compete with the input area
- Support own messages in the queue (when the user's own prompt is genuinely queued)

---

## Component Structure

```
Composer (absolute bottom-0)
├── PendingQueue panel         ← replaces PendingIndicator
│   ├── Amber pulse dot + "N waiting" header (1 line)
│   ├── Scrollable list (max-height ~200px, overflow-y: auto)
│   │   └── PendingQueueItem × N
│   │       ├── Sender name (text-xs font-medium, max-w ~80px, truncate)
│   │       ├── Prompt preview (text-xs text-muted-foreground, truncate, flex-1)
│   │       └── View button (icon, opens modal)
│   └── [subtle top border divider]
└── DockShellForm (input area, unchanged)
```

---

## Item Display Rules

| Condition | Sender label |
|-----------|-------------|
| `sender.displayName` present | displayName |
| `sender.username` present | username |
| `sender` is null / own message | "You" |
| No sender info at all | "Unknown" |

Prompt text is always truncated to 1 line with CSS `truncate`. A **View** button (small icon, e.g. `Expand` or `Eye`) opens a modal with the full content.

---

## Own Messages in Queue

Currently `handleMessageQueued` skips items where `turnId ∈ ownTurnIds`. This skip must be removed so that own messages that are genuinely queued appear in the pending list. The sender field for own messages will be `null` → displayed as "You".

Note: when an own message is NOT queued (goes straight to processing), the optimistic UI in the conversation already handles it — no double display.

---

## View Modal

Uses the existing Shadcn `Dialog` component. Content:

- **Title:** sender name
- **Subtitle:** source adapter + timestamp (formatted)
- **Body:** full `userPrompt` text, wrapped, scrollable if long
- **Footer:** Close button

---

## Visual Style

- **Panel background:** `bg-background/80 backdrop-blur border-t border-border/50`
- **Item row:** `flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40`
- **Sender name:** `text-xs font-medium text-foreground shrink-0 max-w-[80px] truncate`
- **Prompt:** `text-xs text-muted-foreground truncate flex-1 min-w-0`
- **View button:** `size-4 opacity-50 hover:opacity-100 transition-opacity`
- **Amber pulse dot:** retained from current implementation as visual indicator
- **Scroll:** native scroll, no custom scrollbar styling needed

---

## Data Flow

No changes to data layer. The component reads from `chat.pending()` which returns `PendingItem[]` for the active session.

```
message:queued SSE  →  pendingBySession[sessionId].push(item)
message:processing  →  pendingBySession[sessionId].remove(turnId)
SSE reconnect       →  getQueue() restores pending items
```

`PendingItem` shape (already defined):
```typescript
interface PendingItem {
  turnId: string
  text: string          // finalPrompt / userPrompt from queue
  sender?: TurnSender | null
  timestamp: string
}
```

---

## Files to Change

| File | Change |
|------|--------|
| `src/openacp/components/chat/pending-indicator.tsx` | Rewrite as `PendingQueue` with list + modal |
| `src/openacp/context/chat.tsx` | Remove `ownTurnIds` skip in `handleMessageQueued` |
| `src/openacp/components/composer.tsx` | Update import name if renamed |

---

## Out of Scope

- Cancelling a pending message from the UI
- Reordering queue items
- Custom avatars or icons per sender
