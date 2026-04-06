# Smooth Streaming UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the double-buffered, word-based streaming cursor with a single CharStream module that drives character-by-character display via a global rAF loop, and add entrance animations to tool/plan blocks.

**Architecture:** A new pure-JS singleton `char-stream.ts` receives raw chars from SSE events immediately and drains them into component DOM callbacks via a single shared `requestAnimationFrame` loop. The Immer store is retained for persistence but decoupled from the display path by wrapping its updates in React's `startTransition`. The `Markdown` component subscribes to `CharStream` instead of running its own cursor loop.

**Tech Stack:** React 19 (`startTransition`), `morphdom` (DOM patching), `motion/react` (entrance animations), `marked` (markdown parsing), `shiki` (syntax highlighting on completion)

---

## Branch Setup

- [ ] **Sync and create feature branch**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git fetch origin
git checkout develop
git pull origin develop
git checkout -b feature/smooth-streaming
```

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `src/openacp/lib/char-stream.ts` | CharStream singleton — push, subscribe, adaptive rAF drain, flush, clear |
| **Modify** | `src/openacp/context/chat.tsx` | Push to CharStream on text/thought events; `startTransition` on `setStore`; flush/clear on stream end/abort |
| **Modify** | `src/openacp/components/ui/markdown.tsx` | Remove word-cursor + setTimeout; subscribe CharStream via `streamId` prop |
| **Modify** | `src/openacp/components/chat/message-turn.tsx` | Pass `sessionID` down to text/thinking block views |
| **Modify** | `src/openacp/components/chat/blocks/text-block.tsx` | Accept + forward `sessionID` prop to `Markdown` as `streamId` |
| **Modify** | `src/openacp/components/chat/blocks/thinking-block.tsx` | Accept `sessionID`; subscribe CharStream; direct DOM write via `contentRef` |
| **Modify** | `src/openacp/components/chat/blocks/tool-block.tsx` | Wrap outer element in `motion.div` for entrance animation |
| **Modify** | `src/openacp/components/chat/blocks/plan-block.tsx` | Wrap outer element in `motion.div` for entrance animation |

---

## Task 1: Create `CharStream` singleton

**Files:**
- Create: `src/openacp/lib/char-stream.ts`

- [ ] **Step 1: Create the file with full implementation**

```typescript
// src/openacp/lib/char-stream.ts
//
// CharStream — single rAF drain loop for character-by-character streaming display.
//
// Usage:
//   charStream.pushChars("sess1:text", "hello world")
//   const unsub = charStream.subscribeDisplay("sess1:text", (text) => renderDOM(text))
//   charStream.flush("sess1:text")     // on stream end
//   charStream.clearStream("sess1:text") // after final render

type Stream = {
  buffer: string
  cursor: number
  listeners: Set<(displayText: string) => void>
}

const streams = new Map<string, Stream>()
let rafScheduled = false

function drain() {
  rafScheduled = false
  let anyPending = false

  for (const [, stream] of streams) {
    const lag = stream.buffer.length - stream.cursor
    if (lag === 0) continue

    const charsThisFrame = lag > 300 ? 200 : 80
    stream.cursor = Math.min(stream.cursor + charsThisFrame, stream.buffer.length)
    const displayText = stream.buffer.slice(0, stream.cursor)
    for (const cb of stream.listeners) cb(displayText)

    if (stream.cursor < stream.buffer.length) anyPending = true
  }

  if (anyPending) {
    rafScheduled = true
    requestAnimationFrame(drain)
  }
}

function getOrCreate(streamId: string): Stream {
  let stream = streams.get(streamId)
  if (!stream) {
    stream = { buffer: "", cursor: 0, listeners: new Set() }
    streams.set(streamId, stream)
  }
  return stream
}

/** Append new chars to the stream buffer and start the rAF drain loop if not running. */
export function pushChars(streamId: string, text: string): void {
  const stream = getOrCreate(streamId)
  stream.buffer += text
  if (!rafScheduled) {
    rafScheduled = true
    requestAnimationFrame(drain)
  }
}

