# Unified Turn Lifecycle App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the App with the new Core turn lifecycle — `message:queued` as pending indicator, `message:processing` as conversation entry, `agent:event` routed by `turnId`.

**Architecture:** Update SSE event types to match enriched Core payloads. Refactor chat context handlers: `message:queued` adds to pending list (not conversation), `message:processing` creates user + assistant messages, `agent:event` routes by turnId. Simplify optimistic UI to only create user message (assistant created on processing). Add PendingIndicator component near composer.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-13-unified-turn-lifecycle-app-design.md`

---

### Task 1: Update Event Type Definitions

**Files:**
- Modify: `src/openacp/types.ts:219-280`

- [ ] **Step 1: Add TurnSender interface**

In `src/openacp/types.ts`, add before the `MessageQueuedEvent` interface (around line 264):

```typescript
/** Sender identity from the auto-register middleware */
export interface TurnSender {
  userId: string
  identityId: string
  displayName?: string
  username?: string
}
```

- [ ] **Step 2: Update MessageQueuedEvent**

Replace the `MessageQueuedEvent` interface (lines 265-273):

```typescript
export interface MessageQueuedEvent {
  sessionId: string
  turnId: string
  text: string
  sourceAdapterId: string
  attachments?: unknown[]
  timestamp: string
  queueDepth: number
  sender?: TurnSender | null
}
```

- [ ] **Step 3: Update MessageProcessingEvent**

Replace the `MessageProcessingEvent` interface (lines 275-280):

```typescript
export interface MessageProcessingEvent {
  sessionId: string
  turnId: string
  sourceAdapterId: string
  /** Original prompt text (after message:incoming, before agent:beforePrompt) */
  userPrompt?: string
  /** Processed prompt text (after agent:beforePrompt middleware) */
  finalPrompt?: string
  attachments?: unknown[]
  sender?: TurnSender | null
  timestamp: string
}
```

Note: `userPrompt` and `finalPrompt` are optional for backward compat with older Core.

- [ ] **Step 4: Update AgentEvent interface**

Replace the `AgentEvent` interface (lines 219-222):

```typescript
export interface AgentEvent {
  sessionId: string
  turnId?: string
  event: AgentEventPayload
}
```

`turnId` is optional for backward compat.

- [ ] **Step 5: Verify build**

Run: `cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build`

Expected: Clean build (new fields are optional, existing code still works).

- [ ] **Step 6: Commit**

```bash
git add src/openacp/types.ts
git commit -m "feat(types): add TurnSender and enrich SSE event interfaces"
```

---

### Task 2: Add getQueue to API Client

**Files:**
- Modify: `src/openacp/api/client.ts`

- [ ] **Step 1: Add getQueue method**

In `src/openacp/api/client.ts`, add after the `sendPrompt` method (around line 168):

```typescript
  async getQueue(sessionID: string): Promise<{
    pending: Array<{ userPrompt: string; turnId?: string }>
    processing: boolean
    queueDepth: number
  }> {
    return this.api(`/sessions/${encodeURIComponent(sessionID)}/queue`)
  }
```

Check how `this.api` is referenced — it may be a local function. Match the pattern used by `sendPrompt`.

- [ ] **Step 2: Verify build**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/api/client.ts
git commit -m "feat(api): add getQueue method for pending queue state"
```

---

### Task 3: Update Chat Context — State, Refs, Handlers

This is the main task. Read `src/openacp/context/chat.tsx` carefully before editing.

**Files:**
- Modify: `src/openacp/context/chat.tsx`

- [ ] **Step 1: Add PendingItem type and pendingBySession to ChatStore**

Add the PendingItem interface near the top of the file (before ChatStore):

```typescript
interface PendingItem {
  turnId: string
  text: string
  sender?: import("../types").TurnSender | null
  timestamp: string
}
```

Add `pendingBySession` to the ChatStore interface (around line 155-164):

```typescript
interface ChatStore {
  messagesBySession: Record<string, Message[]>
  pendingBySession: Record<string, PendingItem[]>  // NEW
  activeSession: string | undefined
  streaming: boolean
  streamingSession: string | undefined
  loadingHistory: boolean
  sseStatus: 'connected' | 'reconnecting' | 'disconnected'
  scrollTrigger: number
}
```

Initialize `pendingBySession: {}` in the initial store state (wherever the store is initialized with `useState` or similar).

- [ ] **Step 2: Add turnIdToAssistantMsgId ref**

After the existing `turnIdToUserMsgId` ref (around line 188), add:

```typescript
const turnIdToAssistantMsgId = useRef(new Map<string, string>())
```

- [ ] **Step 3: Rewrite handleMessageQueued**

Replace the `handleMessageQueued` function (lines 740-778):

