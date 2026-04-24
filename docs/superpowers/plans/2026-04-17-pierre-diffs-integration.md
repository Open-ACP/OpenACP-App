# @pierre/diffs Full Integration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual Shiki code viewer with `@pierre/diffs/react` components for virtualized, worker-based file viewing, diffing, and search.

**Architecture:** `WorkerPoolContextProvider` at app level provides worker pools. `PierreFile` wraps `@pierre/diffs/react` `File` for read-only viewing. `PierreDiff` wraps `FileDiff` for diffs. Content cache (LRU) eliminates re-fetch on file re-open. Review panel swaps old components for new ones.

**Tech Stack:** `@pierre/diffs@1.1.10` (already installed), `@pierre/diffs/react`, `@pierre/diffs/worker`, React 19, Tauri

---

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/openacp/context/worker-pool.tsx` | WorkerPoolContextProvider setup |
| Create | `src/openacp/lib/content-cache.ts` | LRU content cache |
| Create | `src/openacp/components/pierre/pierre-file.tsx` | File viewer wrapper |
| Create | `src/openacp/components/pierre/pierre-diff.tsx` | Diff viewer wrapper |
| Modify | `src/openacp/components/review-panel.tsx` | Swap CodeViewer/DiffView → Pierre components |
| Modify | `src/openacp/app.tsx` | Wrap with WorkerPoolContextProvider |

---

## Task 1: Worker Pool Context

**Files:**
- Create: `src/openacp/context/worker-pool.tsx`

- [ ] **Step 1: Create worker pool context provider**

```typescript
import { WorkerPoolContextProvider } from "@pierre/diffs/react"
import { registerCustomTheme, type ThemeRegistrationResolved } from "@pierre/diffs"

const THEME_NAME = "OpenACP"
let themeRegistered = false

function ensureTheme() {
  if (themeRegistered) return
  themeRegistered = true
  registerCustomTheme(THEME_NAME, () =>
    Promise.resolve({
      name: THEME_NAME,
      colors: {
        "editor.background": "var(--bg-base)",
        "editor.foreground": "var(--fg-weak)",
      },
      tokenColors: [
        { scope: ["comment", "punctuation.definition.comment", "string.comment"], settings: { foreground: "var(--syntax-comment)" } },
        { scope: ["entity.other.attribute-name"], settings: { foreground: "var(--syntax-property)" } },
        { scope: ["constant", "entity.name.constant", "variable.other.constant", "variable.language", "entity"], settings: { foreground: "var(--syntax-constant)" } },
        { scope: ["entity.name", "meta.export.default", "meta.definition.variable"], settings: { foreground: "var(--syntax-type)" } },
        { scope: ["meta.object.member"], settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["variable.parameter.function", "meta.jsx.children", "meta.block", "meta.tag.attributes", "entity.name.constant", "meta.embedded.expression", "meta.template.expression", "string.other.begin.yaml", "string.other.end.yaml"], settings: { foreground: "var(--syntax-punctuation)" } },
        { scope: ["entity.name.function", "support.type.primitive"], settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["support.class.component"], settings: { foreground: "var(--syntax-type)" } },
        { scope: "keyword", settings: { foreground: "var(--syntax-keyword)" } },
        { scope: ["keyword.operator", "storage.type.function.arrow", "punctuation.separator.key-value.css", "entity.name.tag.yaml", "punctuation.separator.key-value.mapping.yaml"], settings: { foreground: "var(--syntax-operator)" } },
        { scope: ["storage", "storage.type"], settings: { foreground: "var(--syntax-keyword)" } },
        { scope: ["storage.modifier.package", "storage.modifier.import", "storage.type.java"], settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["string", "punctuation.definition.string", "string punctuation.section.embedded source", "entity.name.tag"], settings: { foreground: "var(--syntax-string)" } },
        { scope: "support", settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["support.type.object.module", "variable.other.object", "support.type.property-name.css"], settings: { foreground: "var(--syntax-object)" } },
        { scope: "meta.property-name", settings: { foreground: "var(--syntax-property)" } },
        { scope: "variable", settings: { foreground: "var(--syntax-variable)" } },
        { scope: "variable.other", settings: { foreground: "var(--syntax-variable)" } },
      ],
      semanticTokenColors: {},
    } as unknown as ThemeRegistrationResolved),
  )
}

