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
                          <span className="shrink-0 flex items-center gap-0.5">
                            <GitBranch size={10} weight={b === repo.branch ? "bold" : "regular"} />
                            <span className={`size-1.5 rounded-full ${b === repo.branch ? "bg-color-success" : "bg-transparent"}`} />
                          </span>
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
