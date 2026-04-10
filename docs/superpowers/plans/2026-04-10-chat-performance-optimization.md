# Chat Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce chat lag in long conversations by (1) truncating tool block IN/OUT content to 3 lines and (2) virtualizing the message list with react-virtuoso so only visible messages render.

**Architecture:** Tool truncation is an isolated change to `tool-block.tsx` — no other files affected. Virtuoso replaces the hand-rolled `useAutoScroll` hook: the scroll container becomes a `<Virtuoso>` component, message grouping moves into a `useMemo`, and two new sub-components (`ChatGroup`, `ChatFooter`) extract rendering logic that Virtuoso's API requires to be separated.

**Tech Stack:** `react-virtuoso`, React 19, TypeScript strict, Tauri 2, Tailwind CSS 4

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/openacp/components/chat/blocks/tool-block.tsx` | Modify | Add `truncateLines` helper + render truncated IN/OUT with "more lines" button |
| `src/openacp/components/chat/chat-view.tsx` | Modify | Replace `useAutoScroll` + scroll container with Virtuoso; extract `ChatGroup` and `ChatFooter` |
| `src/openacp/hooks/use-auto-scroll.ts` | **Delete** | Superseded by Virtuoso built-ins |
| `package.json` | Modify | Add `react-virtuoso` dependency |

---

## Task 0: Create Feature Branch

- [ ] **Step 1: Sync develop and create branch**

```bash
git checkout develop
git pull origin develop
git checkout -b feat/chat-performance-optimization
```

---

## Task 1: Install react-virtuoso

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
cd OpenACP-App
pnpm add react-virtuoso
```

Expected output: `+ react-virtuoso X.X.X` added to dependencies.

- [ ] **Step 2: Verify TypeScript is happy**

```bash
pnpm build
```

Expected: build succeeds with no new errors.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add react-virtuoso"
```

---

## Task 2: Tool Block Content Truncation

**Files:**
- Modify: `src/openacp/components/chat/blocks/tool-block.tsx`

- [ ] **Step 1: Add the `truncateLines` helper and constant**

Add directly above the `REJECTION_PATTERNS` constant (line 9):

```ts
const MAX_VISIBLE_LINES = 3

function truncateLines(text: string, max: number): { visible: string; hiddenCount: number } {
  const lines = text.split("\n")
  if (lines.length <= max) return { visible: text, hiddenCount: 0 }
  return { visible: lines.slice(0, max).join("\n"), hiddenCount: lines.length - max }
}
```

- [ ] **Step 2: Compute truncated values inside the component**

Inside `ToolBlockView`, after the existing `useMemo` calls for `icon`, `label`, `inputText`, add:

```ts
const truncatedInput = useMemo(
  () => (inputText ? truncateLines(inputText, MAX_VISIBLE_LINES) : null),
  [inputText]
)
const truncatedOutput = useMemo(
  () => (block.output && !isRejected ? truncateLines(block.output, MAX_VISIBLE_LINES) : null),
  [block.output, isRejected]
)
```

- [ ] **Step 3: Replace the IN/OUT rows with truncated versions**

Find the `oac-tool-card-grid` block (inside `AnimatePresence`, the `oac-tool-card-body` div):

```tsx
<div className="oac-tool-card-grid">
  {inputText && (
    <div className="oac-tool-card-row">
      <div className="oac-tool-card-row-label">IN</div>
      <div className="oac-tool-card-row-content">{inputText}</div>
    </div>
  )}
  {block.output && !isRejected && (
    <div className="oac-tool-card-row">
      <div className="oac-tool-card-row-label">OUT</div>
      <div className="oac-tool-card-row-content">{block.output}</div>
    </div>
  )}