export function PierreWorkerPoolProvider({ children }: { children: React.ReactNode }) {
  ensureTheme()

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: () => {
          const url = new URL("@pierre/diffs/worker/worker.js", import.meta.url)
          return new Worker(url, { type: "module" })
        },
        poolSize: 2,
      }}
      highlighterOptions={{
        theme: THEME_NAME,
        preferredHighlighter: "shiki-wasm",
      }}
    >
      {children}
    </WorkerPoolContextProvider>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep worker-pool`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/openacp/context/worker-pool.tsx
git commit -m "feat: add PierreWorkerPoolProvider for worker-based syntax highlighting"
```

---

## Task 2: Content Cache

**Files:**
- Create: `src/openacp/lib/content-cache.ts`

- [ ] **Step 1: Create LRU content cache**

```typescript
interface CacheEntry {
  content: string
  language: string
  size: number
}

const MAX_ENTRIES = 40
const MAX_TOTAL_BYTES = 20 * 1024 * 1024 // 20MB

const cache = new Map<string, CacheEntry>()
let totalBytes = 0

function evictOldest() {
  const first = cache.keys().next()
  if (first.done) return
  const entry = cache.get(first.value)!
  totalBytes -= entry.size
  cache.delete(first.value)
}

export function getContent(path: string): CacheEntry | undefined {
  const entry = cache.get(path)
  if (!entry) return undefined
  // Move to end (most recently used)
  cache.delete(path)
  cache.set(path, entry)
  return entry
}

export function setContent(path: string, content: string, language: string): void {
  const size = new Blob([content]).size
  // Remove existing entry if updating
  const existing = cache.get(path)
  if (existing) {
    totalBytes -= existing.size
    cache.delete(path)
  }
  // Evict until within limits
  while (cache.size >= MAX_ENTRIES || (totalBytes + size > MAX_TOTAL_BYTES && cache.size > 0)) {
    evictOldest()
  }
  cache.set(path, { content, language, size })
  totalBytes += size
}

export function removeContent(path: string): void {
  const entry = cache.get(path)
  if (entry) {
    totalBytes -= entry.size
    cache.delete(path)
  }
}

export function clearCache(): void {
  cache.clear()
  totalBytes = 0
}
```

- [ ] **Step 2: Commit**

```bash
git add src/openacp/lib/content-cache.ts
git commit -m "feat: add LRU content cache for file viewer (40 entries, 20MB)"
```

---

## Task 3: PierreFile Component

**Files:**
- Create: `src/openacp/components/pierre/pierre-file.tsx`

- [ ] **Step 1: Create PierreFile wrapper**

