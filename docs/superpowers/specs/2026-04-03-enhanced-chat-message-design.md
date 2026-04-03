# Enhanced Chat & Message Format — Design Spec

**Date:** 2026-04-03
**Branch:** `liam/enhanced-chat-messages`
**Approach:** Full rewrite of message layer (Approach B)

## Goal

Rewrite the chat view and message rendering to match Claude Code extension style: timeline dots with connecting lines, expandable thinking blocks, tool calls with IN/OUT table, plan/todos display, and collapsible noise tool groups. Align client types with OpenACP server's adapter-primitives data structures.

## Scope

1. Timeline dots + connecting lines
2. Expandable thinking blocks with duration
3. Tool calls with IN/OUT grid table
4. Update Todos / Plan display
5. Collapsible tool groups (noise filtering)
6. Refactor message types to align with server
7. Chat context plan event handling
8. Composer adjustments as needed

## Type System Rewrite

### Current (being replaced)

```typescript
type MessagePart = TextPart | ThinkingPart | ToolCallPart
```

### New

```typescript
// Aligned with server's ToolDisplaySpec, ThoughtDisplaySpec, PlanEntry

type MessageBlock =
  | TextBlock
  | ThinkingBlock
  | ToolBlock
  | PlanBlock
  | ErrorBlock

interface TextBlock {
  type: "text"
  id: string
  content: string
}

interface ThinkingBlock {
  type: "thinking"
  id: string
  content: string
  durationMs: number | null    // computed: endTime - startTime
  isStreaming: boolean          // true while thought chunks arriving
}

interface ToolBlock {
  type: "tool"
  id: string                   // tool call ID
  name: string                 // raw tool name (e.g. "Read", "Bash")
  kind: string                 // semantic kind (e.g. "read", "execute", "search")
  status: "pending" | "running" | "completed" | "error"
  title: string                // display title from server or derived
  description: string | null   // secondary description
  command: string | null        // for bash/execute kinds
  input: Record<string, unknown> | null   // raw input params
  output: string | null         // tool output content
  diffStats: { added: number; removed: number } | null
  isNoise: boolean             // glob, grep, ls = noise
  isHidden: boolean            // hidden at current output mode
}

interface PlanBlock {
  type: "plan"
  id: string
  entries: PlanEntry[]
}

interface PlanEntry {
  content: string
  status: "pending" | "in_progress" | "completed"
}

interface ErrorBlock {
  type: "error"
  id: string
  content: string
}

// Message container
interface Message {
  id: string
  role: "user" | "assistant"
  sessionID: string
  blocks: MessageBlock[]
  createdAt: number              // epoch ms (matches existing convention)
  parentID?: string
}
```

### Mapping from SSE events to blocks

| SSE Event | Block Type | Notes |
|-----------|-----------|-------|
| `text` | TextBlock | Accumulate text chunks, flush via RAF |
| `thought` | ThinkingBlock | Track startTime on first chunk, compute durationMs on seal |
| `tool_call` | ToolBlock | Create with status "running", derive kind/title from name+input |
| `tool_update` | ToolBlock (update) | Merge status, output, diffStats, use displayTitle/displayKind/displaySummary if provided |
| `plan` | PlanBlock | Upsert — replace entries array on each event |
| `error` | ErrorBlock | Create error block |
| `usage` | (signals end) | Seal thinking, finalize all blocks |

### SSE type updates required

The `AgentEventPayload` for `tool_call` and `tool_update` events needs these optional fields added to `types.ts`:

```typescript
// Add to tool_call and tool_update event variants
displayTitle?: string
displayKind?: string
displaySummary?: string
isNoise?: boolean
```

### Kind resolution order

When populating `ToolBlock.kind`:

1. `evt.displayKind` (server-provided, highest priority)
2. `evt.kind` (SSE event field)
3. Client-side derivation from tool name (fallback)
4. `"other"` (default)

Client-side derivation table:

```
Read → "read", Grep/Glob → "search"
Edit → "edit", Write → "write"
Bash, Terminal → "execute"
Agent → "agent"
WebFetch, WebSearch → "web"
* → "other"
```

### Field derivation for ToolBlock

