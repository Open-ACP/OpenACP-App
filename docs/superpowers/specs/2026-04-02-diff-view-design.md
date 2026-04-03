# Diff View & Review Panel — Design Spec

**Date:** 2026-04-02
**Status:** Approved

## Overview

Two-part feature:
1. **Tool call inline diff** — Edit/Write tools show file content preview (like Claude Code extension)
2. **Review panel** — Right sidebar with full diff view for all file changes in session

## Part 1: Tool Call Inline Display

For Edit/Write tool calls, show:
- Tool name + file path (existing)
- "N lines" subtitle
- Clipped content preview (mask-gradient, ~60px max-height)
- Click to expand or open in Review panel

Data source: `rawInput` from tool_call event contains `file_path`, `content`/`new_string`/`old_string`.

## Part 2: Review Panel (Right Sidebar)

### Layout
- Right sidebar, resizable (default 480px, min 320px, max 700px)
- Toggle via header button or clicking file in tool call
- Tabs at top: file list
- Unified/Split toggle

### Content
- **File list header**: "Session changes" + file count
- **File tabs**: clickable, show filename + change indicator (M/A/D)
- **Diff view**: uses `@pierre/diffs` `FileDiff` component (unified mode default)
- **Stats**: +N -M per file

### Data Flow
```
SSE tool_call event (Edit/Write tools)
  → extract diff from meta field: { path, oldText, newText }
  → store in session diff accumulator
  → Review panel reads accumulated diffs
  → @pierre/diffs FileDiff renders
```

### Diff Extraction
From tool_call events:
- `meta.filediff` → `{ before: string, after: string }` (if server provides)
- Fallback: `rawInput.old_string` + `rawInput.new_string` for Edit tool
- Fallback: `rawInput.content` for Write tool (no before, just after)

## Implementation

### Files to modify
- `vite.config.ts` — remove @pierre/diffs stub, keep other stubs
- `src/openacp/types.ts` — add `diff` field to ToolCallPart
- `src/openacp/context/chat.tsx` — extract diff data from meta, accumulate per session
- `src/openacp/components/message.tsx` — enhance Edit/Write tool rendering
- `src/openacp/components/review-panel.tsx` — NEW: right sidebar diff viewer
- `src/openacp/app.tsx` — add review panel to layout

### Dependencies
- `@pierre/diffs` — install real package, remove stub
- Existing: `src/ui/src/components/file.tsx` wrapper already built