```typescript
function handleMessageQueued(ev: MessageQueuedEvent) {
  // Skip if this app instance sent this message
  if (ownTurnIds.current.has(ev.turnId)) return

  // Detect old Core: if sender field is absent, fall back to legacy behavior
  if (!('sender' in ev)) {
    // Legacy path — add user message to conversation directly (existing behavior)
    const sid = ev.sessionId
    if (sendingRef.current?.sessionId === sid) return

    const userMsgId = nextId("usr-ext")
    turnIdToUserMsgId.current.set(ev.turnId, userMsgId)

    setStore(draft => {
      const msgs = draft.messagesBySession[sid] ??= []
      msgs.push({
        id: userMsgId,
        role: "user",
        sessionID: sid,
        parts: [{ type: "text", content: ev.text }],
        blocks: [{ type: "text", id: nextId("blk"), content: ev.text, isStreaming: false }],
        createdAt: new Date(ev.timestamp).getTime(),
        sourceAdapterId: ev.sourceAdapterId,
      })
      msgs.sort((a, b) => a.createdAt - b.createdAt)
      draft.scrollTrigger++
    })
    messagesRef.current = store.messagesBySession
    window.dispatchEvent(new CustomEvent("workspace-activity"))
    return
  }

  // New path: add to pending list, NOT to conversation
  setStore(draft => {
    const pending = draft.pendingBySession[ev.sessionId] ??= []
    pending.push({
      turnId: ev.turnId,
      text: ev.text,
      sender: ev.sender,
      timestamp: ev.timestamp,
    })
  })
}
```

- [ ] **Step 4: Rewrite handleMessageProcessing**

Replace the `handleMessageProcessing` function (lines 780-794):

```typescript
function handleMessageProcessing(ev: MessageProcessingEvent) {
  const sid = ev.sessionId

  // Remove from pending list
  setStore(draft => {
    const pending = draft.pendingBySession[sid]
    if (pending) {
      const idx = pending.findIndex(p => p.turnId === ev.turnId)
      if (idx !== -1) pending.splice(idx, 1)
    }
  })

  if (ownTurnIds.current.has(ev.turnId)) {
    // Self-sent: user message already visible via optimistic UI.
    // Create assistant message now (optimistic UI no longer creates it).
    const astMsgId = nextId("ast")
    const userMsgId = turnIdToUserMsgId.current.get(ev.turnId)
    assistantMsgId.current.set(sid, astMsgId)
    turnIdToAssistantMsgId.current.set(ev.turnId, astMsgId)
    ownTurnIds.current.delete(ev.turnId)

    setStore(draft => {
      const msgs = draft.messagesBySession[sid] ??= []
      msgs.push({
        id: astMsgId,
        role: "assistant",
        sessionID: sid,
        parentID: userMsgId,
        parts: [],
        blocks: [],
        createdAt: Date.now(),
      })
      draft.streaming = true
      draft.streamingSession = sid
      draft.scrollTrigger++
    })
    return
  }

  // Cross-adapter: create user message + assistant message
  let userMsgId: string | undefined

  if (ev.userPrompt) {
    // New Core: create user message from processing event
    userMsgId = nextId("usr-ext")
    turnIdToUserMsgId.current.set(ev.turnId, userMsgId)
  }
  // else: Legacy Core — user message was already added by message:queued fallback

  const astMsgId = nextId("ast-ext")
  assistantMsgId.current.set(sid, astMsgId)
  turnIdToAssistantMsgId.current.set(ev.turnId, astMsgId)

  setStore(draft => {
    const msgs = draft.messagesBySession[sid] ??= []

    if (userMsgId && ev.userPrompt) {
      msgs.push({
        id: userMsgId,
        role: "user",
        sessionID: sid,
        parts: [{ type: "text", content: ev.userPrompt }],
        blocks: [{ type: "text", id: nextId("blk"), content: ev.userPrompt, isStreaming: false }],
        createdAt: new Date(ev.timestamp).getTime(),
        sourceAdapterId: ev.sourceAdapterId,
      })
    }

    msgs.push({
      id: astMsgId,
      role: "assistant",
      sessionID: sid,
      parentID: userMsgId ?? turnIdToUserMsgId.current.get(ev.turnId),
      parts: [],
      blocks: [],
      createdAt: Date.now(),
    })

    msgs.sort((a, b) => a.createdAt - b.createdAt)
    draft.streaming = true
    draft.streamingSession = sid
    draft.scrollTrigger++
  })

  messagesRef.current = store.messagesBySession
  window.dispatchEvent(new CustomEvent("workspace-activity"))
}
```

- [ ] **Step 5: Update agent:event handler — route by turnId + cleanup**

In the `handleAgentEvent` function (starts around line 541), find where it resolves the target assistant message ID. It currently uses `assistantMsgId.current.get(sessionId)`. Update the resolution to try turnId first:

```typescript
// At the start of handleAgentEvent, after extracting sessionId:
const turnId = (ev as any).turnId as string | undefined
const targetMsgId = (turnId && turnIdToAssistantMsgId.current.get(turnId))
  ?? assistantMsgId.current.get(ev.sessionId)
```

Use `targetMsgId` instead of `assistantMsgId.current.get(...)` throughout the handler.

At the end of the `usage` event handling (where streaming stops), add cleanup:

```typescript
// After setting streaming = false for usage event:
if (turnId) {
  turnIdToAssistantMsgId.current.delete(turnId)
  turnIdToUserMsgId.current.delete(turnId)
}
```

