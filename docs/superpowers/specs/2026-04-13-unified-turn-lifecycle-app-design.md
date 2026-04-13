# Unified Turn Lifecycle — App Design Spec

## Context

Core changes are on branch `feature/unified-turn-lifecycle` in OpenACP. SSE events now carry richer data:

- `message:queued` — adds `sender?: TurnSender | null`
- `message:processing` — adds `userPrompt`, `finalPrompt`, `attachments`, `sender`
- `agent:event` — adds `turnId`
- New endpoint: `GET /sessions/:id/queue` → `{ pending, processing, queueDepth }`

## Problem

The App currently has inconsistencies in how messages appear:

1. **Self-sent messages**: Optimistic UI creates both user message AND empty assistant message immediately. When `message:processing` SSE arrives, it creates ANOTHER assistant message — potential duplicate.
2. **Cross-adapter messages**: `message:queued` adds user message to conversation immediately (even though middleware hasn't run yet, so the message text may differ from what the agent receives).
3. **No pending indicator**: When multiple messages are queued, the user has no visibility into what's waiting.
4. **No turnId routing for agent events**: Text chunks from `agent:event` are routed by session, not by turn. In theory, if turns overlap (shouldn't happen with serial queue), events could mix.

## Goal

Align the App with the new Core lifecycle:
- `message:queued` = pending indicator (not a conversation entry)
- `message:processing` = conversation entry (user message + assistant stub)
- `agent:event` with `turnId` = route streaming to correct turn
- Pending queue visible near the composer

## Design

### 1. SSE Event Type Updates

**File:** `src/openacp/types.ts`

Update event interfaces to match new Core payloads:

```typescript
interface TurnSender {
  userId: string;
  identityId: string;
  displayName?: string;
  username?: string;
}

interface MessageQueuedEvent {
  sessionId: string;
  turnId: string;
  text: string;
  sourceAdapterId: string;
  attachments?: unknown[];
  timestamp: string;
  queueDepth: number;
  sender?: TurnSender | null;   // NEW
}

interface MessageProcessingEvent {
  sessionId: string;
  turnId: string;
  sourceAdapterId: string;
  userPrompt: string;           // NEW
  finalPrompt: string;          // NEW
  attachments?: unknown[];      // NEW
  sender?: TurnSender | null;   // NEW
  timestamp: string;
}

interface AgentEventEnvelope {
  sessionId: string;
  turnId: string;               // NEW
  event: AgentEvent;
}
```

### 2. New State + Refs

**File:** `src/openacp/context/chat.tsx`

Add pending queue state to ChatStore:

```typescript
interface PendingItem {
  turnId: string;
  text: string;
  sender?: TurnSender | null;
  timestamp: string;
}

// Add to ChatStore:
pendingBySession: Record<string, PendingItem[]>
```

Add new ref for turnId-based assistant message routing:

```typescript
// Maps SSE turnId → assistant message ID (for agent:event routing)
turnIdToAssistantMsgId: MutableRefObject<Record<string, string>>
```

This supplements the existing `turnIdToUserMsgId` and `assistantMsgId` refs.

**Cleanup:** Both `turnIdToAssistantMsgId` and `turnIdToUserMsgId` entries should be deleted when a turn completes (on `usage` event or when streaming ends for a session). This prevents unbounded growth.

### 3. `message:queued` Handler — Pending Indicator Only

**Current behavior:** Adds user message to conversation.

**New behavior:** Add to pending list. Do NOT add to conversation.

```
handleMessageQueued(ev):
  // Skip if this app instance sent this message (ownTurnIds check — keep existing logic)
  if (ownTurnIds.has(ev.turnId)) return

  // Detect old Core: if sender field is completely absent (not null, but undefined),
  // the Core hasn't been updated — fall back to legacy behavior (add to conversation directly)
  if (!('sender' in ev)) {
    // Legacy path — add user message to conversation (existing behavior)
    // ... keep old handleMessageQueued logic as fallback
    return
  }

  // New path: add to pending list, NOT to conversation
  pendingBySession[ev.sessionId].push({
    turnId: ev.turnId,
    text: ev.text,
    sender: ev.sender,
    timestamp: ev.timestamp,
  })
```

For **self-sent messages**: The `ownTurnIds` check already suppresses this event. No change needed — the user already sees their message via optimistic UI.

**Edge case — middleware blocks:** If `agent:beforePrompt` middleware blocks a prompt, `MESSAGE_QUEUED` was already emitted but `MESSAGE_PROCESSING` will never arrive. The pending item becomes stale. This is resolved by:
- On session switch or reconnect: `GET /queue` returns empty → stale items cleared
- On history reload: pending items for turns that already appear in history are removed
- Middleware blocking is rare in practice (only happens for security/rate-limit plugins)

### 4. `message:processing` Handler — Create Conversation Entry

**Current behavior:** Creates empty assistant message only.

**New behavior:** Creates user message (for cross-adapter) + assistant message.

```
handleMessageProcessing(ev):
  // Remove from pending list
  remove ev.turnId from pendingBySession[ev.sessionId]

  if (ownTurnIds.has(ev.turnId)):
    // Self-sent: user message already visible via optimistic UI.
    // Don't create duplicate user message.
    // Create assistant message now (optimistic UI no longer creates it — see section 6).
    const astMsgId = createId()
    const userMsgId = turnIdToUserMsgId.current[ev.turnId]
    addMessage(ev.sessionId, {
      id: astMsgId,
      role: "assistant",
      parentID: userMsgId,
      parts: [], blocks: [],
      createdAt: Date.now(),
    })
    assistantMsgId.current[ev.sessionId] = astMsgId
    turnIdToAssistantMsgId.current[ev.turnId] = astMsgId
    streaming = true
    streamingSession = ev.sessionId
    ownTurnIds.delete(ev.turnId)
    return

  // Cross-adapter: create user message + assistant message
  let userMsgId: string | undefined

  if (ev.userPrompt) {
    // New Core: create user message from processing event (userPrompt = what user typed)
    userMsgId = createId()
    addMessage(ev.sessionId, {
      id: userMsgId,
      role: "user",
      text: ev.userPrompt,
      sourceAdapterId: ev.sourceAdapterId,
      sender: ev.sender,
      createdAt: new Date(ev.timestamp).getTime(),
    })
  }
  // else: Legacy Core without userPrompt — user message was already added
  // by message:queued fallback (see section 3). Only create assistant message.

  // Create empty assistant message
  const astMsgId = createId()
  addMessage(ev.sessionId, {
    id: astMsgId,
    role: "assistant",
    parentID: userMsgId ?? turnIdToUserMsgId.current[ev.turnId],
    parts: [], blocks: [],
    createdAt: Date.now(),
  })

  // Track for agent:event routing
  assistantMsgId.current[ev.sessionId] = astMsgId
  turnIdToAssistantMsgId.current[ev.turnId] = astMsgId
  streaming = true
  streamingSession = ev.sessionId
```

### 5. `agent:event` Handler — Route by turnId

**Current behavior:** Routes by sessionId only — writes to `assistantMsgId.current[sessionId]`.

**New behavior:** Use `turnId` from envelope to route to correct assistant message.

```
handleAgentEvent(envelope):
  const { sessionId, turnId, event } = envelope

  // Try turnId-based routing first, fall back to session-based
  const targetMsgId = turnIdToAssistantMsgId.current[turnId]
    ?? assistantMsgId.current[sessionId]

  // Rest of event handling unchanged, just use targetMsgId

  // Cleanup turnId maps when turn ends (usage event = final event of a turn)
  if (event.type === 'usage' && turnId) {
    delete turnIdToAssistantMsgId.current[turnId]
    delete turnIdToUserMsgId.current[turnId]
  }
```

This is backward-compatible: if `turnId` is empty or not mapped, falls back to existing behavior.

### 6. Optimistic UI — Simplify

**Current behavior:** Creates both user message AND empty assistant message on send.

**New behavior:** Only create user message optimistically. Assistant message is created when `message:processing` arrives.

```
doSendPrompt(text, attachments):
  // 1. Create user message (optimistic) — KEEP
  addMessage(sessionID, { role: "user", text, attachments, ... })

  // 2. DON'T create assistant message here — wait for message:processing
  // REMOVE: addMessage(sessionID, { role: "assistant", ... })

  // 3. Track turnId
  ownTurnIds.add(turnId)
  turnIdToUserMsgId.current[turnId] = userMsgId

  // 4. Send to server
  await workspace.client.sendPrompt(sessionID, text, attachments, turnId)
```

**Why:** When `message:processing` arrives (typically <100ms later), it creates the assistant message. This eliminates the duplicate assistant message issue. The user sees their message immediately (optimistic) and then "Thinking..." appears when processing starts — natural UX.

**Edge case:** If SSE is disconnected and `message:processing` never arrives, the user sees their message but no response. On reconnect, history reload fills in the response. This is the same behavior as today.

### 7. Pending Indicator UI

**File:** `src/openacp/components/composer.tsx` (or new child component)

Show a pending indicator above the composer when there are queued messages:

```
PendingIndicator:
  items = pendingBySession[activeSession]

  if items.length === 0: return null

  // Show compact list:
  // "2 messages waiting"
  // Or for single: "Message from @alice waiting..."
  // Clicking expands to show preview text
```

Design: Small badge/chip above the input area. Minimal, non-intrusive.

### 8. Reconnect — Restore Pending State

On SSE reconnect, the App already reloads history. Additionally, fetch pending queue:

```
onReconnect():
  // Existing: reload history
  await loadHistory(activeSession)

  // New: restore pending state
  const queueState = await workspace.client.getQueue(activeSession)
  pendingBySession[activeSession] = queueState.pending.map(item => ({
    turnId: item.turnId ?? '',
    text: item.userPrompt,
    sender: null,       // queue API doesn't carry sender
    timestamp: '',
  }))
```

### 9. API Client — Add getQueue

**File:** `src/openacp/api/client.ts`

```typescript
async getQueue(sessionID: string): Promise<{
  pending: Array<{ userPrompt: string; turnId?: string }>;
  processing: boolean;
  queueDepth: number;
}> {
  return api(`/sessions/${encodeURIComponent(sessionID)}/queue`);
}
```

## Files Changed

| File | Change |
|------|--------|
| `src/openacp/types.ts` | Update event interfaces (TurnSender, new fields) |
| `src/openacp/context/chat.tsx` | Pending state, updated handlers, simplified optimistic UI |
| `src/openacp/api/client.ts` | Add getQueue method |
| `src/openacp/api/sse.ts` | Update event type parsing for new fields |
| `src/openacp/components/composer.tsx` | Add PendingIndicator |

## Migration / Backward Compatibility

**Deployment order: Core MUST be updated before App.** The new App behavior depends on Core sending `userPrompt` in `message:processing` and `turnId` in `agent:event`. Without these fields, cross-adapter messages would appear in pending but never move to conversation.

**Defensive fallback** (if App connects to an older Core):
- If `message:processing` lacks `userPrompt`: fall back to legacy behavior — create assistant message only (don't try to create user message). Cross-adapter user messages would come via `message:queued` adding to conversation directly (legacy path).
- If `agent:event` lacks `turnId`: fall back to session-based routing (existing behavior).
- All new fields should use optional chaining (`ev.userPrompt ?? undefined`).

## Not In Scope

- Redesign of message display components
- Message editing/updating after middleware modification
- Queue reordering or cancellation UI
- Sender avatar/name display (requires design decision on identity UI)