/**
 * Subscribe to display text updates. The callback is called on every rAF drain
 * with the currently revealed slice of the buffer.
 * Returns an unsubscribe function.
 */
export function subscribeDisplay(
  streamId: string,
  cb: (displayText: string) => void,
): () => void {
  const stream = getOrCreate(streamId)
  stream.listeners.add(cb)
  return () => stream.listeners.delete(cb)
}

/**
 * Immediately advance cursor to end of buffer and notify all listeners.
 * Call this when the stream is complete (usage/error/abort events).
 * Returns the full buffer text.
 */
export function flush(streamId: string): string {
  const stream = streams.get(streamId)
  if (!stream) return ""
  stream.cursor = stream.buffer.length
  const fullText = stream.buffer
  for (const cb of stream.listeners) cb(fullText)
  return fullText
}

/**
 * Remove the stream entry entirely.
 * Call after flush(), once the component has performed its final render.
 */
export function clearStream(streamId: string): void {
  streams.delete(streamId)
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors related to `char-stream.ts`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/lib/char-stream.ts
git commit -m "feat: add CharStream singleton for adaptive rAF character drain"
```

---

## Task 2: Update `chat.tsx` — push to CharStream + startTransition + flush on end

**Files:**
- Modify: `src/openacp/context/chat.tsx`

Read the file before editing: `src/openacp/context/chat.tsx`

- [ ] **Step 1: Add the import at the top of `chat.tsx`**

Add after the existing imports (around line 17, after the `import { resolveKind, ... }` line):

```typescript
import * as charStream from "../lib/char-stream"
import { startTransition } from "react"
```

- [ ] **Step 2: In `handleAgentEvent`, add `pushChars` call inside the `"text"` case**

Find this block (around line 472–477):
```typescript
case "text": {
  ensureAssistantMessage(sessionID)
  textBuffer.current.set(sessionID, (textBuffer.current.get(sessionID) ?? "") + evt.content)
  scheduleFlush()
  break
}
```

Replace with:
```typescript
case "text": {
  ensureAssistantMessage(sessionID)
  charStream.pushChars(`${sessionID}:text`, evt.content)
  textBuffer.current.set(sessionID, (textBuffer.current.get(sessionID) ?? "") + evt.content)
  scheduleFlush()
  break
}
```

- [ ] **Step 3: Add `pushChars` call inside the `"thought"` case**

Find this block (around line 478–484):
```typescript
case "thought": {
  ensureAssistantMessage(sessionID)
  if (!thinkingStartTime.current.has(sessionID)) {
    thinkingStartTime.current.set(sessionID, Date.now())
  }
  thoughtBuffer.current.set(sessionID, (thoughtBuffer.current.get(sessionID) ?? "") + evt.content)
  scheduleFlush()
  break
}
```

Replace with:
```typescript
case "thought": {
  ensureAssistantMessage(sessionID)
  charStream.pushChars(`${sessionID}:thought`, evt.content)
  if (!thinkingStartTime.current.has(sessionID)) {
    thinkingStartTime.current.set(sessionID, Date.now())
  }
  thoughtBuffer.current.set(sessionID, (thoughtBuffer.current.get(sessionID) ?? "") + evt.content)
  scheduleFlush()
  break
}
```

- [ ] **Step 4: Wrap the `setStore` call in `flushBuffers` with `startTransition`**

In `flushBuffers` (around line 390), find:
```typescript
    // Single setStore call for ALL text and thought buffer updates
    setStore((draft) => {
```

Replace with:
```typescript
    // Single setStore call for ALL text and thought buffer updates
    startTransition(() => {
    setStore((draft) => {
```

And find the closing brace of that `setStore` call (around line 459):
```typescript
    })
  }
```

Replace the closing with:
```typescript
    })
    }) // end startTransition
  }
