# Interrupt System + Message Mode — Design Spec

**Date:** 2026-04-14
**Status:** Approved

---

## Problem

1. **Interrupt doesn't persist:** After interrupting a message, switching sessions and back causes the interrupted message to show full content (server version overwrites client state).
2. **No message mode choice:** Users can only queue messages. Some want "instant" mode where sending a new message interrupts the current turn immediately.
3. **Interrupt UI cutoff incomplete:** Text already flushed to store before abort click still renders.

## Design: Hybrid (Client-primary, Server-fallback)

### 1. Message Mode Setting

**Setting:** `messageMode: "queue" | "instant"` in `settings-store.ts`. Default: `"queue"`.

**UI:** Settings dialog → General page → radio group:
- **Queue** (default): Messages queue, process sequentially. Current behavior.
- **Instant**: Sending a new message interrupts the current agent turn and processes the new message immediately.

**Logic in `doSendPrompt()`:**
```typescript
if (messageMode === "instant" && store.streaming) {
  abort()
}
// proceed with sendPrompt normally
```

No server change needed — the existing `cancelPrompt()` + `abortCurrent()` on server handles the mechanics.

### 2. Interrupt UI Cutoff

**On `abort()`:**
1. **Guard:** `abortedSessions` + `abortedTurnId` block incoming SSE events for the aborted turn.
2. **Discard buffers:** `textBuffer.delete(sessionID)` + `charStream.clearStream()` — unrevealed content discarded, no flush.
3. **Mark:** `msg.interrupted = true` in Immer store.
4. **Cache immediately:** `cacheMessages(sessionID, currentMessages)` — saves exact truncated state.
5. **Cancel:** `workspace.client.cancelPrompt(sessionID)` tells server to abort.
6. **Guard cleanup:** Only cleared when:
   - Next turn's `message:processing` arrives (queue drained)
   - User sends a new message (`doSendPrompt` clears guard)
   - 30s fallback timeout

### 3. turnId on Message Type

Add `turnId?: string` to `Message` interface in `types.ts`. Populated from `handleMessageProcessing` event (`ev.turnId`). Used for cache↔server merge matching.

### 4. Interrupt Persistence — Cache + Server Fallback

#### 4a. Cache (primary truth for truncated content)

In `abort()`, after marking `interrupted: true`:
```typescript
const msgs = store.messagesBySession[sessionID]
if (msgs) void cacheMessages(sessionID, [...msgs])
```

Cache stores messages with:
- `interrupted: true` flag
- Text truncated to what was visible at abort time
- `turnId` for matching

#### 4b. Server fallback

**Server change (small):** When `session.abortPrompt()` is called, set `stopReason: "interrupted"` on the current turn in the history recorder. This is the only server-side change.

**App-side:** `historyToMessages()` checks `turn.stopReason === "interrupted"` → sets `msg.interrupted = true` on converted message.

#### 4c. Merge algorithm in `loadHistory()`

```
1. Load cached messages (may have interrupted msgs with truncated text)
2. Load server history → convert to messages (may have interrupted via stopReason)
3. Build turnId→cachedMsg index from cache
4. For each serverMsg:
     cachedMsg = index.get(serverMsg.turnId)
     if cachedMsg?.interrupted:
       use cachedMsg (preserves truncated text + interrupted flag)
     else:
       use serverMsg (server is source of truth for non-interrupted)
5. Append any server-only messages not in cache
6. Cache merged result
```

#### 4d. Fallback when cache miss

If no cached version exists but server returns `stopReason: "interrupted"`:
→ Render full server text + "Interrupted" banner. Better than losing the state entirely.

### 5. Server Change Detail

**File:** `src/core/sessions/session.ts`

In `abortPrompt()`, before calling `queue.abortCurrent()`:
- Access current `activeTurnContext` on the session
- Set a flag or emit event that the history recorder picks up
- History recorder sets `stopReason: "interrupted"` on the turn record

Exact hook point depends on how `activeTurnContext` and history recorder interact — to be determined during implementation.

## Files to Change

### App (OpenACP-App)
| File | Change |
|------|--------|
| `src/openacp/types.ts` | Add `turnId?: string` to `Message` |
| `src/openacp/lib/settings-store.ts` | Add `messageMode: "queue" \| "instant"` default |
| `src/openacp/context/chat.tsx` | abort() caches messages; doSendPrompt() checks messageMode; loadHistory() merge algorithm |
| `src/openacp/context/chat.tsx` | handleMessageProcessing sets `turnId` on messages |
| `src/openacp/components/settings/general-page.tsx` | Message mode radio UI |

### Server (OpenACP)
| File | Change |
|------|--------|
| `src/core/sessions/session.ts` | abortPrompt() marks turn as interrupted |
| History recorder (TBD) | Record `stopReason: "interrupted"` |

## Edge Cases

- **Rapid abort + send:** "Instant" mode calls abort() then sendPrompt() synchronously. Guard ensures no stale events leak.
- **Cache cleared:** Falls back to server `stopReason` — shows full text + Interrupted banner. Acceptable degradation.
- **Cross-adapter messages:** Not affected. Only app-originated turns can be interrupted from app.
- **Multiple aborts in queue:** Each abort only affects the current turn. Queue items proceed normally.
- **Abort during session creation (placeholder):** Abort clears placeholder state; no cache needed since session doesn't exist on server yet.
