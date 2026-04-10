# Chat Performance Optimization Design

**Date**: 2026-04-10
**Status**: Approved
**Scope**: `OpenACP-App` — chat UI performance

## Problem

Conversations with fewer than 100 messages cause noticeable lag in two scenarios:

- **During streaming**: Each SSE event triggers re-renders across all mounted message components.
- **After streaming**: Scrolling and interacting with a completed conversation is slow.

Root causes:
1. All messages are rendered into the DOM simultaneously — no virtualization.
2. Tool block IN/OUT content is rendered in full, even when the content is hundreds of lines of code or JSON. This creates heavy DOM nodes for every tool call.
3. Shiki syntax highlighting (async, CPU-intensive) runs on the initial mount of every `TextBlock`, including off-screen ones. The 200-entry cache in `markdown.tsx` prevents re-render cost, but not initial-mount cost.

## Solution Overview

Two targeted optimizations, applied independently:

1. **Tool block content truncation** — collapse IN/OUT content to 3 visible lines; show full content via existing modal.
2. **react-virtuoso virtualization** — only render messages visible in the viewport; Shiki lazy-highlighting comes for free as a side effect.

---

## Part 1: Tool Block Content Truncation

### Behavior

Within the expanded tool card body (the inline IN/OUT section), both `inputText` and `block.output` are independently truncated to **3 visible lines** by default.

When truncated, a `+ N more lines` link appears below the content. Clicking it opens the existing full-content modal (`ArrowsOut` dialog). No new state or new UI surface is introduced.

```
┌──────────────────────────────────┐
│ ▶ write_file  src/components/... │
├──────────────────────────────────┤
│ IN  {"file_path": "src/openacp/  │
│     components/chat/blocks/tool- │
│     block.tsx", "content": "imp  │
│     + 847 more lines ↗           │
├──────────────────────────────────┤
│ OUT File written successfully.   │
└──────────────────────────────────┘
```

If content is 3 lines or fewer, no truncation UI is shown.

### Implementation

**File**: `src/openacp/components/chat/blocks/tool-block.tsx`

- Add constant `MAX_VISIBLE_LINES = 3`.
- Add helper `truncateLines(text: string, max: number): { visible: string; hiddenCount: number }` — splits on `\n`, takes first `max` lines, returns remainder count.
- Apply to `inputText` and `block.output` independently via `useMemo`.
- Render `+ N more lines ↗` as a button below the content when `hiddenCount > 0`; `onClick` calls `setModalOpen(true)`.

No changes to the modal or the collapse/expand title behavior.

---

## Part 2: react-virtuoso Virtualization

### Why virtuoso solves the Shiki problem too

`markdown.tsx` already has a 200-entry HTML cache keyed by `cacheKey` (block ID). When react-virtuoso unmounts an off-screen `TextBlock`, Shiki does not run for it. When it re-enters the viewport, the component mounts fresh and hits the cache — `morphdom` applies the cached HTML in O(1). No explicit lazy-highlighting code is needed.

### Message grouping

The current grouping logic (`{ user: Message | null; assistants: Message[] }[]`) is preserved. It moves into a `useMemo` in `ChatView` and becomes the `data` array passed to Virtuoso. Each group is one virtual item.

```ts
const groups = useMemo(() => {
  // same logic currently in the IIFE inside JSX
}, [messages])
```

### Virtuoso configuration

```tsx
<Virtuoso
  ref={virtuosoRef}
  data={groups}
  itemContent={(index, group) => (
    <ChatGroup
      group={group}
      isLast={index === groups.length - 1}
      streaming={chat.streaming()}
    />
  )}
  followOutput={streaming ? "smooth" : false}
  atBottomStateChange={(atBottom) => setAtBottom(atBottom)}
  components={{ Footer: ChatFooter }}
  increaseViewportBy={{ top: 600, bottom: 600 }}
  defaultItemHeight={200}
/>
```

| prop | purpose |
|---|---|
| `followOutput` | Auto-scroll to bottom during streaming |
| `atBottomStateChange` | Drive the scroll-to-bottom button visibility |
| `components.Footer` | Render PermissionRequestCard + streaming cursor below all items |
| `increaseViewportBy` | Overscan: keep ~3 messages above/below viewport mounted, reducing state resets |
| `defaultItemHeight` | Initial height estimate to prevent layout thrash on first render |

### Replacing `useAutoScroll`

`use-auto-scroll.ts` is deleted entirely. Its responsibilities map to Virtuoso as follows:

| Old (`useAutoScroll`) | New (Virtuoso) |
|---|---|
| `ResizeObserver` → scroll to bottom | `followOutput="smooth"` |
| `userScrolled` state | `atBottomStateChange` → local `atBottom` state |
| `forceScrollToBottom()` on session switch | `virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' })` |
| `scrollTrigger` effect | same `scrollToIndex` call in `useEffect` |
| `ScrollToBottomButton` visibility | `!atBottom` |
| `resume()` on button click | `scrollToIndex({ index: 'LAST', behavior: 'smooth' })` — `atBottomStateChange` fires automatically when bottom is reached |

### Footer component

A new `ChatFooter` component (defined in `chat-view.tsx`) renders:
1. `PermissionRequestCard` — currently rendered after the message list.
2. The streaming cursor indicator — currently rendered conditionally after the list.

Both move into the Footer unchanged in logic. The Footer always renders after the last item.

### Bottom padding

`pb-80` (320px) on the content `div` is removed. `increaseViewportBy` is overscan only — it does not add visual space. Instead, `ChatFooter` includes a `<div style={{ height: 320 }} />` spacer at the end, ensuring the last message is visible above the Composer.

### Scroll trigger effects

```ts
// Session switch: scroll to bottom immediately
useEffect(() => {
  virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' })
}, [activeSessionId])

// scrollTrigger: user sent a message, cross-adapter message arrived, history loaded
useEffect(() => {
  if (chat.scrollTrigger() > 0) {
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' })
  }
}, [chat.scrollTrigger()])
```

### Known trade-off: local UI state reset on scroll

Tool block `expanded` state and thinking block expanded state are local component state. When a message scrolls out of the overscan window and is unmounted, this state resets to the default (`expanded = true`). With a 600px overscan, this affects only messages well outside the viewport. Acceptable for now. If it becomes a pain point, expanded state can be lifted to a session-scoped Map (outside this spec).

---

## File Change Summary

| File | Change |
|---|---|
| `components/chat/blocks/tool-block.tsx` | Add `MAX_VISIBLE_LINES`, `truncateLines` helper, truncation logic, "more lines" button |
| `components/chat/chat-view.tsx` | Integrate react-virtuoso, extract grouping to `useMemo`, extract `ChatGroup` component, add `ChatFooter` (with spacer), remove `useAutoScroll` usage |
| `hooks/use-auto-scroll.ts` | **Deleted** |
| `package.json` | Add `react-virtuoso` dependency |

---

## Out of Scope

- Lifting tool block expanded state to session level.
- Virtualization of the session list in the sidebar.
- Any changes to the streaming pipeline (`chat.tsx`, SSE, block update logic).