```

> Note: Be precise — only wrap the final big `setStore` call in `flushBuffers`, not the `setStore` calls inside `ensureAssistantMessage` or `addMessage`.

- [ ] **Step 5: Add flush + clear in the `"usage"` case**

Find the `"usage"` case (around line 593). Find this line inside it:
```typescript
      case "usage": {
        flushBuffers()
```

After `flushBuffers()`, add:
```typescript
        charStream.flush(`${sessionID}:text`)
        charStream.flush(`${sessionID}:thought`)
        charStream.clearStream(`${sessionID}:text`)
        charStream.clearStream(`${sessionID}:thought`)
```

- [ ] **Step 6: Add flush + clear in the `"error"` case**

Find the `"error"` case (around line 580). After `flushBuffers()`, add:
```typescript
        charStream.flush(`${sessionID}:text`)
        charStream.flush(`${sessionID}:thought`)
        charStream.clearStream(`${sessionID}:text`)
        charStream.clearStream(`${sessionID}:thought`)
```

- [ ] **Step 7: Add flush + clear in the `abort()` callback**

Find the `abort` useCallback (around line 756). After the line:
```typescript
    abortedSessions.current.add(sessionID)
```

Add:
```typescript
    charStream.flush(`${sessionID}:text`)
    charStream.flush(`${sessionID}:thought`)
    charStream.clearStream(`${sessionID}:text`)
    charStream.clearStream(`${sessionID}:thought`)
```

- [ ] **Step 8: Build to verify no TypeScript errors**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm build 2>&1 | grep -E "error TS" | head -20
```

Expected: 0 TypeScript errors

- [ ] **Step 9: Commit**

```bash
git add src/openacp/context/chat.tsx
git commit -m "feat: push chars to CharStream on SSE text/thought events, flush on stream end"
```

---

## Task 3: Update `markdown.tsx` — remove cursor loop, subscribe CharStream

**Files:**
- Modify: `src/openacp/components/ui/markdown.tsx`

Read the file before editing.

- [ ] **Step 1: Add the import at the top**

After the existing imports, add:
```typescript
import * as charStream from "../../lib/char-stream"
```

- [ ] **Step 2: Remove the cursor constants and `advanceCursor` function**

Delete these lines (around lines 124–148):
```typescript
// Cursor-controlled streaming: advance by 1-3 words per tick with random delay.
const TICK_MIN = 5         // ms min delay
const TICK_MAX = 15        // ms max delay
const WORDS_MIN = 1        // min words per tick
const WORDS_MAX = 3        // max words per tick

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function advanceCursor(text: string, cursor: number): number {
  const words = randomInt(WORDS_MIN, WORDS_MAX)
  let pos = cursor
  let counted = 0
  // Skip leading whitespace
  while (pos < text.length && /\s/.test(text[pos]!)) pos++
  // Advance N words
  while (pos < text.length && counted < words) {
    // Consume non-whitespace (word)
    while (pos < text.length && !/\s/.test(text[pos]!)) pos++
    counted++
    // Consume trailing whitespace (include with word)
    while (pos < text.length && /\s/.test(text[pos]!)) pos++
  }
  return pos || Math.min(text.length, cursor + 1)
}
```

- [ ] **Step 3: Update the `MarkdownProps` interface to add `streamId`**

Find:
```typescript
interface MarkdownProps {
  text: string
  cacheKey?: string
  streaming?: boolean
  className?: string
}
```

Replace with:
```typescript
interface MarkdownProps {
  text: string
  cacheKey?: string
  streamId?: string
  streaming?: boolean
  className?: string
}
```

- [ ] **Step 4: Update the component signature to destructure `streamId`**

Find:
```typescript
export function Markdown({ text, cacheKey, streaming, className }: MarkdownProps) {
```

Replace with:
```typescript
export function Markdown({ text, cacheKey, streamId, streaming, className }: MarkdownProps) {
```

- [ ] **Step 5: Remove cursor-related refs from the component body**

Find and delete these ref declarations inside the component:
```typescript
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cursorRef = useRef(0) // how many chars are "revealed" to user
```

- [ ] **Step 6: Remove the entire setTimeout tick loop effect**

Find and delete this entire `useEffect` block (the streaming cursor loop):
```typescript
  // Streaming: cursor-based tick loop
  useEffect(() => {
    if (!streaming) return

    function tick() {
      const fullText = textRef.current
      if (cursorRef.current < fullText.length) {
        cursorRef.current = advanceCursor(fullText, cursorRef.current)
      }
      renderMarkdown(fullText.slice(0, cursorRef.current), true)

      if (streamingRef.current || cursorRef.current < textRef.current.length) {
        timerRef.current = setTimeout(tick, randomInt(TICK_MIN, TICK_MAX))
      }
    }

    const streamingRef = { current: true }
    timerRef.current = setTimeout(tick, randomInt(TICK_MIN, TICK_MAX))

    return () => {
      streamingRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [streaming])
```

- [ ] **Step 7: Add the CharStream subscription effect in its place**

Insert a new `useEffect` at the same location where the old tick loop was:
```typescript
  // Streaming: subscribe to CharStream for character-by-character display
  useEffect(() => {
    if (!streaming || !streamId) return
    const unsub = charStream.subscribeDisplay(streamId, (displayText) => {
      renderMarkdown(displayText, true)
    })
    return unsub
  }, [streaming, streamId])
```

- [ ] **Step 8: Update the "streaming ends" effect to remove cursor reset**

Find inside the streaming-ends effect:
```typescript
      cursorRef.current = 0 // reset cursor for next stream
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
```

Replace with (just remove those lines, keep the rest of the effect):
```typescript
```

The effect should now look like:
```typescript
  // When streaming ends: final full Shiki render
  useEffect(() => {
    if (prevStreamingRef.current && !streaming) {
      cache.delete(cacheKey || "md")
      lastTextRef.current = ""
      renderMarkdown(text, false)
    }
    prevStreamingRef.current = streaming
  }, [streaming, text, cacheKey])
```

- [ ] **Step 9: Build to verify**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm build 2>&1 | grep -E "error TS" | head -20
```

Expected: 0 TypeScript errors

- [ ] **Step 10: Commit**

```bash
git add src/openacp/components/ui/markdown.tsx
git commit -m "feat: replace word-cursor with CharStream subscription in Markdown component"
```

---

## Task 4: Update `message-turn.tsx` and `text-block.tsx` — pass `sessionID`

**Files:**
- Modify: `src/openacp/components/chat/message-turn.tsx`
- Modify: `src/openacp/components/chat/blocks/text-block.tsx`

- [ ] **Step 1: Update `text-block.tsx` to accept and forward `sessionID`**

Read `src/openacp/components/chat/blocks/text-block.tsx`.

Find:
```typescript
interface TextBlockProps {
  block: TextBlock
  streaming?: boolean
}

export const TextBlockView = memo(function TextBlockView({ block, streaming }: TextBlockProps) {
  const text = block.content.replace(/^\n+/, "")

  return (
    <div className="min-w-0">
      <Markdown
        text={text}
        cacheKey={block.id}
        streaming={streaming}
      />
    </div>
  )
})
```

Replace with:
```typescript
interface TextBlockProps {
  block: TextBlock
  streaming?: boolean
  sessionID?: string
}

export const TextBlockView = memo(function TextBlockView({ block, streaming, sessionID }: TextBlockProps) {
  const text = block.content.replace(/^\n+/, "")

  return (
    <div className="min-w-0">
      <Markdown
        text={text}
        cacheKey={block.id}
        streamId={streaming && sessionID ? `${sessionID}:text` : undefined}
        streaming={streaming}
      />
    </div>
  )
})
```

- [ ] **Step 2: Update `message-turn.tsx` to pass `sessionID` to `TextBlockView` and `ThinkingBlockView`**

Read `src/openacp/components/chat/message-turn.tsx`.

Find the render of `TextBlockView` inside the `renderItems.map(...)`:
```typescript
              {block.type === "text" ? (
                <TextBlockView block={block as TextBlock} streaming={streaming && isLastBlock} />
```

Replace with:
```typescript
              {block.type === "text" ? (
                <TextBlockView block={block as TextBlock} streaming={streaming && isLastBlock} sessionID={message.sessionID} />
```

Find the render of `ThinkingBlockView`:
```typescript
              ) : block.type === "thinking" ? (
                <ThinkingBlockView block={block as ThinkingBlock} />
```

Replace with:
```typescript
              ) : block.type === "thinking" ? (
                <ThinkingBlockView block={block as ThinkingBlock} sessionID={message.sessionID} />
```

- [ ] **Step 3: Build to verify**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm build 2>&1 | grep -E "error TS" | head -20
```

Expected: 0 TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/openacp/components/chat/blocks/text-block.tsx src/openacp/components/chat/message-turn.tsx
git commit -m "feat: pass sessionID to text/thinking blocks for CharStream subscription"
```

---

## Task 5: Update `thinking-block.tsx` — subscribe CharStream for display

**Files:**
- Modify: `src/openacp/components/chat/blocks/thinking-block.tsx`

Read the file before editing.

- [ ] **Step 1: Rewrite `thinking-block.tsx` with CharStream subscription**

Replace the entire file content with:

```typescript
import React, { memo, useRef, useEffect } from "react"
import * as charStream from "../../../lib/char-stream"
import type { ThinkingBlock } from "../../../types"

interface ThinkingBlockProps {
  block: ThinkingBlock
  sessionID?: string
}

export const ThinkingBlockView = memo(function ThinkingBlockView({ block, sessionID }: ThinkingBlockProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  // During streaming: subscribe CharStream and write directly to DOM
  useEffect(() => {
    if (!block.isStreaming || !sessionID) return
    const unsub = charStream.subscribeDisplay(`${sessionID}:thought`, (displayText) => {
      if (contentRef.current) {
        contentRef.current.textContent = displayText
      }
    })
    return unsub
  }, [block.isStreaming, sessionID])

  const summaryText = (() => {
    if (block.isStreaming) return "Thinking..."
    if (block.durationMs !== null) {
      const seconds = Math.round(block.durationMs / 1000)
      return `Thought for ${seconds}s`
    }
    return "Thinking"
  })()

  const hasContent = !!block.content?.trim()

  if (!hasContent && !block.isStreaming) {
    return (
      <div style={{ fontStyle: "italic", fontSize: "12px", color: "var(--text-weak)" }}>
        {summaryText}
      </div>
    )
  }

  return (
    <details className="oac-thinking">
      <summary>
        <span>{summaryText}</span>
        <span className="oac-thinking-chevron">&#9654;</span>
      </summary>
      <div ref={contentRef} className="oac-thinking-content">
        {/* During streaming: contentRef written directly by CharStream subscription */}
        {/* After streaming: block.content rendered normally */}
        {!block.isStreaming ? block.content : null}
      </div>
    </details>
  )
})
```

- [ ] **Step 2: Build to verify**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm build 2>&1 | grep -E "error TS" | head -20
```

Expected: 0 TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/chat/blocks/thinking-block.tsx
git commit -m "feat: thinking block subscribes CharStream for smooth character streaming"
```

---

## Task 6: Add entrance animation to `tool-block.tsx`

**Files:**
- Modify: `src/openacp/components/chat/blocks/tool-block.tsx`

Read the file before editing.

- [ ] **Step 1: Add `motion` import**

At the top of the file, after `import React, { memo, useState, useMemo } from "react"`, add:
```typescript
import { motion } from "motion/react"
```

- [ ] **Step 2: Replace the outer `<div>` wrapper with `<motion.div>`**

Find the return statement in `ToolBlockView`. The outer element is:
```typescript
  return (
    <div>
      <div
        className={`oac-tool-card-title${isPending ? " oac-tool-card-shimmer" : ""}`}
```

Replace the opening outer `<div>` with `<motion.div>` and the matching closing `</div>` at the bottom:
```typescript
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div
        className={`oac-tool-card-title${isPending ? " oac-tool-card-shimmer" : ""}`}
```

And at the very bottom of the component, change the closing `</div>` to `</motion.div>`:
```typescript
    </motion.div>
  )
```

- [ ] **Step 3: Build to verify**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm build 2>&1 | grep -E "error TS" | head -20
```

Expected: 0 TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/openacp/components/chat/blocks/tool-block.tsx
git commit -m "feat: add entrance animation to tool blocks via motion.div"
```

---

## Task 7: Add entrance animation to `plan-block.tsx`

**Files:**
- Modify: `src/openacp/components/chat/blocks/plan-block.tsx`

Read the file before editing.

- [ ] **Step 1: Add `motion` import**

After `import React, { memo } from "react"`, add:
```typescript
import { motion } from "motion/react"
```

- [ ] **Step 2: Replace the outer `<div>` in `PlanBlockView` with `<motion.div>`**

Find:
```typescript
  return (
    <div>
      <div className="oac-plan-header">Update Todos</div>
```

Replace with:
```typescript
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="oac-plan-header">Update Todos</div>
```

And the closing tag:
```typescript
    </motion.div>
  )
```

- [ ] **Step 3: Build to verify**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm build 2>&1 | grep -E "error TS" | head -20
```

Expected: 0 TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/openacp/components/chat/blocks/plan-block.tsx
git commit -m "feat: add entrance animation to plan blocks via motion.div"
```

---

## Task 8: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm dev
```

Open `http://localhost:1420` in a browser.

- [ ] **Step 2: Verify text streaming is smooth and character-based**

Send a prompt to a running agent session. Observe:
- Text appears character-by-character (not word-by-word)
- No "chunky" bursts — reveal feels continuous and smooth
- The cursor does not visibly lag behind when the model generates fast

- [ ] **Step 3: Verify thinking block streaming**

Trigger a model that outputs `<thinking>` blocks (e.g., claude-opus). Observe:
- Thinking content appears character-by-character inside the `<details>` element
- "Thinking..." summary text shows while streaming

- [ ] **Step 4: Verify tool blocks animate in**

Trigger tool calls (any agent that uses filesystem/bash tools). Observe:
- Each tool card fades in with a subtle upward motion when it first appears
- The animation takes ~0.18s and does not feel jarring

- [ ] **Step 5: Verify plan blocks animate in**

Trigger an agent that outputs a plan/todo list. Observe:
- Plan block fades in smoothly, same as tool blocks

- [ ] **Step 6: Verify streaming end transition (Shiki highlight)**

After a long text response completes, verify:
- The final Shiki syntax-highlighted render applies without a visible layout jump
- Code blocks go from unstyled → styled smoothly

- [ ] **Step 7: Verify abort works correctly**

Click abort during streaming. Verify:
- Streaming stops immediately (no lingering text drip after abort)
- The partial message stays visible with whatever was shown at abort time

- [ ] **Step 8: Verify history messages render correctly**

Switch to a session with prior history (non-streaming). Verify:
- Old messages render with full Shiki highlighting as before
- No regression in history display

---

## Task 9: Final cleanup and PR prep

- [ ] **Step 1: Run full build check**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
pnpm build
```

Expected: Clean build, 0 errors.

- [ ] **Step 2: Final commit summary**

```bash
git log --oneline feature/smooth-streaming ^develop
```

Expected output (7 commits):
```
feat: add entrance animation to plan blocks via motion.div
feat: add entrance animation to tool blocks via motion.div
feat: thinking block subscribes CharStream for smooth character streaming
feat: pass sessionID to text/thinking blocks for CharStream subscription
feat: replace word-cursor with CharStream subscription in Markdown component
feat: push chars to CharStream on SSE text/thought events, flush on stream end
feat: add CharStream singleton for adaptive rAF character drain
```
