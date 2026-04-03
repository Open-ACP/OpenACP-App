# Enhanced Chat & Message Format — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the chat message layer to Claude Code extension style — timeline dots, expandable thinking, tool IN/OUT tables, plan/todos, noise tool groups.

**Architecture:** Full rewrite of types, chat context, and message components. New `MessageBlock` union replaces `MessagePart`. New `src/openacp/components/chat/` directory with one component per block type, composed through `TimelineStep` and `MessageTurn` wrappers. Chat context rebuilt to accumulate blocks instead of parts, with plan event handling and thinking duration tracking.

**Tech Stack:** SolidJS (signals/stores), TypeScript strict, CSS custom properties, existing @openacp/ui Markdown + TextShimmer components

**Spec:** `docs/superpowers/specs/2026-04-03-enhanced-chat-message-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/openacp/types.ts` | Modify | Add MessageBlock union, PlanEntry, update AgentEventPayload |
| `src/openacp/components/chat/blocks/text-block.tsx` | Create | Markdown rendering with paced streaming |
| `src/openacp/components/chat/blocks/thinking-block.tsx` | Create | Expandable `<details>` with duration |
| `src/openacp/components/chat/blocks/tool-block.tsx` | Create | Title + IN/OUT grid table |
| `src/openacp/components/chat/blocks/plan-block.tsx` | Create | Checklist with status icons |
| `src/openacp/components/chat/blocks/error-block.tsx` | Create | Error display |
| `src/openacp/components/chat/blocks/tool-group.tsx` | Create | Collapsible noise tool group |
| `src/openacp/components/chat/timeline-step.tsx` | Create | Dot + line wrapper |
| `src/openacp/components/chat/user-message.tsx` | Create | User message bubble (extracted from message.tsx) |
| `src/openacp/components/chat/message-turn.tsx` | Create | Per-turn timeline container with noise grouping |
| `src/openacp/components/chat/chat-view.tsx` | Create | Scroll container + message list (replaces old chat-view.tsx) |
| `src/openacp/components/chat/block-utils.ts` | Create | Kind derivation, title building, noise detection, input formatting |
| `src/openacp/components/chat/index.ts` | Create | Re-exports |
| `src/openacp/context/chat.tsx` | Rewrite | Block-based accumulation, plan events, thinking duration |
| `src/openacp/styles.css` | Modify | Add timeline, thinking, tool IN/OUT, plan CSS |
| `src/openacp/components/review-panel.tsx` | Modify | Update to read ToolBlock instead of ToolCallPart |
| `src/openacp/components/message.tsx` | Delete | Replaced by chat/ components |
| `src/openacp/components/chat-view.tsx` | Delete | Replaced by chat/chat-view.tsx |

---

## Chunk 1: Types + Utilities + CSS

### Task 1: Update type system

**Files:**
- Modify: `src/openacp/types.ts`

- [ ] **Step 1: Add MessageBlock types below existing MessagePart types**

Add after line 44 (`export type MessagePart = ...`):

```typescript
// ── Message Blocks (new) ───────────────────────────────────────────────────

export interface TextBlock {
  type: "text"
  id: string
  content: string
}

export interface ThinkingBlock {
  type: "thinking"
  id: string
  content: string
  durationMs: number | null
  isStreaming: boolean
}

export interface ToolBlock {
  type: "tool"
  id: string
  name: string
  kind: string
  status: "pending" | "running" | "completed" | "error"
  title: string
  description: string | null
  command: string | null
  input: Record<string, unknown> | null
  output: string | null
  diffStats: { added: number; removed: number } | null
  isNoise: boolean
  isHidden: boolean
}

export interface PlanEntry {
  content: string
  status: "pending" | "in_progress" | "completed"
}

export interface PlanBlock {
  type: "plan"
  id: string
  entries: PlanEntry[]
}

export interface ErrorBlock {
  type: "error"
  id: string
  content: string
}

export type MessageBlock = TextBlock | ThinkingBlock | ToolBlock | PlanBlock | ErrorBlock
```

- [ ] **Step 2: Add `blocks` field to Message interface**

Update `Message` interface — add `blocks: MessageBlock[]` alongside existing `parts` (keep `parts` for now so nothing breaks during migration):

```typescript
export interface Message {
  id: string
  role: "user" | "assistant"
  sessionID: string
  parentID?: string
  parts: MessagePart[]        // legacy — kept during migration
  blocks: MessageBlock[]      // new block-based content
  createdAt: number
}
```

- [ ] **Step 3: Add display fields to AgentEventPayload tool_call and tool_update variants**

In the `tool_call` variant, add after `meta?`:
```typescript
displayTitle?: string
displayKind?: string
displaySummary?: string
isNoise?: boolean
```

Same fields in `tool_update` variant.

- [ ] **Step 4: Verify build**

Run: `npx vite build`
Expected: SUCCESS (no breaking changes — only additions)

- [ ] **Step 5: Commit**

```
git add src/openacp/types.ts
git commit -m "feat: add MessageBlock type system for enhanced chat"
```

### Task 2: Create block utility functions

**Files:**
- Create: `src/openacp/components/chat/block-utils.ts`

- [ ] **Step 1: Create block-utils.ts with kind derivation, title building, noise detection, input formatting**

