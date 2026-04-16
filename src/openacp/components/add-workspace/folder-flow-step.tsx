import React, { useEffect, useRef, useState } from "react"
import { CaretLeft } from "@phosphor-icons/react"
import type { ClassifyDirectoryResult } from "../../api/workspace-service"
import type { InstanceListEntry, WorkspaceEntry } from "../../api/workspace-store"
import { invalidateInstancesCache } from "../../api/workspace-store"
import {
  registerWorkspace,
  WorkspaceServiceError,
} from "../../api/workspace-service"
import { CreateInstance } from "./create-instance"
import { Button } from "../ui/button"

interface FolderFlowStepProps {
  result: ClassifyDirectoryResult
  instances: InstanceListEntry[]
  onAdd: (entry: WorkspaceEntry) => void
  onSetup?: (path: string, instanceId: string, instanceName: string) => void
  onBack: () => void
}

export function FolderFlowStep(props: FolderFlowStepProps) {
  const folderName = directoryOf(props.result).split("/").pop() ?? directoryOf(props.result)
  const backRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    backRef.current?.focus()
  }, [])

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          ref={backRef}
          type="button"
          aria-label="Back to workspaces list"
          onClick={props.onBack}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <CaretLeft size={14} />
        </button>
        <span className="text-sm font-medium text-foreground truncate">{folderName}</span>
      </div>
      <Body {...props} />
    </div>
  )
}

function directoryOf(result: ClassifyDirectoryResult): string {
  return result.type === "registered" ? result.instance.directory : result.directory
}

function Body(props: FolderFlowStepProps) {
  const { result } = props
  if (result.type === "registered") {
    const inst = result.instance
    return (
      <div className="p-4 bg-secondary rounded-xl border border-border space-y-3">
        <div>
          <p className="text-md-medium text-foreground mb-1">Workspace found</p>
          <p className="text-sm-regular text-muted-foreground">
            This folder is already set up as <strong className="text-fg-weak">{inst.name ?? inst.id}</strong>. Click Add to open it here.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => props.onAdd({ id: inst.id, name: inst.name ?? inst.id, directory: inst.directory, type: "local" })}
        >
          Add workspace
        </Button>
      </div>
    )
  }
  if (result.type === "unregistered") {
    return <RegisterExistingView path={result.directory} onAdd={props.onAdd} />
  }
  return (
    <CreateInstance
      path={result.directory}
      existingInstances={props.instances}
      onAdd={props.onAdd}
      onSetup={props.onSetup}
      onClose={props.onBack}
    />
  )
}

function RegisterExistingView(props: {
  path: string
  onAdd: (e: WorkspaceEntry) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function register() {
    setLoading(true)
    setError(null)
    try {
      const entry = await registerWorkspace(props.path)
      invalidateInstancesCache()
      props.onAdd(entry)
    } catch (e) {
      if (e instanceof WorkspaceServiceError) setError(e.message)
      else setError(typeof e === "string" ? e : "Failed to add workspace")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 bg-secondary rounded-xl border border-border space-y-3">
      <div>
        <p className="text-md-medium text-foreground mb-1">Existing workspace detected</p>
        <p className="text-sm-regular text-muted-foreground">
          This folder already has an OpenACP workspace. Click Add to register it.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={register}
          disabled={loading}
        >
          {loading ? "Adding..." : "Add workspace"}
        </Button>
        {error && <p className="text-sm-regular text-destructive">{error}</p>}
      </div>
    </div>
  )
}
