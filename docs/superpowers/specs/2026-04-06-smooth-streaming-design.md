# Smooth Streaming UI — Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Scope:** `OpenACP-App` — `src/openacp/` only

---

## Problem

The current streaming pipeline has two buffering layers that chain together, causing laggy and "chunky" text reveal:

1. **Layer 1** — SSE text events are batched via `requestAnimationFrame` (~16ms) before being written to the Immer store.
2. **Layer 2** — The `Markdown` component has its own `setTimeout`-based cursor that advances 1–3 **words** every 5–15ms before patching the DOM.

This produces text that always lags behind reality, reveals in word-sized jumps (not characters), and has no smooth entrance animations for tool/plan blocks.

---

## Goals

- Character-by-character smooth text streaming for **text blocks** and **thinking blocks**.
- Smooth entrance animations for **tool blocks** and **plan blocks** (no character streaming needed).
- Single RAF drain loop — remove double-buffering.
- No new library dependencies (use `motion` already installed, keep `morphdom`).
- Preserve all existing components and their behaviors; changes are additive or surgical.

---

## Architecture

### Old pipeline (double-buffered)

```
SSE text event
  → textBuffer (rAF ~16ms batch)
  → setStore(Immer) → React re-render
  → Markdown cursor tick (setTimeout 5–15ms, word-based)
  → morphdom DOM patch
```

### New pipeline (single-path)

```
SSE text event
  → CharStream.push(streamId, text)    ← immediate, no batching
       ↓
  Global rAF drain loop (one loop for all active streams)
  Adaptive: 80 chars/frame base, 200 chars/frame if lag > 300 chars
       ↓
  subscribeDisplay callback → renderMarkdown(displayText) → morphdom

SSE text event
  → textBuffer → rAF → setStore(Immer, startTransition)
                       ← retained for persistence and history
```

The display path and the persistence path are now independent. Display is driven by `CharStream`; the Immer store is updated lazily via `startTransition` and used only for persistence, history loading, and non-streaming renders.

---

## Module Changes

| File | Type | Summary |
|------|------|---------|
| `src/openacp/lib/char-stream.ts` | **New** | CharStream singleton — push, subscribe, flush, clear |
| `src/openacp/context/chat.tsx` | Edit | Push to CharStream on text/thought events; wrap `setStore` in `startTransition`; flush/clear on stream end |
| `src/openacp/components/ui/markdown.tsx` | Edit | Remove word-cursor + setTimeout loop; subscribe CharStream via `streamId` prop |
| `src/openacp/components/chat/blocks/text-block.tsx` | Edit | Pass `streamId` to `Markdown` |
| `src/openacp/components/chat/blocks/thinking-block.tsx` | Edit | Subscribe CharStream for display content; direct DOM ref update |
| `src/openacp/components/chat/blocks/tool-block.tsx` | Edit | Add `motion.div` entrance animation |
| `src/openacp/components/chat/blocks/plan-block.tsx` | Edit | Add `motion.div` entrance animation |

---

## Module Specs

### 1. `src/openacp/lib/char-stream.ts`

A module-level singleton (no React context needed — pure JS).

**Internal state per stream:**
```ts
type Stream = {
  buffer: string    // full accumulated text (all chars received so far)
  cursor: number    // how many chars have been revealed to the display
  listeners: Set<(text: string) => void>
}
```

**Public API:**
```ts
pushChars(streamId: string, text: string): void
// Appends text to buffer for the given stream, schedules rAF drain if not running.

subscribeDisplay(streamId: string, cb: (displayText: string) => void): () => void
// Registers a callback. Returns unsubscribe function.
// cb is called on each rAF drain tick with buffer.slice(0, cursor).

flush(streamId: string): string
// Immediately advances cursor to buffer.length, calls all listeners once.
// Returns the full buffer text. Called when streaming ends.

clearStream(streamId: string): void
// Removes the stream entry. Called after flush, once component has done final render.
```