</div>
```

Replace with:

```tsx
<div className="oac-tool-card-grid">
  {truncatedInput && (
    <div className="oac-tool-card-row">
      <div className="oac-tool-card-row-label">IN</div>
      <div className="oac-tool-card-row-content">
        {truncatedInput.visible}
        {truncatedInput.hiddenCount > 0 && (
          <button
            type="button"
            className="block mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
          >
            + {truncatedInput.hiddenCount} more lines ↗
          </button>
        )}
      </div>
    </div>
  )}
  {truncatedOutput && (
    <div className="oac-tool-card-row">
      <div className="oac-tool-card-row-label">OUT</div>
      <div className="oac-tool-card-row-content">
        {truncatedOutput.visible}
        {truncatedOutput.hiddenCount > 0 && (
          <button
            type="button"
            className="block mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
          >
            + {truncatedOutput.hiddenCount} more lines ↗
          </button>
        )}
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Manual smoke test**

Run `pnpm tauri dev`. Open a session that has tool calls with long output (e.g., a `read_file` on a large file). Verify:
- IN/OUT content shows only 3 lines
- `+ N more lines ↗` button appears when content is longer
- Clicking the button opens the existing full-content modal
- Tool calls with short output (≤ 3 lines) show no truncation UI

- [ ] **Step 6: Commit**

```bash
git add src/openacp/components/chat/blocks/tool-block.tsx
git commit -m "feat: truncate tool block IN/OUT content to 3 lines"
```

---

## Task 3: Extract ChatGroup and ChatFooter Components

These two components need to exist before wiring Virtuoso. Extracting them first keeps the diff in Task 4 focused on the Virtuoso integration itself.

**Files:**
- Modify: `src/openacp/components/chat/chat-view.tsx`

- [ ] **Step 1: Add the `ChatGroup` component**

Add this new component to `chat-view.tsx`, after the `ScrollToBottomButton` component and before `ChatView`:

```tsx
type MessageGroup = { user: Message | null; assistants: Message[] }

interface ChatGroupProps {
  group: MessageGroup
  index: number
  isLast: boolean
  streaming: boolean
}

function ChatGroup({ group, index, isLast, streaming }: ChatGroupProps) {
  if (!group.user) {
    // Orphan assistant messages (no preceding user turn)
    return (
      <>
        {group.assistants.map((msg, ai) => (
          <div
            key={msg.id}
            style={{ marginTop: index === 0 && ai === 0 ? "0px" : "20px" }}
          >
            <MessageTurn
              message={msg}
              streaming={streaming && isLast && ai === group.assistants.length - 1}
            />
          </div>
        ))}
      </>
    )
  }
  return (
    <div style={{ marginTop: index === 0 ? "0px" : "28px" }}>
      <UserMessage message={group.user} />
      {group.assistants.map((msg, ai) => (
        <div key={msg.id} style={{ marginTop: "20px" }}>
          <MessageTurn
            message={msg}
            streaming={streaming && isLast && ai === group.assistants.length - 1}
          />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add the `ChatFooter` component**

Add directly after `ChatGroup`:

```tsx
// Footer rendered by Virtuoso below the last message item.
// Reads from context directly because Virtuoso's Footer receives no props.
function ChatFooter() {
  const chat = useChat()
  const streaming = chat.streaming()
  const messages = chat.messages()
  const activeSessionId = chat.activeSession()

  const showCursor = (() => {
    if (!streaming) return false
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.role === "assistant" && lastMsg.blocks.length > 0) {
      const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1]
      if (lastBlock.type === "text" && lastBlock.content.length > 0) return false
      if (lastBlock.type === "tool" && (lastBlock.status === "running" || lastBlock.status === "pending")) return false
    }
    return true
  })()

  return (
    <div className="px-6 md:max-w-180 md:mx-auto 2xl:max-w-220">
      {activeSessionId && <PermissionRequestCard sessionId={activeSessionId} />}
      {showCursor && (
        <div className="oac-stream-indicator" style={{ paddingLeft: 30 }}>
          <span className="oac-stream-cursor" />
        </div>
      )}
      {/* Spacer so the last message is not obscured by the Composer (replaces pb-80) */}
      <div style={{ height: 320 }} />
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: no errors. These components are defined but not yet used, which TypeScript may warn about — that's fine, they'll be wired in Task 4.

---

## Task 4: Wire Virtuoso into ChatView

**Files:**
- Modify: `src/openacp/components/chat/chat-view.tsx`

- [ ] **Step 1: Add Virtuoso imports and update React import**

At the top of `chat-view.tsx`, add:

```ts
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
```

Remove the `useAutoScroll` import:

```ts
// DELETE this line:
import { useAutoScroll } from "../../hooks/use-auto-scroll"
```

Add `useRef` to the React import (it is not currently imported):

```ts
// Find:
import React, { useMemo, useState, useEffect, useCallback } from "react"
// Replace with:
import React, { useMemo, useState, useEffect, useCallback, useRef } from "react"
```

- [ ] **Step 2: Replace scroll state inside `ChatView`**

Inside `ChatView`, remove:

```ts
const autoScroll = useAutoScroll({
  working: chat.streaming(),
  bottomThreshold: 120,
})

// Force scroll to bottom when switching sessions — use double rAF + setTimeout fallback
// to ensure messages are rendered before scrolling
useEffect(() => {
  autoScroll.forceScrollToBottom();
  // Fallback: setTimeout ensures scroll fires after React commit + paint
  const timer = setTimeout(() => autoScroll.forceScrollToBottom(), 80);
  return () => clearTimeout(timer);
}, [chat.activeSession()]);

// Scroll to bottom when scrollTrigger fires (user sends message, cross-adapter message, history loaded)
useEffect(() => {
  if (chat.scrollTrigger() > 0) autoScroll.forceScrollToBottom();
}, [chat.scrollTrigger()]);
```

Replace with:

```ts
const virtuosoRef = useRef<VirtuosoHandle>(null)
const [atBottom, setAtBottom] = useState(true)

const messages = chat.messages()
const streaming = chat.streaming()

const groups = useMemo<MessageGroup[]>(() => {
  const result: MessageGroup[] = []
  let current: MessageGroup | null = null
  for (const msg of messages) {
    if (msg.role === "user") {
      current = { user: msg, assistants: [] }
      result.push(current)
    } else if (current) {
      current.assistants.push(msg)
    } else {
      result.push({ user: null, assistants: [msg] })
    }
  }
  return result
}, [messages])

// Scroll to bottom on session switch
useEffect(() => {
  virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "auto" })
}, [activeSessionId])

// Scroll to bottom when triggered (user sent message, cross-adapter turn, history loaded)
useEffect(() => {
  if (chat.scrollTrigger() > 0) {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "auto" })
  }
}, [chat.scrollTrigger()])
```

Note: `activeSessionId` is already declared in `ChatView` via `const activeSessionId = chat.activeSession()`. Also add `useRef` and `useState` to the React import if not already present (they are, per existing code).

Also update the `hasMessages` declaration to use the already-declared `messages` variable instead of calling `chat.messages()` again:

```ts
// Find and replace:
const hasMessages = chat.activeSession() && chat.messages().length > 0;
// With:
const hasMessages = activeSessionId && messages.length > 0
```

- [ ] **Step 3: Replace the scroll container JSX with Virtuoso**

Find and remove the entire `{hasMessages ? ( <> ... </> ) : ( <EmptyState /> )}` block inside the `<div className="flex-1 min-h-0 overflow-hidden relative">`.

Replace it with:

```tsx
{hasMessages ? (
  <>
    <Virtuoso
      ref={virtuosoRef}
      className="h-full no-scrollbar"
      data={groups}
      itemContent={(index, group) => (
        <div
          className="px-6 md:max-w-180 md:mx-auto 2xl:max-w-220"
          style={{ paddingTop: index === 0 ? 12 : 0 }}
        >
          <ChatGroup
            group={group}
            index={index}
            isLast={index === groups.length - 1}
            streaming={streaming}
          />
        </div>
      )}
      followOutput={streaming ? "smooth" : false}
      atBottomStateChange={setAtBottom}
      components={{ Footer: ChatFooter }}
      increaseViewportBy={{ top: 600, bottom: 600 }}
      defaultItemHeight={200}
    />
    <ScrollToBottomButton
      visible={!atBottom}
      onClick={() => virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" })}
    />
  </>
) : (
  <EmptyState />
)}
```

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Manual smoke test**

Run `pnpm tauri dev`. Verify:
- Messages render correctly in a conversation
- Scroll-to-bottom button appears when scrolled up, hides when at bottom
- Sending a new message auto-scrolls to bottom
- Switching sessions jumps to bottom of the new session
- Streaming auto-scrolls to bottom (unless user has scrolled up)
- PermissionRequestCard and streaming cursor still appear correctly
- No visible gap/jump when scrolling through a long conversation
- Tool truncation from Task 2 still works (no regression)

- [ ] **Step 6: Commit**

```bash
git add src/openacp/components/chat/chat-view.tsx
git commit -m "feat: virtualize chat message list with react-virtuoso"
```

---

## Task 5: Delete useAutoScroll Hook

**Files:**
- Delete: `src/openacp/hooks/use-auto-scroll.ts`

- [ ] **Step 1: Delete the file**

```bash
rm src/openacp/hooks/use-auto-scroll.ts
```

- [ ] **Step 2: Verify nothing imports it**

```bash
grep -r "use-auto-scroll" src/
```

Expected: no output (zero matches).

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add -u src/openacp/hooks/use-auto-scroll.ts
git commit -m "refactor: remove useAutoScroll hook, superseded by react-virtuoso"
```