- [ ] **Step 6: Update doSendPrompt — remove optimistic assistant message**

In `doSendPrompt` (lines 812-855), remove the optimistic assistant message creation. Keep the user message creation.

Remove these lines (around 830-835):
```typescript
// REMOVE: const astMsgId = nextId("ast")
// REMOVE: assistantMsgId.current.set(sessionID, astMsgId)
// REMOVE: the assistant message push to msgs array
```

Keep:
- User message creation
- `ownTurnIds.current.add(turnId)`
- `turnIdToUserMsgId.current.set(turnId, userMsgId)` — add this if not present
- The API call
- `streaming = true` and `scrollTrigger++` — keep these so the UI shows "waiting" state

Also remove the `assistantMsgId.current.set(sessionID, astMsgId)` line since we're not creating astMsgId anymore.

**Important:** Check if `streaming = true` is set in doSendPrompt. If it is, keep it — the UI will show a "waiting" state until the assistant message appears from message:processing.

- [ ] **Step 7: Expose pendingBySession in ChatContext**

Add a `pending()` method to the ChatContext interface and implementation so components can access it:

```typescript
// In ChatContext interface (around line 19-33):
pending: () => PendingItem[]

// In the provider implementation:
pending: () => store.pendingBySession[store.activeSession ?? ''] ?? [],
```

- [ ] **Step 8: Add queue restore on reconnect**

In the SSE reconnect effect (around lines 932-939), after the existing history reload, add queue state restoration:

```typescript
// After: await loadHistory(activeSession)
// Add:
if (activeSession && workspace.client.getQueue) {
  try {
    const queueState = await workspace.client.getQueue(activeSession)
    setStore(draft => {
      draft.pendingBySession[activeSession] = queueState.pending.map(item => ({
        turnId: item.turnId ?? '',
        text: item.userPrompt,
        sender: null,
        timestamp: '',
      }))
    })
  } catch {
    // Queue endpoint may not exist on older Core — ignore
  }
}
```

- [ ] **Step 9: Verify build**

Run: `pnpm build`

Expected: Clean build.

- [ ] **Step 10: Commit**

```bash
git add src/openacp/context/chat.tsx
git commit -m "feat(chat): unified turn lifecycle handlers

message:queued → pending indicator (not conversation entry)
message:processing → creates user + assistant messages
agent:event → routes by turnId with session fallback
Optimistic UI only creates user message (assistant on processing)
Pending state restored on SSE reconnect"
```

---

### Task 4: PendingIndicator Component

**Files:**
- Create: `src/openacp/components/chat/pending-indicator.tsx`

- [ ] **Step 1: Create PendingIndicator component**

Create `src/openacp/components/chat/pending-indicator.tsx`:

```tsx
import { useChat } from "../../context/chat"
import type { PendingItem } from "../../context/chat"

export function PendingIndicator() {
  const chat = useChat()
  const items = chat.pending()

  if (items.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground">
      <div className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
      <span>
        {items.length === 1
          ? items[0].sender?.displayName
            ? `Message from ${items[0].sender.displayName} waiting...`
            : "1 message waiting..."
          : `${items.length} messages waiting...`}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/chat/pending-indicator.tsx
git commit -m "feat(ui): add PendingIndicator component for queued messages"
```

---

### Task 5: Integrate PendingIndicator into Composer

**Files:**
- Modify: `src/openacp/components/composer.tsx`

- [ ] **Step 1: Add PendingIndicator above the input area**

Import the component at the top:

```typescript
import { PendingIndicator } from "./chat/pending-indicator"
```

Find the composer's main container. Insert `<PendingIndicator />` just above the input area (around line 560, before the editable div). Look for the JSX structure and place it logically:

```tsx
{/* Insert before the input/editor div */}
<PendingIndicator />
```

The exact placement depends on the JSX structure — read the file to find the right location. The indicator should appear between the message list and the input area.

- [ ] **Step 2: Verify build and visual check**

Run: `pnpm build`

Then run `pnpm dev` and visually verify:
- No pending indicator when queue is empty
- Indicator appears when cross-adapter message is queued (test with another adapter)

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/composer.tsx
git commit -m "feat(composer): integrate PendingIndicator above input area"
```

---

### Task 6: Export PendingItem type + Final Verification

**Files:**
- Modify: `src/openacp/context/chat.tsx` (if PendingItem needs export)

- [ ] **Step 1: Ensure PendingItem is exported**

If the PendingIndicator component imports `PendingItem` from chat context, make sure it's exported:

```typescript
export interface PendingItem { ... }
```

- [ ] **Step 2: Full build**

Run: `pnpm build`

Expected: Clean build, zero errors.

- [ ] **Step 3: Visual smoke test**

Run: `pnpm dev`

Test these scenarios:
1. **Self-sent**: Type message, send → user message appears immediately → "Thinking..." appears shortly after → streaming response flows in
2. **No pending indicator** when sending own messages
3. **Build passes** with no TypeScript errors

- [ ] **Step 4: Commit if needed**

```bash
git add -u
git commit -m "fix: export PendingItem type, final cleanup"
```
