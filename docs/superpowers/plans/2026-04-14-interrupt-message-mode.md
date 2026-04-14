# Interrupt System + Message Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistent interrupt state across session switches + queue/instant message mode setting.

**Architecture:** Client-primary with server fallback. Cache stores truncated interrupted messages; server marks turns with `stopReason: "interrupted"` as fallback. Message mode is a client-only setting that calls `abort()` before `sendPrompt()` in instant mode.

**Tech Stack:** React (Immer), Tauri store, TypeScript, Node.js server

---

### Task 1: Add `turnId` to Message type and populate it

**Files:**
- Modify: `src/openacp/types.ts:125-140`
- Modify: `src/openacp/context/chat.tsx:91-128` (turnToMessage)
- Modify: `src/openacp/context/chat.tsx:862-930` (handleMessageProcessing)

- [ ] **Step 1: Add `turnId` to Message interface**

In `src/openacp/types.ts`, add after `interrupted` field (line 139):

```typescript
  interrupted?: boolean
  /** Server turn index — used for cache↔server merge matching */
  turnId?: string
}
```

- [ ] **Step 2: Set turnId in `turnToMessage()` from server history**

In `src/openacp/context/chat.tsx`, in `turnToMessage()`, after building `msg` (line 113), add:

```typescript
  const msg: Message = {
    id, role: turn.role, sessionID: sessionId,
    parts, blocks,
    createdAt: new Date(turn.timestamp).getTime(),
    turnId: String(turn.index),
  }
```

Also set `interrupted` from server stopReason (line 114, after createdAt):

```typescript
    turnId: String(turn.index),
    interrupted: turn.stopReason === "interrupted" || undefined,
  }
```

- [ ] **Step 3: Set turnId on messages created in `handleMessageProcessing()`**