- `title`: `evt.displayTitle` > `evt.displaySummary` > client-side derivation from name+input (see server's `buildTitle` logic)
- `description`: `input.description` if it differs from title, otherwise null
- `command`: `input.command` for execute/bash kinds, otherwise null
- `isNoise`: `evt.isNoise` > client-side heuristic (glob, grep, ls = noise)

## Component Architecture

### Directory structure

```
src/openacp/components/chat/
├── chat-view.tsx          — scroll container + message list
├── message-turn.tsx       — per-turn wrapper with timeline
├── user-message.tsx       — user message bubble
├── timeline-step.tsx      — dot + line + content slot
├── blocks/
│   ├── text-block.tsx     — markdown + paced streaming
│   ├── thinking-block.tsx — expandable <details> with duration
│   ├── tool-block.tsx     — title + IN/OUT grid
│   ├── plan-block.tsx     — checklist with status icons
│   ├── error-block.tsx    — error display
│   └── tool-group.tsx     — collapsible noise group
└── index.ts               — re-exports
```

### Component hierarchy

```
ChatView
├── UserMessage (sticky card)
└── MessageTurn (per assistant message)
    └── Timeline container (padding-left: 28px, relative)
        ├── Timeline vertical line (1px, position absolute, left: 12px)
        ├── TimelineStep (per visible block)
        │   ├── Dot (7px circle, position absolute, left: 9px)
        │   └── Content (one of: ThinkingBlock, ToolBlock, PlanBlock, TextBlock, ErrorBlock)
        └── ToolGroup (wraps consecutive noise ToolBlocks)
            ├── Header ("Explored N files", collapsible)
            └── TimelineStep × N (hidden until expanded)
```

### TimelineStep

```tsx
interface TimelineStepProps {
  status: "success" | "failure" | "progress" | "default"
  isLast: boolean       // controls line length
  children: JSX.Element
}
```

- Dot: 7px circle, `border-radius: 50%`, positioned `left: 9px`, `top: 7px`
- Colors: success=#a6e3a1, failure=#f38ba8, progress=blinking animation, default=secondary foreground
- Line: 1px vertical, `left: 12px`, full height. Last step: 18px height or hidden if single step.

### ThinkingBlock

```tsx
interface ThinkingBlockProps {
  block: ThinkingBlock
}
```

- Uses native `<details>` element for expand/collapse
- Summary: "Thinking..." (streaming) or "Thought for Xs" (sealed)
- Chevron icon rotates 90deg on expand (CSS `transform: rotate(90deg)`)
- Content: rendered as plain text in muted style, `border-left: 2px solid border-color`
- Collapsed by default

### ToolBlock

```tsx
interface ToolBlockProps {
  block: ToolBlock
  defaultExpanded?: boolean
}
```

- **Title row**: `{icon} {kind_label} {title} {diffStats?}` — clickable to expand/collapse
- **Body**: Grid `grid-template-columns: max-content 1fr`
  - IN row: label "IN" (monospace, 0.85em, opacity 0.5) | content (formatted input params)
  - OUT row: label "OUT" | content (output text, gradient mask at 60px max-height when collapsed)
- Border: 0.5px solid border-color, border-radius: 5px
- Pending state: shimmer animation on title
- Input formatting: show key-value pairs, skip large content fields (content, new_string)

### PlanBlock

```tsx
interface PlanBlockProps {
  block: PlanBlock
}
```

- Header: "Update Todos" (bold)
- List of entries with status icons:
  - completed: ✓ green, text line-through muted
  - in_progress: 🔄 or spinner
  - pending: ○ muted circle
- Compact layout, no border box

### ToolGroup

```tsx
interface ToolGroupProps {
  tools: ToolBlock[]
  children: JSX.Element  // TimelineStep children
}
```

- Collapsed header: "Explored {N} files" or "{N} tool calls" with chevron
- Expanded: shows all child TimelineSteps
- Dot color: all success → green, any failure → red, any progress → blinking

## Chat Context Rewrite

### Key changes to `context/chat.tsx`

1. **Block-based accumulation** instead of part-based:
   - `currentTextBuffer: string` → flush into TextBlock
   - `currentThinkingBuffer: { chunks: string[], startTime: number }` → flush into ThinkingBlock
   - Tool tracking by ID → ToolBlock upsert

2. **Plan event handler**:
   ```
   "plan" event → validate entries (cast from unknown[] to PlanEntry[])
     → find existing PlanBlock in current message blocks
     → if exists: replace entries
     → if not: push new PlanBlock
   ```
   Runtime validation: each entry must have `content: string` and `status: string`. Invalid entries are skipped.

3. **Thinking duration tracking**:
   - On first "thought" event: record `Date.now()` as startTime
   - On seal (next non-thought event or usage): call `flushBuffers()` first to ensure all pending RAF chunks are written, then compute `durationMs = Date.now() - startTime`

4. **Tool noise grouping** (rendering concern, not context):
   - Context stores individual ToolBlocks in order
   - `message-turn.tsx` groups consecutive noise ToolBlocks at render time
   - Grouping rule: consecutive `ToolBlock` items where `isNoise === true` form a group, broken by any non-noise block

5. **History mapping** (`historyToMessages`):
   - Map server history steps to new MessageBlock types
   - Preserve backward compatibility with existing cached messages

### Streaming flow

```
SSE "thought" → append to thinkingBuffer, update ThinkingBlock.content
SSE "text"    → flush thinking (seal), append to textBuffer, RAF flush to TextBlock
SSE "tool_call" → flush text+thinking, create ToolBlock(status:"running")
SSE "tool_update" → update ToolBlock fields (status, output, input, diffStats, title)
SSE "plan"    → upsert PlanBlock in current message
SSE "usage"   → seal all buffers, mark streaming complete
SSE "error"   → flush all, append ErrorBlock
```

## Styling

### New CSS classes (in `styles.css`)

```css
/* Timeline */
.oac-timeline { position: relative; padding-left: 28px; }
.oac-timeline-line { position: absolute; left: 12px; top: 0; bottom: 0; width: 1px; background: var(--color-border); }

/* Step dots */
.oac-step { position: relative; margin-bottom: 12px; }
.oac-step::before { content: ""; position: absolute; left: -19px; top: 7px; width: 7px; height: 7px; border-radius: 50%; background: var(--color-foreground-secondary); z-index: 1; }
.oac-step--success::before { background: #a6e3a1; }
.oac-step--failure::before { background: #f38ba8; }
.oac-step--progress::before { animation: oac-blink 1s linear infinite; }
.oac-step:last-child { margin-bottom: 0; }

/* Thinking */
.oac-thinking summary { cursor: pointer; color: var(--color-foreground-secondary); font-style: italic; font-size: 12px; list-style: none; display: flex; align-items: center; gap: 4px; }
.oac-thinking-chevron { font-size: 10px; transition: transform 0.15s; }
.oac-thinking[open] .oac-thinking-chevron { transform: rotate(90deg); }
.oac-thinking-content { color: var(--color-foreground-secondary); font-size: 12px; margin-top: 6px; padding: 8px; border-left: 2px solid var(--color-border); border-radius: 0 4px 4px 0; }

/* Tool IN/OUT */
.oac-tool-title { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
.oac-tool-body { border: 0.5px solid var(--color-border); border-radius: 5px; overflow: hidden; font-size: 12px; margin-top: 4px; }
.oac-tool-grid { display: grid; grid-template-columns: max-content 1fr; }
.oac-tool-row-label { padding: 4px 8px; color: var(--color-foreground-secondary); opacity: 0.5; font-family: monospace; font-size: 11px; border-right: 0.5px solid var(--color-border); }
.oac-tool-row-content { padding: 4px 8px; font-family: monospace; font-size: 11px; max-height: 60px; overflow: hidden; -webkit-mask-image: linear-gradient(black 50px, transparent 60px); }
.oac-tool-row + .oac-tool-row .oac-tool-row-label,
.oac-tool-row + .oac-tool-row .oac-tool-row-content { border-top: 0.5px solid var(--color-border); }

/* Plan/Todos */
.oac-plan-entry { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; font-size: 12px; }
.oac-plan-entry--completed { color: var(--color-foreground-secondary); text-decoration: line-through; }

/* Tool group */
.oac-tool-group-header { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; color: var(--color-foreground-secondary); }

/* Animations */
@keyframes oac-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
```

## Migration Notes

- Old `MessagePart` (TextPart, ThinkingPart, ToolCallPart) → new `MessageBlock` union
- Old `message.tsx` (MessageBubble, PartRenderer, etc.) → deleted, replaced by `chat/` components
- Cached messages on disk: need migration function or re-fetch from server
- `review-panel.tsx`: update to read `ToolBlock.diffStats` instead of `ToolCallPart.diff`
- `composer.tsx`: minimal changes, keep as-is unless specific adjustments needed

## Dependencies

- No new npm packages required
- Uses existing: `@openacp/ui` Markdown component, Kobalte Collapsible (for tool group), phosphor-solid-js icons
- Server already sends all required data (ToolDisplaySpec fields, plan events, thought events)

## Intentionally Unhandled Events

These SSE/history event types are silently dropped (same as current behavior):
- `mode_change`, `config_change` — UI config events, not chat content
- `resource_link` — future feature, not rendered in chat view

## Out of Scope

- Syntax highlighting in tool output (future enhancement)
- File diff inline rendering in tool blocks (keep in review panel)
- Permission request UI (separate feature)
- Attachment/image display (separate feature)
- `ToolBlock.isHidden` / output mode switching (forward-looking field, not implemented in this phase — always false)
