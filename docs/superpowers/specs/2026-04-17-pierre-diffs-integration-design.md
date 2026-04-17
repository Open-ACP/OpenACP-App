# @pierre/diffs Full Integration Design

## Goal

Replace the current `code-viewer.tsx` (manual Shiki + no virtualization) with `@pierre/diffs/react` components to achieve the smooth file viewing, diffing, and search experience from the legacy app.

## Context

- `@pierre/diffs@1.1.10` is already installed in the project
- It has **native React bindings** at `@pierre/diffs/react` (React 18/19 compatible)
- Exports: `File`, `FileDiff`, `MultiFileDiff`, `PatchDiff`, `UnresolvedFile` — all React components
- Exports: `useWorkerPool`, `useFileInstance`, `useFileDiffInstance` — React hooks
- Has built-in: virtualization, worker-based Shiki highlighting (WASM), CSS Highlights API search, shadow DOM isolation
- Legacy app used the base (Solid.js) API; we use the React API directly — no porting needed

## Architecture

```
App startup
  └─ WorkerPoolProvider (context, initialized once)
       ├─ unified pool (poolSize: 2, theme: "OpenACP")
       └─ split pool (poolSize: 2, theme: "OpenACP", lineDiffType: "word-alt")

ReviewPanel
  ├─ Review tab → MultiFileDiff (virtualized multi-file diffs)
  └─ Open Files tab → File (virtualized read-only viewer)
       ├─ Line selection + inline comments
       ├─ Search (CSS Highlights API)
       └─ Worker-based Shiki highlighting (WASM)

FileTreePanel
  └─ Click file → Open in File component
```

## Components

### 1. WorkerPoolProvider (`src/openacp/context/worker-pool.tsx`)

App-level context that creates and provides `WorkerPoolManager` instances.

- Creates 2 pools: unified (lineDiffType: "none") and split (lineDiffType: "word-alt")
- Pool size: 2 workers each (tuned from legacy — balance parallelism vs memory)
- Theme: "OpenACP" (custom registered theme)
- Highlighter: "shiki-wasm" (WASM-based for better performance)
- `useWorkerPool(style: "unified" | "split")` hook for consumers
- Cleanup on unmount

### 2. PierreFile (`src/openacp/components/pierre/pierre-file.tsx`)

Wrapper around `@pierre/diffs/react` `File` component for read-only file viewing.

**Props:**
- `content: string` — file source code
- `language: string` — language identifier
- `filePath: string` — for display and cache key
- `onLineSelected?: (range: SelectedLineRange) => void`
- `onComment?: (range: SelectedLineRange, comment: string) => void`
- `searchQuery?: string` — for search highlighting

**Features:**
- Virtualized rendering (only visible lines in DOM)
- Worker-based syntax highlighting (WASM Shiki via pool)
- Line selection (click, shift+click, drag)
- Inline comment annotations via `renderAnnotation` prop
- Gutter hover utility via `renderGutterUtility` prop
- Content cache integration for instant re-opens

### 3. PierreDiff (`src/openacp/components/pierre/pierre-diff.tsx`)

Wrapper around `FileDiff` for single-file diff viewing.

**Props:**
- `oldContent: string`
- `newContent: string`
- `filePath: string`
- `language: string`
- `style: "unified" | "split"` — diff display mode

**Features:**
- Unified and split diff views
- Word-level diff highlighting (split mode)
- Hunk expand/collapse
- Virtualized rendering
- Worker-based highlighting

### 4. PierreReview (`src/openacp/components/pierre/pierre-review.tsx`)

Wrapper around `MultiFileDiff` for multi-file review sessions.

**Props:**
- `files: { path: string; oldContent: string; newContent: string; language: string }[]`
- `style: "unified" | "split"`
- `onComment?: (filePath: string, range: SelectedLineRange, comment: string) => void`

**Features:**
- Collapsible file sections
- Shared virtualizer across all files
- Per-file inline comments
- Diff stats per file

### 5. PierreSearch (`src/openacp/components/pierre/pierre-search.tsx`)

Search overlay for file viewer, ported from legacy `file-find.ts`.

**Features:**
- CSS Highlights API for match highlighting (fallback to DOM overlay)
- Binary search for fast range location in large files
- Match count display + prev/next navigation
- Cmd+F / Ctrl+F keyboard shortcut
- Passive scroll listeners for position bar
- Case-sensitive / regex toggle

### 6. Content Cache (`src/openacp/lib/content-cache.ts`)

LRU cache for file contents to avoid re-fetching from Rust.

**Config:**
- Max entries: 40
- Max total size: 20MB
- Key: absolute file path
- Value: `{ content: string; language: string; size: number }`
- Eviction: LRU when either limit exceeded

## Theme Integration

Register custom theme mapping project CSS variables to `@pierre/diffs` theme:

```typescript
registerCustomTheme("OpenACP", () => ({
  name: "OpenACP",
  colors: {
    "editor.background": "var(--bg-base)",
    "editor.foreground": "var(--fg-base)",
  },
  tokenColors: [
    // Map from existing --syntax-* CSS variables
    // (same as current code-viewer.tsx theme)
  ]
}))
```

Light/dark mode: automatic via CSS variable switching in `theme.css`. `@pierre/diffs` shadow DOM observes scheme changes via built-in MutationObserver.

## Error Handling

- **Worker crash**: fallback to main-thread Shiki WASM highlighting
- **File too large (>2MB)**: rejected at Rust layer (existing check)
- **Language not supported**: fallback to "text" (plain text)
- **Content cache miss**: fetch from Rust → highlight → cache
- **@pierre/diffs render error**: React ErrorBoundary → fallback plain text view

## Files

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/openacp/context/worker-pool.tsx` | Worker pool context provider |
| Create | `src/openacp/components/pierre/pierre-file.tsx` | Read-only file viewer |
| Create | `src/openacp/components/pierre/pierre-diff.tsx` | Single-file diff viewer |
| Create | `src/openacp/components/pierre/pierre-review.tsx` | Multi-file review |
| Create | `src/openacp/components/pierre/pierre-search.tsx` | Search overlay |
| Create | `src/openacp/lib/content-cache.ts` | LRU content cache |
| Modify | `src/openacp/components/review-panel.tsx` | Swap CodeViewer → Pierre components |
| Modify | `src/openacp/app.tsx` | Wrap with WorkerPoolProvider |
| Modify | `src/openacp/components/file-tree-panel.tsx` | Use content cache |
| Keep | `src/openacp/components/ui/code-viewer.tsx` | Keep for markdown code blocks |

## Performance Expectations

| Metric | Current | After |
|--------|---------|-------|
| Large file (5000 lines) initial render | ~2-3s (blocks main thread) | <200ms (worker + virtual) |
| File scroll (5000 lines) | Janky (all lines in DOM) | Smooth (only visible lines) |
| Re-open cached file | ~500ms (re-fetch + re-highlight) | <50ms (cache hit) |
| Tab switch (files ↔ changes) | ~200ms (already fixed with keep-alive) | Same |
| Diff computation | N/A (basic) | Worker-offloaded, word-level |

## Testing

- **Smoke**: open small file, large file (>1000 lines), binary file (reject)
- **Diff**: create changes in repo, verify unified + split view
- **Search**: Cmd+F, verify match highlighting + prev/next navigation
- **Theme**: switch light/dark, verify syntax colors consistent
- **Performance**: open 5000+ line file, verify smooth scrolling
- **Cache**: open file → close → re-open → verify instant load
- **Worker fallback**: kill worker → verify fallback rendering works
- **Multi-repo**: open files from different repos, verify correct paths