```typescript
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { File } from "@pierre/diffs/react"
import { Plus } from "@phosphor-icons/react"
import type { FileContents, SelectedLineRange, LineAnnotation, GetHoveredLineResult } from "@pierre/diffs"
import { Button } from "../ui/button"

interface CommentAnnotation {
  lineNumber: number
  startLine: number
  endLine: number
}

interface PierreFileProps {
  content: string
  language: string
  filePath: string
  onComment?: (comment: string, code: string, lines: [number, number], file?: string) => void
}

export function PierreFile({ content, language, filePath, onComment }: PierreFileProps) {
  const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(null)
  const [commenting, setCommenting] = useState(false)
  const [commentText, setCommentText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const file: FileContents = useMemo(() => ({
    name: filePath,
    contents: content,
    lang: language === "text" ? undefined : language,
  }), [filePath, content, language])

  const annotations = useMemo<LineAnnotation<CommentAnnotation>[]>(() => {
    if (!commenting || !selectedLines) return []
    return [{
      lineNumber: selectedLines.end,
      metadata: {
        lineNumber: selectedLines.end,
        startLine: selectedLines.start,
        endLine: selectedLines.end,
      },
    }]
  }, [commenting, selectedLines])

  const handleLineSelected = useCallback((range: SelectedLineRange | null) => {
    setSelectedLines(range)
    if (range) setCommenting(false)
  }, [])

  const handleSubmitComment = useCallback(() => {
    if (!commentText.trim() || !selectedLines) return
    const lines = content.split("\n")
    const code = lines.slice(selectedLines.start - 1, selectedLines.end).join("\n")
    onComment?.(commentText.trim(), code, [selectedLines.start, selectedLines.end], filePath)
    setCommentText("")
    setCommenting(false)
    setSelectedLines(null)
  }, [commentText, selectedLines, content, filePath, onComment])

  useEffect(() => {
    if (commenting) textareaRef.current?.focus()
  }, [commenting])

  const renderAnnotation = useCallback((annotation: LineAnnotation<CommentAnnotation>) => {
    return (
      <div className="mx-3 my-1.5 rounded-lg border border-border bg-card p-3">
        <textarea
          ref={textareaRef}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-y min-h-[60px] max-h-[120px] focus:outline-none"
          placeholder="Add comment"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmitComment()
            if (e.key === "Escape") {
              setCommenting(false)
              setSelectedLines(null)
            }
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {annotation.metadata?.startLine !== annotation.metadata?.endLine
              ? `Lines ${annotation.metadata?.startLine}-${annotation.metadata?.endLine}`
              : `Line ${annotation.metadata?.lineNumber}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setCommenting(false); setSelectedLines(null) }}>Cancel</Button>
            <Button size="sm" disabled={!commentText.trim()} onClick={handleSubmitComment}>Comment</Button>
          </div>
        </div>
      </div>
    )
  }, [commentText, handleSubmitComment])

  const renderGutterUtility = useCallback((getHoveredLine: () => GetHoveredLineResult<"file"> | undefined) => {
    if (!onComment || commenting) return null
    const hovered = getHoveredLine()
    if (!hovered) return null

    return (
      <button
        className="size-4 flex items-center justify-center rounded-full bg-foreground text-background hover:bg-foreground/80 transition-colors"
        onClick={() => {
          if (!selectedLines) {
            setSelectedLines({ start: hovered.lineNumber, end: hovered.lineNumber })
          }
          setCommenting(true)
        }}
      >
        <Plus size={10} weight="bold" />
      </button>
    )
  }, [onComment, commenting, selectedLines])

  return (
    <File
      file={file}
      selectedLines={selectedLines}
      lineAnnotations={annotations}
      renderAnnotation={renderAnnotation}
      renderGutterUtility={onComment ? renderGutterUtility : undefined}
      options={{
        enableLineSelection: true,
        onLineSelected: handleLineSelected,
      }}
      metrics={{
        lineHeight: 20,
        hunkSeparatorHeight: 24,
        hunkLineCount: 0,
        diffHeaderHeight: 0,
        fileGap: 0,
      }}
      className="h-full w-full select-text"
      style={{ fontSize: "12px" }}
    />
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep pierre`
Expected: No errors (some may need type adjustments based on exact API)

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/pierre/pierre-file.tsx
git commit -m "feat: add PierreFile component with virtualized viewing and inline comments"
```

---

## Task 4: PierreDiff Component

**Files:**
- Create: `src/openacp/components/pierre/pierre-diff.tsx`

- [ ] **Step 1: Create PierreDiff wrapper**

```typescript
import React, { useMemo } from "react"
import { MultiFileDiff } from "@pierre/diffs/react"
import type { FileContents } from "@pierre/diffs"

interface PierreDiffProps {
  oldContent: string
  newContent: string
  filePath: string
  language?: string
  style?: "unified" | "split"
}

export function PierreDiff({ oldContent, newContent, filePath, language, style = "unified" }: PierreDiffProps) {
  const oldFile: FileContents = useMemo(() => ({
    name: filePath,
    contents: oldContent,
    lang: language,
  }), [filePath, oldContent, language])

  const newFile: FileContents = useMemo(() => ({
    name: filePath,
    contents: newContent,
    lang: language,
  }), [filePath, newContent, language])

  return (
    <MultiFileDiff
      oldFile={oldFile}
      newFile={newFile}
      options={{
        diffStyle: style,
      }}
      metrics={{
        lineHeight: 20,
        hunkSeparatorHeight: 24,
        hunkLineCount: 0,
        diffHeaderHeight: 0,
        fileGap: 0,
      }}
      className="w-full select-text"
      style={{ fontSize: "12px" }}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/openacp/components/pierre/pierre-diff.tsx
git commit -m "feat: add PierreDiff component for virtualized diff viewing"
```

---

## Task 5: Integrate into App & Review Panel

**Files:**
- Modify: `src/openacp/app.tsx`
- Modify: `src/openacp/components/review-panel.tsx`

- [ ] **Step 1: Wrap app with WorkerPoolProvider**

In `src/openacp/app.tsx`, import and wrap the main app content:

```typescript
import { PierreWorkerPoolProvider } from "./context/worker-pool"

// Wrap the main content (inside WorkspaceProvider or at app root):
<PierreWorkerPoolProvider>
  {/* existing app content */}
</PierreWorkerPoolProvider>
```

Find the appropriate wrapper location — should be high enough to cover ReviewPanel and any file viewing.

- [ ] **Step 2: Update ReviewPanel — replace CodeViewer with PierreFile**

In `src/openacp/components/review-panel.tsx`:

Replace import:
```typescript
// Remove: import { CodeViewer } from "./ui/code-viewer"
import { PierreFile } from "./pierre/pierre-file"
```

Replace the open file rendering section (around line 359-368):
```typescript
{/* Open file tab content */}
{activeView !== "review" && currentFile && (
  <div className="flex-1 min-h-0">
    <PierreFile
      content={currentFile.content}
      language={currentFile.language}
      filePath={currentFile.path}
      onComment={handleCodeComment}
    />
  </div>
)}
```

- [ ] **Step 3: Update ReviewPanel — replace DiffView with PierreDiff**

Replace import:
```typescript
// Remove: import { computeDiffLines, type DiffLine } from "./chat/diff-utils"
import { PierreDiff } from "./pierre/pierre-diff"
```

Replace the diff rendering in the review tab (around line 345-349):
```typescript
{isExpanded && (
  <PierreDiff
    oldContent={diff.before ?? ""}
    newContent={diff.after}
    filePath={path}
  />
)}
```

Remove the old `DiffView`, `DiffStats` components and `computeDiffLines` import (they are now unused in this file — but keep `diff-utils.ts` as it may be used elsewhere).

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "review-panel|app\.tsx"`
Expected: No errors

- [ ] **Step 5: Build test**

Run: `npm run build 2>&1 | tail -5`
Expected: Build success

- [ ] **Step 6: Commit**

```bash
git add src/openacp/app.tsx src/openacp/components/review-panel.tsx
git commit -m "feat: integrate @pierre/diffs into review panel — virtualized viewer + diffs"
```

---

## Task 6: Content Cache Integration

**Files:**
- Modify: `src/openacp/components/file-tree-panel.tsx`
- Modify: `src/openacp/app.tsx`

- [ ] **Step 1: Use content cache in file open flow**

In `src/openacp/app.tsx` (or wherever `handleOpenFile` lives), integrate the cache:

```typescript
import { getContent, setContent } from "./lib/content-cache"

// In handleOpenFile callback:
async function handleOpenFile(path: string, content: string, language: string) {
  setContent(path, content, language)
  // ... existing logic to add to openFiles state
}
```

In `FileTreePanel`, check cache before fetching:

```typescript
import { getContent, setContent } from "../lib/content-cache"

const handleOpenFile = useCallback(async (path: string) => {
  const cached = getContent(path)
  if (cached) {
    onOpenFile(path, cached.content, cached.language)
    return
  }
  try {
    const result = await invoke<{ content: string; language: string }>("read_file_content", { path })
    setContent(path, result.content, result.language)
    onOpenFile(path, result.content, result.language)
  } catch (e) {
    console.error("[file-tree] failed to read file:", e)
  }
}, [onOpenFile])
```

- [ ] **Step 2: Commit**

```bash
git add src/openacp/app.tsx src/openacp/components/file-tree-panel.tsx src/openacp/lib/content-cache.ts
git commit -m "feat: add content cache for instant file re-opens"
```

---

## Task 7: Full Build & Verify

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 2: Full build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build success

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix: adjustments from pierre/diffs integration testing"
```
