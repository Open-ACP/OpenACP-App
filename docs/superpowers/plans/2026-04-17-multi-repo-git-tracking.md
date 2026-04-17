# Multi-Repo Git Tracking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a workspace folder contains multiple git repos (no `.git` at root), auto-discover sub-repos and show per-repo branches in the composer + grouped changes in the files panel.

**Architecture:** Add a `discover_git_repos` Rust command that scans 2 levels deep for `.git` dirs. Create a `useGitRepos` hook that auto-detects single vs multi-repo mode. Upgrade `BranchIndicator` to show a multi-repo dropdown and `FileTreePanel` to group changes by repo.

**Tech Stack:** Rust (Tauri commands), React (hooks, context), shadcn/ui (DropdownMenu), Phosphor Icons

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src-tauri/src/core/filesystem/commands.rs` | Add `GitRepoInfo` struct + `discover_git_repos` command |
| Modify | `src-tauri/src/lib.rs` | Register new command |
| Create | `src/openacp/hooks/use-git-repos.ts` | Hook: discover repos, detect mode, poll branches |
| Modify | `src/openacp/components/branch-indicator.tsx` | Multi-repo dropdown UI |
| Modify | `src/openacp/components/file-tree-panel.tsx` | Grouped changes view |
| Modify | `src/openacp/components/chat/chat-view.tsx` | Update EmptyState to use hook |

---

## Chunk 1: Backend — `discover_git_repos` Command

### Task 1: Add `GitRepoInfo` struct and `discover_git_repos` command

**Files:**
- Modify: `src-tauri/src/core/filesystem/commands.rs:6-13` (add struct near other structs)
- Modify: `src-tauri/src/core/filesystem/commands.rs` (add command at end)
- Modify: `src-tauri/src/lib.rs:113` (register command)

- [ ] **Step 1: Add `GitRepoInfo` struct to `commands.rs`**

Add after line 25 (after `FileChange` struct):

```rust
#[derive(Clone, serde::Serialize)]
pub struct GitRepoInfo {
    pub name: String,
    pub path: String,
    pub branch: String,
}
```

- [ ] **Step 2: Add `discover_git_repos` command to `commands.rs`**

Add before `path_exists` (around line 332):

```rust
/// Discover git repositories within a workspace directory.
/// If the directory itself is a git repo, returns just that one.
/// Otherwise scans up to 2 levels deep for directories containing .git.
#[tauri::command]
pub fn discover_git_repos(directory: String) -> Vec<GitRepoInfo> {
    let root = Path::new(&directory);

    // If root itself is a git repo, return just it
    if root.join(".git").exists() {
        let name = root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| directory.clone());
        let branch = get_git_branch(directory.clone()).unwrap_or_default();
        return vec![GitRepoInfo {
            name,
            path: directory,
            branch,
        }];
    }

    let mut repos = Vec::new();

    // Scan 2 levels deep
    let Ok(level1) = std::fs::read_dir(root) else {
        return repos;
    };

    for entry1 in level1.flatten() {
        if !entry1.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let name1 = entry1.file_name().to_string_lossy().to_string();
        if name1.starts_with('.') || name1 == "node_modules" || name1 == "target" {
            continue;
        }

        let path1 = entry1.path();
        if path1.join(".git").exists() {
            let branch = get_git_branch(path1.to_string_lossy().to_string())
                .unwrap_or_default();
            repos.push(GitRepoInfo {
                name: name1,
                path: path1.to_string_lossy().to_string(),
                branch,
            });
            continue;
        }

        // Level 2
        let Ok(level2) = std::fs::read_dir(&path1) else {
            continue;
        };
        for entry2 in level2.flatten() {
            if !entry2.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let name2 = entry2.file_name().to_string_lossy().to_string();
            if name2.starts_with('.') {
                continue;
            }
            let path2 = entry2.path();
            if path2.join(".git").exists() {
                let branch = get_git_branch(path2.to_string_lossy().to_string())
                    .unwrap_or_default();
                repos.push(GitRepoInfo {
                    name: format!("{name1}/{name2}"),
                    path: path2.to_string_lossy().to_string(),
                    branch,
                });
            }
        }
    }

    repos.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    repos
}
```

- [ ] **Step 3: Register `discover_git_repos` in `lib.rs`**

Add after `get_workspace_changes` in the `generate_handler!` macro (line 113):

```rust
core::filesystem::commands::discover_git_repos,
```

- [ ] **Step 4: Build to verify compilation**

Run: `cd /Users/liam/Data/Projects/OpenACP-App && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/core/filesystem/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add discover_git_repos Tauri command for multi-repo workspaces"
```

---

## Chunk 2: Frontend — `useGitRepos` Hook

### Task 2: Create the `useGitRepos` hook

**Files:**
- Create: `src/openacp/hooks/use-git-repos.ts`

This hook encapsulates all multi-repo detection logic so both `BranchIndicator` and `FileTreePanel` share the same state.

- [ ] **Step 1: Create `src/openacp/hooks/use-git-repos.ts`**

```typescript
import { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"

export interface GitRepoInfo {
  name: string
  path: string
  branch: string
}

export type GitMode = "single" | "multi" | "none"

const POLL_INTERVAL = 5000

export function useGitRepos(directory: string) {
  const [mode, setMode] = useState<GitMode>("none")
  const [repos, setRepos] = useState<GitRepoInfo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    invoke<GitRepoInfo[]>("discover_git_repos", { directory })
      .then((result) => {
        if (result.length === 0) {
          setMode("none")
          setRepos([])
        } else if (result.length === 1 && result[0].path === directory) {
          setMode("single")
          setRepos(result)
        } else {
          setMode("multi")
          setRepos(result)
        }
      })
      .catch(() => {
        setMode("none")
        setRepos([])
      })
      .finally(() => setLoading(false))
  }, [directory])

  // Initial load + polling
  useEffect(() => {
    setLoading(true)
    refresh()
    const timer = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [refresh])

  return { mode, repos, loading, refresh }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd /Users/liam/Data/Projects/OpenACP-App && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `use-git-repos.ts`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/hooks/use-git-repos.ts
git commit -m "feat: add useGitRepos hook for multi-repo workspace detection"
```

---

## Chunk 3: Frontend — Multi-repo `BranchIndicator`

### Task 3: Upgrade BranchIndicator to support multi-repo

**Files:**
- Modify: `src/openacp/components/branch-indicator.tsx`

Replace the entire component. In single-repo mode, behavior is identical to current. In multi-repo mode, shows repo count with expandable dropdown listing all repos and their branches.

- [ ] **Step 1: Rewrite `branch-indicator.tsx`**

```typescript
import { useState, useCallback } from "react"
import {
  GitBranch,
  Copy,
  Check,
  CaretRight,
  CaretDown,
  FolderSimple,
} from "@phosphor-icons/react"
import { invoke } from "@tauri-apps/api/core"
import { useWorkspace } from "../context/workspace"
import { useGitRepos, type GitRepoInfo } from "../hooks/use-git-repos"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

export function BranchIndicator() {
  const workspace = useWorkspace()
  const { mode, repos } = useGitRepos(workspace.directory)

  if (mode === "none" || repos.length === 0) return null

  if (mode === "single") {
    return <SingleRepoBranch directory={workspace.directory} branch={repos[0].branch} />
  }

  return <MultiRepoBranch repos={repos} />
}

/* ── Single-repo (unchanged behavior) ──────────────────────────────── */

function SingleRepoBranch({ directory, branch: initialBranch }: { directory: string; branch: string }) {
  const [branch, setBranch] = useState(initialBranch)
  const [branches, setBranches] = useState<string[]>([])
  const [copiedBranch, setCopiedBranch] = useState<string | null>(null)

  // Keep branch in sync via polling from parent hook — but also fetch on dropdown open
  const fetchBranches = useCallback(() => {
    invoke<string[]>("get_git_branches", { directory })
      .then(setBranches)
      .catch(() => setBranches([]))
    invoke<string | null>("get_git_branch", { directory })
      .then((b) => b && setBranch(b))
      .catch(() => {})
  }, [directory])

  function copyBranch(name: string) {
    navigator.clipboard.writeText(name)
    setCopiedBranch(name)
    setTimeout(() => setCopiedBranch(null), 1500)
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) fetchBranches() }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 max-w-[160px] text-sm-regular text-fg-weak gap-1 px-2"
          title={`Branch: ${branch}`}
        >
          <GitBranch size={14} weight="bold" className="shrink-0" />
          <span className="truncate">{branch}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={4} className="w-64">
        <DropdownMenuLabel className="text-fg-weakest" style={{ fontSize: "10px", lineHeight: "1.4", letterSpacing: "0.02em" }}>
          Local Branches
        </DropdownMenuLabel>
        <div className="max-h-[260px] overflow-y-auto no-scrollbar">
          {branches.map((b) => (
            <div
              key={b}
              className="flex items-center gap-2 px-2 py-1.5 text-sm-regular rounded-sm"
            >
              <GitBranch size={12} weight={b === branch ? "bold" : "regular"} className="shrink-0" />
              <span className={`flex-1 truncate ${b === branch ? "text-foreground font-medium" : "text-fg-weak"}`}>
                {b}
              </span>
              <button
                type="button"
                className="shrink-0 flex items-center justify-center size-5 rounded hover:bg-accent transition-colors"
                onClick={() => copyBranch(b)}
                title="Copy branch name"
              >
                {copiedBranch === b ? (
                  <Check size={12} className="text-green-500" />
                ) : (
                  <Copy size={12} className="text-fg-weakest" />
                )}
              </button>
            </div>
          ))}
          {branches.length === 0 && (
            <div className="px-2 py-1.5 text-sm-regular text-muted-foreground">No branches found</div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ── Multi-repo dropdown ───────────────────────────────────────────── */

function MultiRepoBranch({ repos }: { repos: GitRepoInfo[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [repoBranches, setRepoBranches] = useState<Record<string, string[]>>({})
  const [copiedBranch, setCopiedBranch] = useState<string | null>(null)

  function toggleExpand(repoPath: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(repoPath)) {
        next.delete(repoPath)
      } else {
        next.add(repoPath)
        // Fetch branches for this repo if not already loaded
        if (!repoBranches[repoPath]) {
          invoke<string[]>("get_git_branches", { directory: repoPath })
            .then((branches) => {
              setRepoBranches((prev) => ({ ...prev, [repoPath]: branches }))
            })
            .catch(() => {})
        }
      }
      return next
    })
  }

  function copyBranch(name: string) {
    navigator.clipboard.writeText(name)
    setCopiedBranch(name)
    setTimeout(() => setCopiedBranch(null), 1500)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 max-w-[180px] text-sm-regular text-fg-weak gap-1 px-2"
          title={`${repos.length} repositories`}
        >
          <GitBranch size={14} weight="bold" className="shrink-0" />
          <span className="truncate">{repos.length} repositories</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={4} className="w-72">
        <DropdownMenuLabel className="text-fg-weakest" style={{ fontSize: "10px", lineHeight: "1.4", letterSpacing: "0.02em" }}>
          Repositories
        </DropdownMenuLabel>
        <div className="max-h-[320px] overflow-y-auto no-scrollbar">
          {repos.map((repo) => {
            const isExpanded = expanded.has(repo.path)
            const branches = repoBranches[repo.path] ?? []

            return (
              <div key={repo.path} className="py-0.5">
                {/* Repo header */}
                <button
                  type="button"
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-sm hover:bg-accent transition-colors"
                  onClick={() => toggleExpand(repo.path)}
                >
                  {isExpanded ? (
                    <CaretDown size={10} className="shrink-0 text-fg-weakest" />
                  ) : (
                    <CaretRight size={10} className="shrink-0 text-fg-weakest" />
                  )}
                  <FolderSimple size={12} weight="fill" className="shrink-0 text-fg-weaker" />
                  <span className="text-xs text-fg-weaker truncate">{repo.name}</span>
                  <span className="flex-1" />
                  <span className="text-sm-regular text-fg-weak truncate max-w-[120px]">{repo.branch}</span>
                  <button
                    type="button"
                    className="shrink-0 flex items-center justify-center size-5 rounded hover:bg-accent transition-colors"
                    onClick={(e) => { e.stopPropagation(); copyBranch(repo.branch) }}
                    title="Copy branch name"
                  >
                    {copiedBranch === repo.branch ? (
                      <Check size={12} className="text-green-500" />
                    ) : (
                      <Copy size={12} className="text-fg-weakest" />
                    )}
                  </button>
                </button>

                {/* Expanded branch list */}
                {isExpanded && (
                  <div className="ml-4 border-l border-border-weakest pl-2">
                    {branches.length === 0 ? (
                      <div className="px-2 py-1 text-xs text-fg-weakest">Loading...</div>
                    ) : (
                      branches.map((b) => (
                        <div
                          key={b}
                          className="flex items-center gap-2 px-2 py-1 rounded-sm"
                        >
                          <GitBranch size={10} weight={b === repo.branch ? "bold" : "regular"} className="shrink-0" />
                          {b === repo.branch && (
                            <span className="size-1.5 rounded-full bg-color-success shrink-0" />
                          )}
                          <span className={`flex-1 truncate text-xs ${b === repo.branch ? "text-fg-base font-medium" : "text-fg-weak"}`}>
                            {b}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 flex items-center justify-center size-4 rounded hover:bg-accent transition-colors"
                            onClick={() => copyBranch(b)}
                            title="Copy branch name"
                          >
                            {copiedBranch === b ? (
                              <Check size={10} className="text-green-500" />
                            ) : (
                              <Copy size={10} className="text-fg-weakest" />
                            )}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Visual test — single repo workspace**

Open a workspace that is a single git repo. Verify:
- Branch indicator looks identical to before
- Dropdown still shows branches with copy buttons

- [ ] **Step 4: Visual test — multi-repo workspace**

Open a workspace folder containing multiple git repos. Verify:
- Button shows "N repositories"
- Dropdown lists all repos with their current branch
- Clicking chevron expands to show all branches
- Copy button works

- [ ] **Step 5: Commit**

```bash
git add src/openacp/components/branch-indicator.tsx
git commit -m "feat: multi-repo branch indicator with expandable dropdown"
```

---

## Chunk 4: Frontend — Grouped Changes in Files Panel

### Task 4: Upgrade FileTreePanel changes view for multi-repo

**Files:**
- Modify: `src/openacp/components/file-tree-panel.tsx`

In multi-repo mode, the changes tab fetches `get_workspace_changes` for each discovered repo and groups results with collapsible repo headers.

- [ ] **Step 1: Update `file-tree-panel.tsx`**

Add imports at top:

```typescript
import { CaretRight, CaretDown, FolderSimple } from "@phosphor-icons/react"
import { useGitRepos, type GitRepoInfo } from "../hooks/use-git-repos"
```

Add interface for grouped changes:

```typescript
interface RepoChanges {
  repo: GitRepoInfo
  changes: FileChange[]
}
```

- [ ] **Step 2: Add multi-repo changes fetching logic**

Replace the existing `useEffect` that fetches changes (lines 45-58) with logic that handles both modes:

```typescript
const { mode: gitMode, repos: gitRepos } = useGitRepos(workspacePath)

useEffect(() => {
  if (!workspacePath) return
  setLoading(true)
  if (mode === "files") {
    invoke<FileNode[]>("read_directory", { path: workspacePath })
      .then(setRootNodes)
      .catch(() => setRootNodes([]))
      .finally(() => setLoading(false))
  } else if (gitMode === "multi" && gitRepos.length > 1) {
    // Multi-repo: fetch changes for each repo
    Promise.all(
      gitRepos.map((repo) =>
        invoke<FileChange[]>("get_workspace_changes", { path: repo.path })
          .then((changes) => ({ repo, changes }))
          .catch(() => ({ repo, changes: [] as FileChange[] }))
      )
    )
      .then(setRepoChanges)
      .finally(() => setLoading(false))
  } else {
    // Single repo or no git
    invoke<FileChange[]>("get_workspace_changes", { path: workspacePath })
      .then((c) => {
        setChanges(c)
        setRepoChanges([])
      })
      .catch(() => {
        setChanges([])
        setRepoChanges([])
      })
      .finally(() => setLoading(false))
  }
}, [workspacePath, mode, refreshKey, gitMode, gitRepos])
```

Add state for repo changes:

```typescript
const [repoChanges, setRepoChanges] = useState<RepoChanges[]>([])
```

- [ ] **Step 3: Add grouped changes rendering**

Add a `GroupedChangesView` component inside the file or as a local function:

```typescript
function GroupedChangesView({
  repoChanges,
  onOpenChange,
}: {
  repoChanges: RepoChanges[]
  onOpenChange: (repoPath: string, filePath: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggleCollapse(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="flex flex-col">
      {repoChanges.map(({ repo, changes }) => {
        const isCollapsed = collapsed.has(repo.path)
        const hasChanges = changes.length > 0

        return (
          <div key={repo.path}>
            {/* Repo header */}
            <button
              type="button"
              className={`flex items-center gap-1.5 w-full px-3 py-1.5 text-left transition-colors ${
                hasChanges ? "hover:bg-accent" : ""
              }`}
              onClick={() => hasChanges && toggleCollapse(repo.path)}
              disabled={!hasChanges}
            >
              {hasChanges ? (
                isCollapsed ? (
                  <CaretRight size={10} className="shrink-0 text-fg-weakest" />
                ) : (
                  <CaretDown size={10} className="shrink-0 text-fg-weakest" />
                )
              ) : (
                <span className="w-2.5" />
              )}
              <FolderSimple size={12} weight="fill" className={`shrink-0 ${hasChanges ? "text-fg-weaker" : "text-fg-weakest"}`} />
              <span className={`text-xs truncate ${hasChanges ? "text-fg-weaker" : "text-fg-weakest"}`}>
                {repo.name}
              </span>
              <span className={`text-2xs ${hasChanges ? "text-fg-weak" : "text-fg-weakest"}`}>
                {repo.branch}
              </span>
              <span className="flex-1" />
              {hasChanges && (
                <span className="text-2xs text-fg-weakest">{changes.length}</span>
              )}
            </button>

            {/* Change list */}
            {hasChanges && !isCollapsed && (
              <div className="flex flex-col">
                {changes.map((change) => (
                  <button
                    key={`${repo.path}/${change.path}`}
                    type="button"
                    className="flex items-center gap-2 w-full text-left pl-7 pr-3 py-[3px] hover:bg-accent rounded-sm transition-colors text-sm"
                    onClick={() => onOpenChange(repo.path, change.path)}
                    title={change.path}
                  >
                    <span className={`text-2xs font-mono shrink-0 w-3 ${STATUS_COLORS[change.status]}`}>
                      {STATUS_LABELS[change.status]}
                    </span>
                    <span className="truncate text-fg-weak">{change.path}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Update the render section to use grouped view**

Replace the changes rendering block (around lines 154-173) with:

```typescript
) : repoChanges.length > 0 ? (
  <GroupedChangesView
    repoChanges={repoChanges}
    onOpenChange={(repoPath, filePath) => {
      const absPath = filePath.startsWith("/") ? filePath : `${repoPath}/${filePath}`
      handleOpenFile(absPath)
    }}
  />
) : changes.length > 0 ? (
  <div className="flex flex-col">
    {changes.map((change) => (
      <button
        key={change.path}
        type="button"
        className="flex items-center gap-2 w-full text-left px-3 py-[3px] hover:bg-accent rounded-sm transition-colors text-sm"
        onClick={() => handleOpenChange(change.path)}
        title={change.path}
      >
        <span className={`text-2xs font-mono shrink-0 w-3 ${STATUS_COLORS[change.status]}`}>
          {STATUS_LABELS[change.status]}
        </span>
        <span className="truncate text-fg-weak">{change.path}</span>
      </button>
    ))}
  </div>
) : (
  <div className="px-3 py-4 text-sm text-muted-foreground">No changes</div>
)
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Visual test — single repo**

Open single-repo workspace, switch to changes tab. Verify behavior unchanged.

- [ ] **Step 7: Visual test — multi-repo**

Open multi-repo workspace, switch to changes tab. Verify:
- Repos with changes are expanded by default
- Repos with 0 changes are dimmed, not expandable
- Each group shows repo name + branch + change count
- Clicking a file opens it correctly

- [ ] **Step 8: Commit**

```bash
git add src/openacp/components/file-tree-panel.tsx
git commit -m "feat: grouped git changes view for multi-repo workspaces"
```

---

## Chunk 5: Update EmptyState in ChatView

### Task 5: Update EmptyState to handle multi-repo

**Files:**
- Modify: `src/openacp/components/chat/chat-view.tsx:41-59`

The EmptyState currently calls `get_git_branch` and `get_git_remote_url` directly. In multi-repo mode, these fail. Use the hook instead.

- [ ] **Step 1: Update EmptyState to use `useGitRepos`**

Replace the branch/remote fetching in EmptyState (lines 43-59) with:

```typescript
import { useGitRepos } from "../../hooks/use-git-repos"

// Inside EmptyState:
const { mode: gitMode, repos: gitRepos } = useGitRepos(workspace.directory)
const [remoteUrl, setRemoteUrl] = useState<string | null>(null)

// Derive branch from first repo (or single repo)
const branch = gitRepos.length > 0 ? gitRepos[0].branch : null

useEffect(() => {
  let cancelled = false
  const dir = gitRepos.length > 0 ? gitRepos[0].path : workspace.directory
  invoke<string | null>("get_git_remote_url", { directory: dir })
    .then((u) => !cancelled && setRemoteUrl(u))
    .catch(() => !cancelled && setRemoteUrl(null))
  return () => { cancelled = true }
}, [gitRepos, workspace.directory])
```

Remove the old `useState<string | null>(null)` for `branch` and the old `useEffect` that fetched branch + remote.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/chat/chat-view.tsx
git commit -m "feat: update EmptyState to use useGitRepos for multi-repo support"
```

---

## Chunk 6: Build & Verify

### Task 6: Full build and smoke test

- [ ] **Step 1: Run full build**

Run: `cd /Users/liam/Data/Projects/OpenACP-App && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 2: Run Tauri dev for live testing**

Run: `npm run tauri dev`

Test scenarios:
1. Open a workspace that is a single git repo → branch indicator shows single branch, dropdown shows branches as before
2. Open a workspace folder containing multiple git repos → branch indicator shows "N repositories", dropdown shows all repos with branches
3. In multi-repo workspace, switch to changes tab → changes grouped by repo
4. Expand a repo in branch dropdown → shows all branches with current marked
5. Copy branch name → works for both modes

- [ ] **Step 3: Final commit (if any adjustments needed)**

```bash
git add -A
git commit -m "fix: adjustments from multi-repo smoke testing"
```