In `handleMessageProcessing()`, when creating user and assistant messages for ownTurnIds path, add `turnId: ev.turnId` to both message objects. Same for cross-adapter path.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/types.ts src/openacp/context/chat.tsx
git commit -m "feat(chat): add turnId to Message type and populate from history + SSE"
```

---

### Task 2: Cache interrupted messages on abort

**Files:**
- Modify: `src/openacp/context/chat.tsx:1214-1261` (abort function)

- [ ] **Step 1: Add cache call in `abort()` after marking interrupted**

After `syncRef(sessionID, draft)` in the abort setStore callback, add a cache call. The full abort section that marks interrupted + caches:

```typescript
    if (currentMsgId) {
      setStore((draft) => {
        const msgs = draft.messagesBySession[sessionID]
        if (msgs) {
          const msg = msgs.find((m) => m.id === currentMsgId)
          if (msg) msg.interrupted = true
        }
        syncRef(sessionID, draft)
      })
      // Cache immediately with truncated content + interrupted flag
      const msgs = messagesRef.current[sessionID]
      if (msgs) void cacheMessages(sessionID, [...msgs])
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/openacp/context/chat.tsx
git commit -m "feat(chat): cache interrupted messages immediately on abort"
```

---

### Task 3: Merge algorithm in `loadHistory()` — preserve interrupted cache

**Files:**
- Modify: `src/openacp/context/chat.tsx:287-358` (loadHistory)

- [ ] **Step 1: Update merge logic to preserve cached interrupted messages**

Replace the merge section (lines 309-347) with turnId-aware merge:

```typescript
      if (history && history.turns.length > 0) {
        const serverMessages = historyToMessages(history)
        const local = messagesRef.current[sessionID] ?? []

        // Build index of cached interrupted messages by turnId
        const cachedByTurnId = new Map<string, Message>()
        // Check both in-memory and previously-cached messages
        const cachedMsgs = local.length > 0 ? local : (await loadCachedMessages(sessionID).catch(() => null)) ?? []
        for (const m of cachedMsgs) {
          if (m.turnId && m.interrupted) cachedByTurnId.set(m.turnId, m)
        }

        // Merge: prefer cached version for interrupted messages, server for everything else
        const merged: Message[] = []
        for (const serverMsg of serverMessages) {
          const cached = serverMsg.turnId ? cachedByTurnId.get(serverMsg.turnId) : undefined
          if (cached) {
            merged.push(cached) // truncated text + interrupted flag preserved
          } else {
            merged.push(serverMsg)
          }
        }

        // Keep user inFlight messages not yet on server
        const lastServerTime = new Date(history.turns[history.turns.length - 1].timestamp).getTime()
        const serverUserTexts = new Set(
          serverMessages
            .filter((m) => m.role === "user")
            .flatMap((m) => m.parts.filter((p) => p.type === "text").map((p) => (p as { content: string }).content))
        )
        const inFlight = local.filter((m) => {
          if (m.createdAt <= lastServerTime || m.role !== "user") return false
          const text = m.parts.find((p) => p.type === "text") as { content: string } | undefined
          return !text || !serverUserTexts.has(text.content)
        })

        if (assistantMsgId.current.get(sessionID) === streamingPlaceholderAtStart) {
          assistantMsgId.current.delete(sessionID)
          setStore((draft) => { draft.streaming = false; draft.streamingSession = undefined })
        }

        setMessages(sessionID, [...merged, ...inFlight])
        void cacheMessages(sessionID, merged)
      }
```

- [ ] **Step 2: Commit**

```bash
git add src/openacp/context/chat.tsx
git commit -m "feat(chat): turnId-aware merge preserves interrupted messages from cache"
```

---

### Task 4: Server — mark interrupted turns with stopReason

**Files:**
- Modify: `/Users/longdao/Projects/OpenACP/src/core/sessions/session.ts:112,384-416,699-708`

- [ ] **Step 1: Add `_promptAborted` flag to Session class**

After `activeTurnContext` declaration (line 112):

```typescript
  activeTurnContext: TurnContext | null = null;
  /** Set by abortPrompt(), read by processPrompt() to override stopReason */
  private _promptAborted = false;
```

- [ ] **Step 2: Set flag in `abortPrompt()`**

In `abortPrompt()`, before `queue.abortCurrent()`:

```typescript
  async abortPrompt(): Promise<void> {
    if (this.middlewareChain) {
      const result = await this.middlewareChain.execute(Hook.AGENT_BEFORE_CANCEL, { sessionId: this.id }, async (p) => p);
      if (!result) return;
    }
    this._promptAborted = true;
    this.queue.abortCurrent();
    this.log.info("Prompt aborted (queue preserved, %d pending)", this.queue.pending);
    await this.agentInstance.cancel();
  }
```

- [ ] **Step 3: Read flag in `processPrompt()` finally block**

In `processPrompt()`, at the start (before the try block around line 384), reset the flag:

```typescript
    this._promptAborted = false;
    let stopReason: string = 'end_turn';
```

In the finally block, before firing `turn:end` hook (line 414), override stopReason:

```typescript
      const finalStopReason = this._promptAborted ? 'interrupted' : stopReason;

      if (this.middlewareChain) {
        this.middlewareChain.execute(Hook.TURN_END, { sessionId: this.id, stopReason: finalStopReason as import('../types.js').StopReason, durationMs: Date.now() - promptStart, turnId: finalTurnId, meta }, async (p) => p).catch(() => {});
      }

      if (this.middlewareChain) {
        this.middlewareChain.execute(Hook.AGENT_AFTER_TURN, {
          sessionId: this.id,
          turnId: finalTurnId,
          fullText: turnTextBuffer.join(''),
          stopReason: finalStopReason as import('../types.js').StopReason,
          meta,
        }, async (p) => p).catch(() => {});
      }
```

- [ ] **Step 4: Build server**

```bash
cd /Users/longdao/Projects/OpenACP && npm run build
```

- [ ] **Step 5: Commit server changes**

```bash
cd /Users/longdao/Projects/OpenACP
git add src/core/sessions/session.ts
git commit -m "feat(session): mark aborted turns with stopReason 'interrupted'"
```

---

### Task 5: Message mode setting + UI

**Files:**
- Modify: `src/openacp/lib/settings-store.ts:5-35`
- Modify: `src/openacp/components/settings/settings-general.tsx`
- Modify: `src/openacp/context/chat.tsx` (doSendPrompt)

- [ ] **Step 1: Add `messageMode` to settings store**

In `src/openacp/lib/settings-store.ts`, add to `AppSettings` interface:

```typescript
  messageMode: "queue" | "instant"
```

Add to `defaults`:

```typescript
  messageMode: "queue",
```

- [ ] **Step 2: Add message mode UI in settings-general.tsx**

After the "General" SettingCard, add a new card:

```tsx
      <SettingCard title="Chat">
        <SettingRow label="Message mode" description="How new messages are handled when the agent is responding">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-fg-weak focus:outline-none focus:ring-1 focus:ring-border-selected min-w-[160px]"
            value={messageMode}
            onChange={async (e) => {
              const next = e.target.value as "queue" | "instant"
              setMessageMode(next)
              await setSetting("messageMode", next)
            }}
          >
            <option value="queue">Queue</option>
            <option value="instant">Instant</option>
          </select>
        </SettingRow>
      </SettingCard>
```

Add state + effect:

```tsx
  const [messageMode, setMessageMode] = useState<"queue" | "instant">("queue")

  // In useEffect:
  void getSetting("messageMode").then(setMessageMode)
```

- [ ] **Step 3: Read messageMode in `doSendPrompt()` and auto-abort**

In `doSendPrompt()` in `chat.tsx`, after the abort guard cleanup and before turnId generation:

```typescript
    // Instant mode: interrupt current turn before sending new message
    if (store.streaming && store.activeSession) {
      const mode = await getSetting("messageMode")
      if (mode === "instant") {
        abort()
      }
    }
```

Import `getSetting` at the top of chat.tsx if not already imported.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/lib/settings-store.ts src/openacp/components/settings/settings-general.tsx src/openacp/context/chat.tsx
git commit -m "feat(settings): add message mode setting (queue/instant)"
```