**Drain algorithm (called by rAF loop):**
```
for each active stream:
  lag = buffer.length - cursor
  if lag === 0: skip
  charsThisFrame = lag > 300 ? 200 : 80
  cursor = min(cursor + charsThisFrame, buffer.length)
  notify all listeners with buffer.slice(0, cursor)

if any stream still has lag > 0:
  requestAnimationFrame(drain)   ← loop continues
else:
  rafScheduled = false           ← loop stops, restarts on next pushChars
```

**Stream ID conventions:**
- Text block: `${sessionID}:text`
- Thinking block: `${sessionID}:thought`
- A session has at most one active text stream and one active thought stream at any time.

---

### 2. `src/openacp/context/chat.tsx`

**On `text` SSE event:**
```ts
case "text": {
  ensureAssistantMessage(sessionID)
  charStream.pushChars(`${sessionID}:text`, evt.content)   // NEW: immediate push
  textBuffer.current.set(...)   // KEEP: for persistence via Immer
  scheduleFlush()
  break
}
```

**On `thought` SSE event:**
```ts
case "thought": {
  ensureAssistantMessage(sessionID)
  charStream.pushChars(`${sessionID}:thought`, evt.content)   // NEW
  thoughtBuffer.current.set(...)   // KEEP
  scheduleFlush()
  break
}
```

**In `flushBuffers`:** wrap `setStore` call in `startTransition`:
```ts
import { startTransition } from "react"

startTransition(() => {
  setStore((draft) => { /* existing logic unchanged */ })
})
```

**On `usage` event** (stream complete):
```ts
case "usage": {
  charStream.flush(`${sessionID}:text`)
  charStream.flush(`${sessionID}:thought`)
  charStream.clearStream(`${sessionID}:text`)
  charStream.clearStream(`${sessionID}:thought`)
  // ... existing usage handling unchanged
}
```

**On `error` event** (stream aborted):
```ts
case "error": {
  charStream.flush(`${sessionID}:text`)
  charStream.flush(`${sessionID}:thought`)
  charStream.clearStream(`${sessionID}:text`)
  charStream.clearStream(`${sessionID}:thought`)
  // ... existing error handling unchanged
}
```

**In `abort()` function:**
```ts
const abort = useCallback(() => {
  const sessionID = store.activeSession
  if (!sessionID) return
  charStream.flush(`${sessionID}:text`)         // NEW
  charStream.flush(`${sessionID}:thought`)      // NEW
  charStream.clearStream(`${sessionID}:text`)   // NEW
  charStream.clearStream(`${sessionID}:thought`) // NEW
  // ... existing abort logic unchanged
}, [...])
```

---

### 3. `src/openacp/components/ui/markdown.tsx`

**Remove:**
- `TICK_MIN`, `TICK_MAX`, `WORDS_MIN`, `WORDS_MAX` constants
- `advanceCursor` function
- `cursorRef`, `timerRef`
- The `useEffect` streaming tick loop (the one with `setTimeout`)

**Add:**
- `streamId?: string` prop
- `useEffect` that subscribes to `CharStream`:

```ts
useEffect(() => {
  if (!streaming || !streamId) return

  // Subscribe: each drain tick calls renderMarkdown with the display text
  const unsub = charStream.subscribeDisplay(streamId, (displayText) => {
    renderMarkdown(displayText, true)   // fast parser + morphdom
  })

  return unsub
}, [streaming, streamId])
```

**Keep unchanged:**
- `renderMarkdown` function
- `morphdom` patching
- Two-phase render (fast parser during stream, full Shiki parser on completion)
- The `useEffect` that fires when `streaming` flips to `false` (triggers final Shiki render)
- Non-streaming `useEffect` (for history/cached renders)
- Result/cache logic

**Updated props interface:**
```ts
interface MarkdownProps {
  text: string
  cacheKey?: string
  streamId?: string    // NEW — if provided and streaming=true, CharStream drives display
  streaming?: boolean
  className?: string
}
```

---

### 4. `src/openacp/components/chat/blocks/text-block.tsx`

Pass `streamId` down to `Markdown`:

```tsx
export const TextBlockView = memo(function TextBlockView({ block, streaming, sessionID }: TextBlockProps) {
  const text = block.content.replace(/^\n+/, "")
  return (
    <div className="min-w-0">
      <Markdown
        text={text}
        cacheKey={block.id}
        streamId={streaming ? `${sessionID}:text` : undefined}
        streaming={streaming}
      />
    </div>
  )
})
```