```typescript
// src/openacp/components/chat/block-utils.ts

const KIND_MAP: Record<string, string> = {
  read: "read",
  grep: "search",
  glob: "search",
  edit: "edit",
  write: "write",
  bash: "execute",
  terminal: "execute",
  agent: "agent",
  webfetch: "web",
  websearch: "web",
  web_fetch: "web",
  web_search: "web",
}

const KIND_ICONS: Record<string, string> = {
  read: "📖",
  search: "🔍",
  edit: "✏️",
  write: "📝",
  execute: "▶️",
  agent: "🧠",
  web: "🌐",
  other: "🔧",
}

const KIND_LABELS: Record<string, string> = {
  read: "Read",
  search: "Search",
  edit: "Edit",
  write: "Write",
  execute: "Bash",
  agent: "Agent",
  web: "Web",
  other: "Tool",
}

const NOISE_TOOLS = new Set(["glob", "grep", "ls"])

/**
 * Resolve kind from server fields or client-side derivation.
 * Priority: displayKind > evt.kind > name-based derivation > "other"
 */
export function resolveKind(name: string, evtKind?: string, displayKind?: string): string {
  if (displayKind) return displayKind
  if (evtKind) return evtKind
  return KIND_MAP[name.toLowerCase()] ?? "other"
}

export function kindIcon(kind: string): string {
  return KIND_ICONS[kind] ?? KIND_ICONS.other
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? KIND_LABELS.other
}

/**
 * Build display title from server fields or input params.
 * Priority: displayTitle > displaySummary > client derivation
 */
export function buildTitle(
  name: string,
  kind: string,
  input: Record<string, unknown> | null,
  displayTitle?: string,
  displaySummary?: string,
): string {
  if (displayTitle) return displayTitle
  if (displaySummary) return displaySummary
  if (!input) return name

  const filePath = input.file_path ?? input.filePath ?? input.path
  if (typeof filePath === "string" && filePath) return filePath

  if (kind === "execute") {
    const cmd = input.command ?? input.cmd
    if (typeof cmd === "string") return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd
  }

  if (kind === "search") {
    const pattern = input.pattern ?? input.query
    if (typeof pattern === "string") return `"${pattern}"`
  }

  if (kind === "agent") {
    const desc = input.description
    if (typeof desc === "string") return desc.length > 60 ? desc.slice(0, 57) + "..." : desc
  }

  if (kind === "web") {
    const url = input.url ?? input.query
    if (typeof url === "string" && url !== "undefined") return url.length > 60 ? url.slice(0, 57) + "..." : url
  }

  return name
}

/**
 * Extract description from input if it differs from title.
 */
export function extractDescription(input: Record<string, unknown> | null, title: string): string | null {
  if (!input) return null
  const desc = input.description
  if (typeof desc === "string" && desc !== title && desc.toLowerCase() !== title.toLowerCase()) {
    return desc
  }
  return null
}

/**
 * Extract command for execute/bash kinds.
 */
export function extractCommand(kind: string, input: Record<string, unknown> | null): string | null {
  if (!input) return null
  if (kind !== "execute") return null
  const cmd = input.command ?? input.cmd
  return typeof cmd === "string" ? cmd : null
}

/**
 * Check if tool is noise (should be collapsed in groups).
 */
export function isNoiseTool(name: string, evtIsNoise?: boolean): boolean {
  if (evtIsNoise !== undefined) return evtIsNoise
  return NOISE_TOOLS.has(name.toLowerCase())
}

/**
 * Format tool input for IN row display.
 * Shows key=value pairs, skips large content fields.
 */
export function formatToolInput(input: Record<string, unknown> | null): string {
  if (!input) return ""
  const SKIP = new Set(["content", "new_string", "old_string", "patch", "data"])
  const lines: string[] = []
  for (const [key, value] of Object.entries(input)) {
    if (SKIP.has(key)) continue
    if (value === undefined || value === null) continue
    if (typeof value === "string") {
      lines.push(`${key}: ${value.length > 80 ? value.slice(0, 77) + "..." : value}`)
    } else if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${key}: ${value}`)
    }
  }
  return lines.join("\n")
}

/**
 * Validate unknown[] entries from plan SSE event to PlanEntry[].
 */
export function validatePlanEntries(raw: unknown[]): import("../../types").PlanEntry[] {
  const entries: import("../../types").PlanEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    if (typeof obj.content !== "string") continue
    const status = typeof obj.status === "string" ? obj.status : "pending"
    const validStatus = ["pending", "in_progress", "completed"].includes(status) ? status : "pending"
    entries.push({ content: obj.content, status: validStatus as "pending" | "in_progress" | "completed" })
  }
  return entries
}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build`

- [ ] **Step 3: Commit**

```
git add src/openacp/components/chat/block-utils.ts
git commit -m "feat: add block utility functions for kind/title/noise resolution"
```

### Task 3: Add CSS styles

**Files:**
- Modify: `src/openacp/styles.css`

- [ ] **Step 1: Append timeline, thinking, tool IN/OUT, plan, and tool group CSS**

Add before the `/* ── Spinner */` section at the end of styles.css:

```css
/* ── Timeline ───────────────────────────────────────────────────────────── */

.oac-timeline {
  position: relative;
  padding-left: 28px;
}

.oac-timeline-line {
  position: absolute;
  left: 12px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border-weak-base);
}

