# Chat Layout & Scroll Refactor Design

**Date:** 2026-04-17
**Status:** Approved

## Problem Statement

The current chat layout has two compounding issues:

### 1. Content visible behind the Composer

The Composer is `absolute inset-x-0 bottom-0 z-10` — an overlay on top of `ChatView`. Its outer wrapper is `pointer-events-none` with no background, making the padding area fully transparent. Chat content scrolls behind this transparent zone and is visually readable through it.

A static 400px footer spacer at the bottom of the Virtuoso list attempts to compensate, but it is not adaptive to the Composer's actual height.

### 2. Fragmented "bottom" definitions causing scroll inconsistency

Three parts of the scroll system use different definitions of "bottom":

| Component | Definition of bottom |
|-----------|---------------------|
| `atBottomStateChange` (threshold=100px) | End of full scroll height, including the 400px footer spacer |
| `scrollToIndex({ index: "LAST" })` (scroll button) | End of the last data item — excludes the footer spacer |
| `followOutput` | End of full scroll height |

This causes the scroll-to-bottom button to scroll to the last item but leave 400px of footer spacer below the viewport. `atBottom` remains `false`, the button stays visible, and the user must manually scroll further to dismiss it.

Additionally, `followOutput="smooth"` (previously) and `followOutput="auto"` (current) both rely on Virtuoso's ResizeObserver batching, which lags behind rapidly growing blocks (e.g., streaming thinking text spanning 2+ screens). When the viewport falls more than `atBottomThreshold` pixels behind due to rapid content growth, `followOutput` disengages.

## Solution

### 1. Flex Column Layout

Replace the absolute-overlay layout with a flex column layout in `ChatArea` (`app.tsx`).

**Before:**
```tsx
<div className="relative ...">
  <ChatView />                                   {/* fills container */}
  <div className="absolute inset-x-0 bottom-0 z-10">
    <Composer />                                 {/* overlays ChatView */}
  </div>
</div>
```

**After:**
```tsx
<div className="flex flex-col ...">
  <ChatView />     {/* flex-1, min-h-0 — fills remaining space */}
  <Composer />     {/* natural flow, shrinks to content height */}
</div>
```

The Composer and ChatView no longer overlap. Content can never appear behind the Composer.

**Cascading changes:**
- `ChatFooter` spacer: 400px → 24px (visual breathing room only; no longer compensates for overlap)
- `Composer` outer wrapper: remove `pointer-events-none` and `[&>*]:pointer-events-auto` (no longer needed since the Composer does not overlay chat content)

### 2. Unified Scroll via rAF Loop

Replace `followOutput` (Virtuoso-internal, ResizeObserver-batched) with a `requestAnimationFrame` loop that runs every frame during streaming.

**`followOutput`:** set to `false` (disabled).

**rAF effect in `ChatView`:**
```tsx
useEffect(() => {
  if (!streaming) return;
  let rafId: number;
  const tick = () => {
    if (!userScrolledUpRef.current) {
      virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "auto", align: "end" });
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}, [streaming]);
```

- `align: "end"` scrolls so the **bottom edge of the last item** aligns with the bottom of the viewport — the same point that `atBottomStateChange` recognises as bottom (with the reduced 24px spacer)
- Runs at 60fps, so there is no detectable gap where rapidly growing content escapes the viewport
- Checks `userScrolledUpRef.current` per frame to immediately honour user scroll-up intent
- `element.scrollTo` when already at the target position is a browser no-op, so CPU overhead when idle at bottom is negligible

**ScrollToBottomButton `onClick`:** update to `scrollToIndex({ index: "LAST", behavior: "smooth", align: "end" })` so it lands at the same point that `atBottomStateChange` recognises as bottom, dismissing the button correctly.

**`userScrolledUpRef` (existing):** unchanged. Set to `true` on upward wheel input; reset to `false` when `atBottomStateChange` fires `isAtBottom=true`.

### 3. Single Source of Truth for "Bottom"

After the refactor, all three components agree on the same definition of bottom:

| Component | Definition after refactor |
|-----------|--------------------------|
| `atBottomStateChange` | End of last item + 24px spacer ≈ end of last item |
| rAF `scrollToIndex(..., align: "end")` | End of last item |
| ScrollToBottomButton `scrollToIndex(..., align: "end")` | End of last item |

`atBottomThreshold` remains at 100px and is now meaningful (detects real user scroll-up, not footer overshoot).

## Files Changed

| File | Changes |
|------|---------|
| `src/openacp/app.tsx` | `ChatArea`: flex column layout, remove absolute wrapper |
| `src/openacp/components/chat/chat-view.tsx` | Remove `followOutput`, add rAF effect, update ScrollToBottomButton `onClick`, reduce `ChatFooter` spacer 400→24px |
| `src/openacp/components/composer.tsx` | Remove `pointer-events-none` and `[&>*]:pointer-events-auto` from outer wrapper |

## Non-Goals

- No changes to message rendering, streaming logic, or Virtuoso item structure
- No changes to `atBottomThreshold` value
- No changes to `userScrolledUpRef` logic (already correct)
- No visual redesign of the Composer or chat area
