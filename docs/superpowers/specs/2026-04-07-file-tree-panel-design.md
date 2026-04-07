# Design: File Tree Panel

**Date:** 2026-04-07
**Scope:** OpenACP Desktop App — new panel for browsing workspace files

---

## Overview

A toggleable panel on the right side of the app that displays the workspace directory tree. Users can browse all files or view git changes. Clicking a file opens it as a tab in the ReviewPanel for reading.

---

## 1. Layout

```
Titlebar [Sidebar] -------- [Review] [FileTree]
├── SidebarRail
├── SidebarPanel (collapsible)
├── ChatArea (flex-1)
├── ReviewPanel (toggle, resizable, animated)
└── FileTreePanel (toggle, resizable, animated)
```

- Both ReviewPanel and FileTreePanel have independent toggle state and resize handles
- When both open: `ChatArea | ReviewPanel | FileTreePanel`
- Each panel animates in/out with `AnimatePresence` (width 0 → auto)
- FileTreePanel: default 280px, min 200px, max 480px

---

## 2. FileTreePanel Component

**Location:** `src/openacp/components/file-tree-panel.tsx`

**Structure:**
- Header: title "Files" + mode toggle ("All files" / "Changes")
- Body: recursive tree view (All files mode) or flat list (Changes mode)
- ResizeHandle on left edge

**Props:**
```ts
interface FileTreePanelProps {
  workspacePath: string
  onOpenFile: (path: string, content: string) => void
  onClose: () => void
}
```

---

## 3. Data Source

### Local Workspaces — Tauri Commands

**New Rust commands in `src-tauri/src/core/filesystem/`:**

```rust
#[tauri::command]
fn read_directory(path: String) -> Result<Vec<FileNode>, String>
// Reads one level of directory. Respects .gitignore via `ignore` crate.
// Returns sorted: directories first, then files, alphabetical.

#[tauri::command]
fn read_file_content(path: String) -> Result<FileContent, String>
// Reads file content as string. Returns error for binary files.
```

**Types:**
```ts
interface FileNode {
  name: string
  path: string          // absolute path
  type: "file" | "directory"
}

interface FileContent {
  content: string
  language: string      // inferred from extension
}
```

### Changes Mode

Uses existing `get_git_status` Tauri command (already in codebase) or `get_git_branches`. Alternatively, a new command:

```rust
#[tauri::command]
fn get_workspace_changes(path: String) -> Result<Vec<FileChange>, String>
// Runs `git status --porcelain` in workspace directory
```

```ts
interface FileChange {
  path: string
  status: "modified" | "added" | "deleted" | "untracked"
}
```

---

## 4. Tree View Component

**Location:** `src/openacp/components/file-tree/`

### TreeNode Component
- Directory: folder icon + name, click to expand/collapse, lazy-loads children
- File: file icon + name, click to open in ReviewPanel
- Indent with depth-based padding
- Expanded state stored locally per-node

### Icons
- `@phosphor-icons/react`: `Folder`, `FolderOpen`, `File`, `FileTs`, `FileCss`, etc.
- Or simpler: `CaretRight` (collapsed) / `CaretDown` (expanded) + `Folder`/`File`

---

## 5. ReviewPanel Tab Integration

ReviewPanel currently shows diff tabs from chat tool calls. Extend to support file content tabs:

**Tab types:**
```ts
type ReviewTab =
  | { type: "diff"; path: string; diff: FileDiff }       // existing
  | { type: "file"; path: string; content: string }       // new
```

**Changes to ReviewPanel:**
- Accept `openFiles` prop: list of file tabs opened from file tree
- Render file content with syntax highlighting (reuse Markdown code block renderer or add simple highlighter)
- Tab close button (x) on each tab
- Active tab state

---

## 6. Titlebar Wiring

Existing FolderOpen button → wire to `fileTreeOpen` state in `app.tsx`:
- Add `fileTreeOpen` / `setFileTreeOpen` state
- Pass to Titlebar as `fileTreeOpen` + `onToggleFileTree`
- Add active class on button when open
- Render FileTreePanel in ChatWithPermissions alongside ReviewPanel

---

## 7. State Flow

```
User clicks FolderOpen in titlebar
  → fileTreeOpen = true
  → FileTreePanel renders with workspacePath from workspace context
  → Panel loads root directory via Tauri read_directory
  → User expands folders (lazy load children)
  → User clicks file
  → Tauri read_file_content(path)
  → onOpenFile callback → adds tab to ReviewPanel
  → ReviewPanel opens (if not already) with file content tab
```

---

## 8. Files to Create/Modify

**New — Frontend:**
- `src/openacp/components/file-tree-panel.tsx` — main panel
- `src/openacp/components/file-tree/tree-node.tsx` — recursive tree node
- `src/openacp/components/file-tree/file-icon.tsx` — file type icons

**New — Rust:**
- `src-tauri/src/core/filesystem/commands.rs` — add `read_directory`, `read_file_content`, `get_workspace_changes`

**Modified:**
- `src/openacp/app.tsx` — add fileTreeOpen state, render FileTreePanel
- `src/openacp/components/titlebar.tsx` — wire FolderOpen button
- `src/openacp/components/review-panel.tsx` — support file content tabs
- `src-tauri/src/lib.rs` — register new Tauri commands

---

## 9. Edge Cases

| Scenario | Handling |
|----------|----------|
| Very large directory | Lazy-load only expanded dirs, cap at reasonable depth |
| Binary files | Show "Binary file" placeholder, don't load content |
| File too large (>1MB) | Show warning, truncate or skip |
| No git repo | Changes tab shows "Not a git repository" |
| Permission denied | Skip file/dir, don't crash |
| Remote workspace | Disable file tree (future: server API) |
| Workspace path empty | Show empty state "No workspace selected" |