/* ── Step dots ──────────────────────────────────────────────────────────── */

.oac-step {
  position: relative;
  margin-bottom: 12px;
}

.oac-step::before {
  content: "";
  position: absolute;
  left: -19px;
  top: 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-weaker);
  z-index: 1;
}

.oac-step--success::before { background: #a6e3a1; }
.oac-step--failure::before { background: #f38ba8; }
.oac-step--progress::before { animation: oac-blink 1s linear infinite; }
.oac-step:last-child { margin-bottom: 0; }

@keyframes oac-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* ── Thinking block ─────────────────────────────────────────────────────── */

.oac-thinking summary {
  cursor: pointer;
  color: var(--text-weak);
  font-style: italic;
  font-size: 12px;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

.oac-thinking summary::-webkit-details-marker { display: none; }

.oac-thinking-chevron {
  font-size: 10px;
  transition: transform 0.15s;
  color: var(--text-weaker);
}

.oac-thinking[open] .oac-thinking-chevron {
  transform: rotate(90deg);
}

.oac-thinking-content {
  color: var(--text-weak);
  font-size: 12px;
  line-height: 1.5;
  margin-top: 6px;
  padding: 8px;
  border-left: 2px solid var(--border-weak-base);
  border-radius: 0 4px 4px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ── Tool IN/OUT card ───────────────────────────────────────────────────── */

.oac-tool-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.oac-tool-card-title:hover {
  opacity: 0.8;
}

.oac-tool-card-body {
  border: 0.5px solid var(--border-weak-base);
  border-radius: 5px;
  overflow: hidden;
  font-size: 12px;
  margin-top: 4px;
}

.oac-tool-card-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
}

.oac-tool-card-row {
  display: contents;
}

.oac-tool-card-row-label {
  padding: 4px 8px;
  color: var(--text-weak);
  opacity: 0.5;
  font-family: var(--font-family-mono);
  font-feature-settings: var(--font-family-mono--font-feature-settings);
  font-size: 11px;
  border-right: 0.5px solid var(--border-weak-base);
}

.oac-tool-card-row-content {
  padding: 4px 8px;
  font-family: var(--font-family-mono);
  font-feature-settings: var(--font-family-mono--font-feature-settings);
  font-size: 11px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 60px;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, black 50px, transparent 60px);
  mask-image: linear-gradient(to bottom, black 50px, transparent 60px);
}

.oac-tool-card-row-content--expanded {
  max-height: none;
  -webkit-mask-image: none;
  mask-image: none;
}

.oac-tool-card-row + .oac-tool-card-row .oac-tool-card-row-label,
.oac-tool-card-row + .oac-tool-card-row .oac-tool-card-row-content {
  border-top: 0.5px solid var(--border-weak-base);
}

.oac-tool-card-shimmer {
  animation: oac-shimmer 1.5s ease-in-out infinite;
}

@keyframes oac-shimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ── Diff stats inline ──────────────────────────────────────────────────── */

.oac-diff-stat-add { color: #a6e3a1; font-size: 11px; }
.oac-diff-stat-del { color: #f38ba8; font-size: 11px; }

/* ── Plan/Todos ─────────────────────────────────────────────────────────── */

.oac-plan-header {
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 6px;
  color: var(--text-base);
}

.oac-plan-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
  font-size: 12px;
  color: var(--text-base);
}

.oac-plan-entry--completed {
  color: var(--text-weak);
  text-decoration: line-through;
}

.oac-plan-entry--in-progress {
  color: var(--text-base);
}

/* ── Tool group (noise collapse) ────────────────────────────────────────── */

.oac-tool-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-weak);
  user-select: none;
}

.oac-tool-group-header:hover {
  color: var(--text-base);
}

.oac-tool-group-chevron {
  font-size: 10px;
  transition: transform 0.15s;
}

.oac-tool-group--open .oac-tool-group-chevron {
  transform: rotate(90deg);
}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build`

- [ ] **Step 3: Commit**

```
git add src/openacp/styles.css
git commit -m "feat: add CSS for timeline, thinking, tool cards, plan, and tool groups"
```

---

## Chunk 2: Block Components

### Task 4: Create TimelineStep component

**Files:**
- Create: `src/openacp/components/chat/timeline-step.tsx`

- [ ] **Step 1: Write TimelineStep**

```typescript
import type { JSX } from "solid-js"

export type StepStatus = "success" | "failure" | "progress" | "default"

interface TimelineStepProps {
  status?: StepStatus
  children: JSX.Element
}

export function TimelineStep(props: TimelineStepProps) {
  const statusClass = () => {
    switch (props.status) {
      case "success": return "oac-step--success"
      case "failure": return "oac-step--failure"
      case "progress": return "oac-step--progress"
      default: return ""
    }
  }

  return (
    <div class={`oac-step ${statusClass()}`}>
      {props.children}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/openacp/components/chat/timeline-step.tsx
git commit -m "feat: add TimelineStep component with status dots"
```

### Task 5: Create TextBlock component

**Files:**
- Create: `src/openacp/components/chat/blocks/text-block.tsx`

- [ ] **Step 1: Write TextBlock** (extracted from message.tsx TextPartView)

```typescript
import { Markdown } from "../../../ui/src/components/markdown"
import { createPacedValue } from "../../hooks/create-paced-value"
import type { TextBlock as TextBlockType } from "../../types"

interface TextBlockProps {
  block: TextBlockType
  streaming?: boolean
}

export function TextBlockView(props: TextBlockProps) {
  const pacedText = createPacedValue(
    () => props.block.content,
    () => props.streaming ?? false,
  )

  return (
    <div class="min-w-0">
      <Markdown
        text={pacedText()}
        cacheKey={props.block.id}
        streaming={props.streaming}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/openacp/components/chat/blocks/text-block.tsx
git commit -m "feat: add TextBlock component with paced streaming"
```

### Task 6: Create ThinkingBlock component

**Files:**
- Create: `src/openacp/components/chat/blocks/thinking-block.tsx`

- [ ] **Step 1: Write ThinkingBlock**

```typescript
import { Show } from "solid-js"
import type { ThinkingBlock as ThinkingBlockType } from "../../types"

interface ThinkingBlockProps {
  block: ThinkingBlockType
}

export function ThinkingBlockView(props: ThinkingBlockProps) {
  const summaryText = () => {
    if (props.block.isStreaming) return "Thinking..."
    if (props.block.durationMs !== null) {
      const seconds = Math.round(props.block.durationMs / 1000)
      return `Thought for ${seconds}s`
    }
    return "Thinking"
  }

  const hasContent = () => !!props.block.content?.trim()

  return (
    <Show
      when={hasContent()}
      fallback={
        <div class="oac-thinking">
          <div style={{ "font-style": "italic", "font-size": "12px", color: "var(--text-weak)" }}>
            {summaryText()}
          </div>
        </div>
      }
    >
      <details class="oac-thinking">
        <summary>
          <span>{summaryText()}</span>
          <span class="oac-thinking-chevron">▶</span>
        </summary>
        <div class="oac-thinking-content">
          {props.block.content}
        </div>
      </details>
    </Show>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/openacp/components/chat/blocks/thinking-block.tsx
git commit -m "feat: add ThinkingBlock with expandable details and duration"
```

### Task 7: Create ToolBlock component

**Files:**
- Create: `src/openacp/components/chat/blocks/tool-block.tsx`

- [ ] **Step 1: Write ToolBlock with IN/OUT grid**

```typescript
import { Show, createSignal, createMemo } from "solid-js"
import { TextShimmer } from "../../../ui/src/components/text-shimmer"
import { kindIcon, kindLabel, formatToolInput } from "../block-utils"
import type { ToolBlock as ToolBlockType } from "../../types"

interface ToolBlockProps {
  block: ToolBlockType
}

export function ToolBlockView(props: ToolBlockProps) {
  const [expanded, setExpanded] = createSignal(false)
  const isPending = () => props.block.status === "pending" || props.block.status === "running"

  const icon = createMemo(() => kindIcon(props.block.kind))
  const label = createMemo(() => kindLabel(props.block.kind))
  const inputText = createMemo(() => formatToolInput(props.block.input))
  const hasBody = () => !!inputText() || !!props.block.output

  return (
    <div>
      {/* Title row */}
      <div
        class="oac-tool-card-title"
        classList={{ "oac-tool-card-shimmer": isPending() }}
        onClick={() => hasBody() && setExpanded(!expanded())}
      >
        <span>{icon()}</span>
        <span style={{ "font-weight": "500" }}>{label()}</span>
        <span style={{ color: "var(--text-weak)" }}>{props.block.title}</span>
        <Show when={props.block.diffStats}>
          {(stats) => (
            <>
              <Show when={stats().added > 0}>
                <span class="oac-diff-stat-add">+{stats().added}</span>
              </Show>
              <Show when={stats().removed > 0}>
                <span class="oac-diff-stat-del">-{stats().removed}</span>
              </Show>
            </>
          )}
        </Show>
        <Show when={isPending()}>
          <TextShimmer text="" active class="" />
        </Show>
      </div>

      {/* IN/OUT body */}
      <Show when={expanded() && hasBody()}>
        <div class="oac-tool-card-body">
          <div class="oac-tool-card-grid">
            <Show when={inputText()}>
              <div class="oac-tool-card-row">
                <div class="oac-tool-card-row-label">IN</div>
                <div class="oac-tool-card-row-content">{inputText()}</div>
              </div>
            </Show>
            <Show when={props.block.output}>
              <div class="oac-tool-card-row">
                <div class="oac-tool-card-row-label">OUT</div>
                <div class="oac-tool-card-row-content">{props.block.output}</div>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/openacp/components/chat/blocks/tool-block.tsx
git commit -m "feat: add ToolBlock with IN/OUT grid table"
```

### Task 8: Create PlanBlock component

**Files:**
- Create: `src/openacp/components/chat/blocks/plan-block.tsx`

- [ ] **Step 1: Write PlanBlock**

```typescript
import { For } from "solid-js"
import type { PlanBlock as PlanBlockType, PlanEntry } from "../../types"

interface PlanBlockProps {
  block: PlanBlockType
}

function PlanIcon(props: { status: PlanEntry["status"] }) {
  switch (props.status) {
    case "completed":
      return <span style={{ color: "#a6e3a1" }}>✓</span>
    case "in_progress":
      return <span class="oac-spinner" style={{ display: "inline-block", width: "12px", height: "12px", border: "1.5px solid var(--text-weak)", "border-top-color": "transparent", "border-radius": "50%" }} />
    default:
      return <span style={{ color: "var(--text-weaker)" }}>○</span>
  }
}

export function PlanBlockView(props: PlanBlockProps) {
  return (
    <div>
      <div class="oac-plan-header">Update Todos</div>
      <For each={props.block.entries}>
        {(entry) => (
          <div
            class="oac-plan-entry"
            classList={{
              "oac-plan-entry--completed": entry.status === "completed",
              "oac-plan-entry--in-progress": entry.status === "in_progress",
            }}
          >
            <PlanIcon status={entry.status} />
            <span>{entry.content}</span>
          </div>
        )}
      </For>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/openacp/components/chat/blocks/plan-block.tsx
git commit -m "feat: add PlanBlock checklist component"
```

### Task 9: Create ErrorBlock component

**Files:**
- Create: `src/openacp/components/chat/blocks/error-block.tsx`

- [ ] **Step 1: Write ErrorBlock**

```typescript
import type { ErrorBlock as ErrorBlockType } from "../../types"

interface ErrorBlockProps {
  block: ErrorBlockType
}

export function ErrorBlockView(props: ErrorBlockProps) {
  return (
    <div style={{ color: "var(--surface-critical-strong)", "font-size": "13px" }}>
      <strong>Error:</strong> {props.block.content}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/openacp/components/chat/blocks/error-block.tsx
git commit -m "feat: add ErrorBlock component"
```

### Task 10: Create ToolGroup component

**Files:**
- Create: `src/openacp/components/chat/blocks/tool-group.tsx`

- [ ] **Step 1: Write ToolGroup for collapsible noise tools**

```typescript
import { For, Show, createSignal, createMemo } from "solid-js"
import { TimelineStep, type StepStatus } from "../timeline-step"
import { ToolBlockView } from "./tool-block"
import type { ToolBlock } from "../../types"

interface ToolGroupProps {
  tools: ToolBlock[]
}

export function ToolGroup(props: ToolGroupProps) {
  const [expanded, setExpanded] = createSignal(false)

  const groupStatus = createMemo((): StepStatus => {
    const tools = props.tools
    if (tools.some((t) => t.status === "error")) return "failure"
    if (tools.some((t) => t.status === "pending" || t.status === "running")) return "progress"
    if (tools.every((t) => t.status === "completed")) return "success"
    return "default"
  })

  const label = () => {
    const count = props.tools.length
    return `${count} tool call${count !== 1 ? "s" : ""}`
  }

  return (
    <TimelineStep status={groupStatus()}>
      <div classList={{ "oac-tool-group--open": expanded() }}>
        <div class="oac-tool-group-header" onClick={() => setExpanded(!expanded())}>
          <span class="oac-tool-group-chevron">▶</span>
          <span>{label()}</span>
        </div>

        <Show when={expanded()}>
          <div style={{ "margin-top": "8px" }}>
            <For each={props.tools}>
              {(tool) => (
                <div style={{ "margin-bottom": "8px" }}>
                  <ToolBlockView block={tool} />
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </TimelineStep>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/openacp/components/chat/blocks/tool-group.tsx
git commit -m "feat: add ToolGroup for collapsible noise tool calls"
```

---

## Chunk 3: Composition Components

### Task 11: Create UserMessage component

**Files:**
- Create: `src/openacp/components/chat/user-message.tsx`

- [ ] **Step 1: Extract UserMessage from message.tsx**

```typescript
import { createMemo, createSignal, Show } from "solid-js"
import type { Message } from "../../types"

function formatTime(timestamp: number): string {
  return new Date(timestamp)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase()
}

function CopyButton(props: { text: string }) {
  const [copied, setCopied] = createSignal(false)

  async function handleCopy(e: MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(props.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <button class="oac-copy-btn" onClick={handleCopy} title={copied() ? "Copied" : "Copy"}>
      <Show when={copied()} fallback={
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z" stroke="currentColor" stroke-linecap="round"/>
        </svg>
      }>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-linecap="square"/>
        </svg>
      </Show>
    </button>
  )
}

function getUserText(msg: Message): string {
  // Support both old parts and new blocks
  if (msg.blocks?.length > 0) {
    return msg.blocks
      .filter((b) => b.type === "text")
      .map((b) => (b as { content: string }).content)
      .join("\n")
  }
  return msg.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { content: string }).content)
    .join("\n")
}

export function UserMessage(props: { message: Message }) {
  const timeStr = createMemo(() => formatTime(props.message.createdAt))
  const text = createMemo(() => getUserText(props.message))

  return (
    <div
      data-component="oac-user-message"
      class="sticky top-0 z-10 rounded-md border border-border-base bg-background-stronger shadow-sm"
      style={{ padding: "8px 12px" }}
    >
      <div class="text-14-regular text-text-strong whitespace-pre-wrap break-words leading-relaxed">
        {text()}
      </div>
      <div class="flex items-center gap-2 mt-1" style={{ "justify-content": "flex-end" }}>
        <span class="text-12-regular text-text-weak select-none">{timeStr()}</span>
        <CopyButton text={text()} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/openacp/components/chat/user-message.tsx
git commit -m "feat: extract UserMessage component to chat directory"
```

### Task 12: Create MessageTurn component

**Files:**
- Create: `src/openacp/components/chat/message-turn.tsx`

- [ ] **Step 1: Write MessageTurn with timeline and noise grouping**

```typescript
import { For, Match, Show, Switch, createMemo } from "solid-js"
import { TextShimmer } from "../../../ui/src/components/text-shimmer"
import { TimelineStep, type StepStatus } from "./timeline-step"
import { TextBlockView } from "./blocks/text-block"
import { ThinkingBlockView } from "./blocks/thinking-block"
import { ToolBlockView } from "./blocks/tool-block"
import { PlanBlockView } from "./blocks/plan-block"
import { ErrorBlockView } from "./blocks/error-block"
import { ToolGroup } from "./blocks/tool-group"
import type { Message, MessageBlock, ToolBlock } from "../../types"

interface MessageTurnProps {
  message: Message
  streaming?: boolean
}

/** Group consecutive noise ToolBlocks for collapsed display. */
type RenderItem =
  | { kind: "block"; block: MessageBlock; index: number }
  | { kind: "noise-group"; tools: ToolBlock[] }

function groupBlocks(blocks: MessageBlock[]): RenderItem[] {
  const items: RenderItem[] = []
  let noiseBuffer: ToolBlock[] = []

  function flushNoise() {
    if (noiseBuffer.length === 0) return
    if (noiseBuffer.length === 1) {
      // Single noise tool — render normally, no group
      items.push({ kind: "block", block: noiseBuffer[0], index: -1 })
    } else {
      items.push({ kind: "noise-group", tools: [...noiseBuffer] })
    }
    noiseBuffer = []
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.type === "tool" && block.isNoise) {
      noiseBuffer.push(block)
    } else {
      flushNoise()
      items.push({ kind: "block", block, index: i })
    }
  }
  flushNoise()
  return items
}

function blockStatus(block: MessageBlock): StepStatus {
  if (block.type === "tool") {
    if (block.status === "error") return "failure"
    if (block.status === "pending" || block.status === "running") return "progress"
    if (block.status === "completed") return "success"
  }
  if (block.type === "error") return "failure"
  if (block.type === "thinking" && block.isStreaming) return "progress"
  return "default"
}

export function MessageTurn(props: MessageTurnProps) {
  const blocks = createMemo(() => props.message.blocks ?? [])
  const isEmpty = () => blocks().length === 0
  const renderItems = createMemo(() => groupBlocks(blocks()))

  return (
    <div data-component="oac-assistant-message" class="px-1">
      <Show when={!isEmpty()} fallback={
        <Show when={props.streaming}>
          <div class="oac-timeline">
            <div class="oac-step oac-step--progress">
              <TextShimmer text="Thinking" active class="text-14-regular text-text-weak" style={{ "font-style": "italic" }} />
            </div>
          </div>
        </Show>
      }>
        <div class="oac-timeline">
          <div class="oac-timeline-line" />
          <For each={renderItems()}>
            {(item) => (
              <Switch>
                <Match when={item.kind === "noise-group"}>
                  <ToolGroup tools={(item as { kind: "noise-group"; tools: ToolBlock[] }).tools} />
                </Match>
                <Match when={item.kind === "block"}>
                  {(() => {
                    const block = (item as { kind: "block"; block: MessageBlock; index: number }).block
                    const idx = (item as { kind: "block"; block: MessageBlock; index: number }).index
                    const isLastBlock = () => idx === blocks().length - 1
                    return (
                      <TimelineStep status={blockStatus(block)}>
                        <Switch>
                          <Match when={block.type === "text"}>
                            <TextBlockView
                              block={block as import("../../types").TextBlock}
                              streaming={props.streaming && isLastBlock()}
                            />
                          </Match>
                          <Match when={block.type === "thinking"}>
                            <ThinkingBlockView block={block as import("../../types").ThinkingBlock} />
                          </Match>
                          <Match when={block.type === "tool"}>
                            <ToolBlockView block={block as import("../../types").ToolBlock} />
                          </Match>
                          <Match when={block.type === "plan"}>
                            <PlanBlockView block={block as import("../../types").PlanBlock} />
                          </Match>
                          <Match when={block.type === "error"}>
                            <ErrorBlockView block={block as import("../../types").ErrorBlock} />
                          </Match>
                        </Switch>
                      </TimelineStep>
                    )
                  })()}
                </Match>
              </Switch>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git add src/openacp/components/chat/message-turn.tsx
git commit -m "feat: add MessageTurn with timeline rendering and noise grouping"
```

### Task 13: Create new ChatView and index

**Files:**
- Create: `src/openacp/components/chat/chat-view.tsx`
- Create: `src/openacp/components/chat/index.ts`

- [ ] **Step 1: Write new chat-view.tsx** (copy from old, replace MessageBubble with new components)

```typescript
import { For, Show, createMemo, createSignal, createEffect, on } from "solid-js"
import { useChat } from "../../context/chat"
import { useSessions } from "../../context/sessions"
import { createAutoScroll } from "../../../ui/src/hooks/create-auto-scroll"
import { UserMessage } from "./user-message"
import { MessageTurn } from "./message-turn"

function ChatHeader(props: { onOpenReview?: () => void }) {
  const chat = useChat()
  const sessions = useSessions()

  const session = createMemo(() => {
    const id = chat.activeSession()
    if (!id) return undefined
    return sessions.list().find((s) => s.id === id)
  })

  const title = createMemo(() => session()?.name || "Untitled")

  return (
    <Show when={chat.activeSession()}>
      <div class="flex items-center h-11 px-4 border-b border-border-weaker-base flex-shrink-0">
        <div class="flex-1 min-w-0">
          <span class="text-14-medium text-text-strong truncate block">{title()}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            class="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors"
            title="Review changes"
            onClick={() => props.onOpenReview?.()}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M3.33 4.17h13.34M3.33 8.33h8.34M3.33 12.5h13.34M3.33 16.67h8.34" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
            </svg>
          </button>
          <button
            class="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors"
            title="Context"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>
          <button
            class="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors"
            title="More options"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="4.5" cy="10" r="1.25" fill="currentColor" />
              <circle cx="10" cy="10" r="1.25" fill="currentColor" />
              <circle cx="15.5" cy="10" r="1.25" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </Show>
  )
}

function EmptyState() {
  const chat = useChat()
  const sessions = useSessions()
  const hasSession = () => !!chat.activeSession()
  const [creating, setCreating] = createSignal(false)

  async function handleNewSession() {
    if (creating()) return
    setCreating(true)
    try {
      const session = await sessions.create()
      if (session) {
        chat.setActiveSession(session.id)
      } else {
        const { showToast } = await import("../../../ui/src/components/toast")
        showToast({ description: "Failed to create session. Max sessions may be reached.", variant: "error" })
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div class="h-full flex flex-col items-center justify-center">
      <div class="flex flex-col items-center gap-5">
        <div class="w-10 h-10 rounded-lg bg-surface-raised-base flex items-center justify-center border border-border-weaker-base">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.292 6.04167L16.2503 9.99998L12.292 13.9583M2.91699 9.99998H15.6253M17.0837 3.75V16.25" stroke="currentColor" stroke-linecap="square" class="text-text-weak" />
          </svg>
        </div>
        <div class="text-center">
          <div class="text-14-medium text-text-strong">
            <Show when={hasSession()} fallback="No session selected">
              Ready to chat
            </Show>
          </div>
          <div class="text-13-regular text-text-weak mt-1">
            <Show when={hasSession()} fallback="Create a new session or select one from the sidebar">
              Type a message below to start
            </Show>
          </div>
        </div>
        <Show when={!hasSession()}>
          <button
            class="flex items-center gap-2 px-4 py-2 rounded-lg border border-border-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors active:scale-[0.98] disabled:opacity-50"
            onClick={handleNewSession}
            disabled={creating()}
          >
            <Show when={creating()} fallback={
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M10 4.16699V15.8337M4.16699 10.0003H15.8337" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            }>
              <div class="w-3.5 h-3.5 border-2 rounded-full oac-spinner" style={{ "border-color": "var(--text-weak)", "border-top-color": "transparent" }} />
            </Show>
            <Show when={creating()} fallback="New Session">Creating...</Show>
          </button>
        </Show>
      </div>
    </div>
  )
}

function ScrollToBottomButton(props: { visible: boolean; onClick: () => void }) {
  return (
    <Show when={props.visible}>
      <div class="absolute bottom-4 left-1/2 z-10" style={{ transform: "translateX(-50%)" }}>
        <button
          class="flex items-center justify-center w-8 h-8 rounded-full border border-border-base text-text-base hover:text-text-strong transition-colors active:scale-95"
          style={{ background: "var(--surface-stronger-non-alpha, var(--background-stronger))", "box-shadow": "0 2px 8px rgba(0,0,0,0.15)" }}
          onClick={props.onClick}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M5.83301 8.33366L9.99967 12.5003L14.1663 8.33366" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </Show>
  )
}

export function ChatView(props: { onOpenReview?: () => void }) {
  const chat = useChat()

  const autoScroll = createAutoScroll({
    working: () => chat.streaming(),
    bottomThreshold: 20,
  })

  createEffect(on(() => chat.activeSession(), () => {
    autoScroll.forceScrollToBottom()
  }))

  const hasMessages = () => chat.activeSession() && chat.messages().length > 0

  return (
    <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
      <ChatHeader onOpenReview={props.onOpenReview} />
      <div class="flex-1 min-h-0 overflow-hidden relative">
        <Show when={hasMessages()} fallback={<EmptyState />}>
          <div
            ref={autoScroll.scrollRef}
            class="h-full overflow-y-auto no-scrollbar pt-3"
            onScroll={autoScroll.handleScroll}
          >
            <div
              ref={autoScroll.contentRef}
              class="px-4 md:max-w-200 md:mx-auto 2xl:max-w-[1000px] pb-32 flex flex-col"
              onClick={autoScroll.handleInteraction}
            >
              <For each={chat.messages()}>
                {(msg, index) => {
                  const isLast = () => index() === chat.messages().length - 1
                  const isUser = () => msg.role === "user"
                  return (
                    <>
                      <Show when={index() > 0}>
                        <div style={{ height: isUser() ? "28px" : "14px" }} />
                      </Show>
                      <Show when={isUser()} fallback={
                        <MessageTurn
                          message={msg}
                          streaming={chat.streaming() && isLast() && msg.role === "assistant"}
                        />
                      }>
                        <UserMessage message={msg} />
                      </Show>
                    </>
                  )
                }}
              </For>
            </div>
          </div>
          <ScrollToBottomButton
            visible={autoScroll.userScrolled()}
            onClick={() => autoScroll.resume()}
          />
        </Show>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write index.ts**

```typescript
export { ChatView } from "./chat-view"
export { MessageTurn } from "./message-turn"
export { UserMessage } from "./user-message"
```

- [ ] **Step 3: Commit**

```
git add src/openacp/components/chat/chat-view.tsx src/openacp/components/chat/index.ts
git commit -m "feat: add new ChatView with timeline-based message rendering"
```

---

## Chunk 4: Chat Context Rewrite + Migration

### Task 14: Rewrite chat context to use blocks

**Files:**
- Modify: `src/openacp/context/chat.tsx`

This is the largest task. The context must:
1. Accumulate blocks instead of parts
2. Handle plan events
3. Track thinking duration
4. Build ToolBlock with kind/title/noise resolution
5. Still populate `parts` for backward compatibility during migration

- [ ] **Step 1: Rewrite chat.tsx**

Key changes from current implementation:
- `updateAssistantParts` → `updateAssistantBlocks` (operates on `msg.blocks`)
- `ensureAssistantMessage` creates message with both `parts: []` and `blocks: []`
- Text buffer flushes into TextBlock (blocks array)
- Thought buffer tracks `startTime`, creates ThinkingBlock with `durationMs`
- `tool_call` creates ToolBlock using `resolveKind`, `buildTitle`, `isNoiseTool` from block-utils
- `tool_update` merges into existing ToolBlock
- `plan` event upserts PlanBlock with `validatePlanEntries`
- `error` creates ErrorBlock
- `usage` seals thinking (computes durationMs), clears streaming
- `historyToMessages` maps to blocks
- `stepToBlock` replaces `stepToPart`

Full rewrite: replace the entire file content. The structure is the same as current but with blocks instead of parts. See spec for streaming flow.

Important details:
- `thinkingStartTime` Map tracks per-session start time
- On first "thought" event: `thinkingStartTime.set(sessionID, Date.now())`
- On seal: `durationMs = Date.now() - thinkingStartTime.get(sessionID)`
- `flushBuffers()` must be called before sealing thinking
- `findToolBlock` replaces `findToolPart` — finds by `id` in blocks
- Keep `parts` field populated in parallel for backward compat (review-panel reads it)

- [ ] **Step 2: Verify build**

Run: `npx vite build`

- [ ] **Step 3: Commit**

```
git add src/openacp/context/chat.tsx
git commit -m "feat: rewrite chat context with block-based accumulation and plan events"
```

### Task 15: Update imports across the app

**Files:**
- Modify: files that import from old `chat-view.tsx` or `message.tsx`

- [ ] **Step 1: Find and update all imports of ChatView**

Search for imports of `./chat-view` or `../components/chat-view` and update to `../components/chat` or `./chat`.

The main consumer is `src/openacp/app.tsx` — update the ChatView import:
```typescript
// Old: import { ChatView } from "./components/chat-view"
// New: import { ChatView } from "./components/chat"
```

- [ ] **Step 2: Update review-panel.tsx to support both parts and blocks**

In `review-panel.tsx`, the `fileDiffs` memo iterates `msg.parts` looking for `tool_call` type with `.diff`. Update to also check `msg.blocks` for `ToolBlock` type with `.diffStats`:

```typescript
const fileDiffs = createMemo(() => {
  const diffs = new Map<string, FileDiffData>()
  for (const msg of chat.messages()) {
    if (msg.role !== "assistant") continue
    // Check legacy parts
    for (const part of msg.parts) {
      if (part.type !== "tool_call") continue
      const tool = part as ToolCallPart
      if (!tool.diff?.path) continue
      diffs.set(tool.diff.path, tool.diff)
    }
    // Check new blocks (ToolBlock stores diffStats but not full diff data yet)
    // Full diff data still comes from parts during migration
  }
  return Array.from(diffs.entries()).map(([path, diff]) => ({ path, diff }))
})
```

- [ ] **Step 3: Verify build**

Run: `npx vite build`

- [ ] **Step 4: Commit**

```
git add src/openacp/app.tsx src/openacp/components/review-panel.tsx
git commit -m "feat: update imports to use new chat components"
```

### Task 16: Delete old files and final cleanup

**Files:**
- Delete: `src/openacp/components/message.tsx`
- Delete: `src/openacp/components/chat-view.tsx`

- [ ] **Step 1: Delete old message.tsx and chat-view.tsx**

```bash
rm src/openacp/components/message.tsx
rm src/openacp/components/chat-view.tsx
```

- [ ] **Step 2: Verify build passes with no broken imports**

Run: `npx vite build`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "refactor: remove old message and chat-view components"
```

### Task 17: Final verification

- [ ] **Step 1: Full build check**

Run: `npx vite build`
Expected: SUCCESS with no errors

- [ ] **Step 2: Run the app**

Run: `pnpm tauri dev`
Manual check:
- Send a message, verify timeline dots appear
- Verify thinking block is expandable
- Verify tool calls show IN/OUT table
- Verify plan/todos display if agent sends plan events
- Verify noise tools are grouped

- [ ] **Step 3: Final commit if any fixes needed**

```
git add -A
git commit -m "fix: polish enhanced chat message rendering"
```
