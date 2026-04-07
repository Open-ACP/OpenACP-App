import { useState, useEffect, useCallback } from "react"
import { GitBranch, Copy, Check } from "@phosphor-icons/react"
import { invoke } from "@tauri-apps/api/core"
import { useWorkspace } from "../context/workspace"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

const POLL_INTERVAL = 5000

export function BranchIndicator() {
  const workspace = useWorkspace()
  const [branch, setBranch] = useState<string | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [copiedBranch, setCopiedBranch] = useState<string | null>(null)

  const fetchBranch = useCallback(() => {
    invoke<string | null>("get_git_branch", { directory: workspace.directory })
      .then(setBranch)
      .catch(() => setBranch(null))
  }, [workspace.directory])

  const fetchBranches = useCallback(() => {
    invoke<string[]>("get_git_branches", { directory: workspace.directory })
      .then(setBranches)
      .catch(() => setBranches([]))
  }, [workspace.directory])

  useEffect(() => {
    fetchBranch()
    const timer = setInterval(fetchBranch, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [fetchBranch])

  if (!branch) return null

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
          className="min-w-0 max-w-[160px] text-sm-regular text-foreground-weak gap-1 px-2"
          title={`Branch: ${branch}`}
        >
          <GitBranch size={14} weight="bold" className="shrink-0" />
          <span className="truncate">{branch}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={4} className="w-64">
        <DropdownMenuLabel className="text-foreground-weaker" style={{ fontSize: "10px", lineHeight: "1.4", letterSpacing: "0.02em" }}>
          Local Branches
        </DropdownMenuLabel>
        <div className="max-h-[260px] overflow-y-auto no-scrollbar">
        {branches.map((b) => (
          <DropdownMenuItem
            key={b}
            className="flex items-center gap-2 text-sm-regular cursor-default"
            onSelect={(e) => e.preventDefault()}
          >
            <GitBranch size={12} weight={b === branch ? "bold" : "regular"} className="shrink-0" />
            <span className={`flex-1 truncate ${b === branch ? "text-foreground font-medium" : "text-foreground-weak"}`}>
              {b}
            </span>
            <button
              type="button"
              className="shrink-0 flex items-center justify-center size-5 rounded hover:bg-accent transition-colors"
              onClick={(e) => { e.stopPropagation(); copyBranch(b) }}
              title="Copy branch name"
            >
              {copiedBranch === b ? (
                <Check size={12} className="text-green-500" />
              ) : (
                <Copy size={12} className="text-foreground-weaker" />
              )}
            </button>
          </DropdownMenuItem>
        ))}
        {branches.length === 0 && (
          <div className="px-2 py-1.5 text-sm-regular text-muted-foreground">No branches found</div>
        )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