`sessionID` is already available in `MessageTurn` via `message.sessionID` — pass it through props.

---

### 5. `src/openacp/components/chat/blocks/thinking-block.tsx`

During streaming, subscribe to CharStream and write display text directly to a DOM ref (no React state, no re-render):

```tsx
const contentRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (!block.isStreaming || !sessionID) return

  const unsub = charStream.subscribeDisplay(`${sessionID}:thought`, (displayText) => {
    if (contentRef.current) {
      contentRef.current.textContent = displayText   // direct DOM, no re-render
    }
  })

  return unsub
}, [block.isStreaming, sessionID])
```

When `block.isStreaming` is false (streaming complete), render `block.content` normally as before.

`ThinkingBlockView` receives a new `sessionID?: string` prop (passed from `MessageTurn`).

---

### 6. `src/openacp/components/chat/blocks/tool-block.tsx`

Wrap the outer `<div>` with `motion.div` for entrance animation:

```tsx
import { motion } from "motion/react"

// Replace outer <div> with:
<motion.div
  initial={{ opacity: 0, y: -4 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.18, ease: "easeOut" }}
>
  {/* all existing content unchanged */}
</motion.div>
```

No `AnimatePresence` needed — tool blocks only mount (never unmount during a stream).

---

### 7. `src/openacp/components/chat/blocks/plan-block.tsx`

Same pattern as tool block:

```tsx
import { motion } from "motion/react"

// Wrap outer <div>:
<motion.div
  initial={{ opacity: 0, y: -4 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.18, ease: "easeOut" }}
>
  {/* existing content unchanged */}
</motion.div>
```

---

## Data Flow Summary

```
SSE "text" event arrives
  ├─► charStream.pushChars("sess1:text", chunk)
  │     └─► rAF drain loop (if not running, starts)
  │           └─► advances cursor N chars
  │                 └─► subscribeDisplay cb → renderMarkdown(slice) → morphdom
  │
  └─► textBuffer.set("sess1", accumulated)
        └─► scheduleFlush() → rAF → startTransition → setStore(Immer)
              └─► React re-render (non-urgent, deferred)
                    └─► Markdown receives new `text` prop (ignored during streaming)

SSE "usage" event arrives (stream complete)
  ├─► charStream.flush("sess1:text") → drain remaining chars immediately
  ├─► charStream.clearStream("sess1:text")
  └─► [existing] streaming = false, setStore usage data
        └─► Markdown "streaming ends" effect → full Shiki re-render
```

---

## What Does NOT Change

- `MessageTurn` component — no structural changes, only passes `sessionID` down
- `ToolGroup`, `ErrorBlockView` — unchanged
- `TimelineStep` — unchanged
- `UsageBar` — unchanged
- Auto-scroll behavior — unchanged
- History loading / caching — unchanged
- Permission request handling — unchanged
- The Immer store shape (`ChatStore`) — unchanged
- SSE connection management — unchanged

---

## Constraints & Edge Cases

**Multiple sessions streaming concurrently:** Each session has its own `streamId` namespace (`${sessionID}:text`), so multiple sessions can stream simultaneously without interference.

**Abort:** When `abort()` is called in `chat.tsx`, call `flush` + `clearStream` for the session's streams to stop display immediately.

**History render (non-streaming):** `Markdown` only subscribes to `CharStream` when `streaming=true` AND `streamId` is provided. Historical messages never have `streaming=true`, so they use the normal non-streaming render path unchanged.

**Reconnect after disconnect:** On reconnect + history reload, `streaming` is false, so `CharStream` is not involved. The store text is rendered via the normal path.

**Fast model (>200 chars/frame):** The adaptive drain rate caps at 200 chars/frame (~12,000 chars/sec at 60fps) which exceeds any current LLM output rate. The queue will drain as fast as the model produces.

**Slow model / long pauses:** When no new chars arrive, the rAF loop stops (self-terminating). It restarts automatically on the next `pushChars` call.
