import React, { useState, useEffect } from "react"
import { FolderOpen, Plus } from "@phosphor-icons/react"
import { discoverLocalInstances } from "../api/workspace-store"
import { Button } from "./ui/button"
import appIcon from "../../assets/app-icon.png"

export function WelcomeScreen(props: {
  onOpenFolder: () => void
  onAddWorkspace: () => void
  onSelectWorkspace: (instanceId: string) => void
}) {
  const [discovered, setDiscovered] = useState<Awaited<ReturnType<typeof discoverLocalInstances>> | null>(null)

  useEffect(() => {
    discoverLocalInstances().then(setDiscovered).catch(() => setDiscovered([]))
  }, [])

  const dirName = (directory: string) => directory.split("/").pop() || "Workspace"
  const shortPath = (directory: string) => {
    const parts = directory.split("/")
    if (parts.length > 3) return "~/" + parts.slice(3).join("/")
    return directory
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-card">
      <div className="flex flex-col items-center gap-8 max-w-sm w-full px-6">
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-4">
          <img src={appIcon} alt="OpenACP" className="size-16 rounded-2xl" />
          <div className="text-center">
            <div className="text-xl font-semibold tracking-tight text-foreground">OpenACP</div>
            <div className="text-sm text-muted-foreground mt-1">Open a workspace to get started</div>
          </div>
        </div>

        {/* Recent workspaces */}
        {discovered && discovered.length > 0 && (
          <div className="w-full">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Recent workspaces
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-border-weak overflow-hidden">
              {discovered.map((instance, i) => (
                <button
                  key={instance.id}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors ${
                    i > 0 ? "border-t border-border-weak" : ""
                  }`}
                  onClick={() => props.onSelectWorkspace(instance.id)}
                >
                  <div className="flex size-8 items-center justify-center rounded-md bg-secondary shrink-0">
                    <FolderOpen size={14} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{dirName(instance.directory)}</div>
                    <div className="text-xs text-muted-foreground truncate font-mono">{shortPath(instance.directory)}</div>
                  </div>
                  {instance.status === "running" && (
                    <div className="size-2 rounded-full shrink-0" style={{ background: "var(--surface-success-strong)" }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add workspace button */}
        <Button
          variant="outline"
          className="w-full h-9 gap-2 text-sm font-medium"
          onClick={props.onAddWorkspace}
        >
          <Plus size={15} />
          Add Workspace
        </Button>
      </div>
    </div>
  )
}
