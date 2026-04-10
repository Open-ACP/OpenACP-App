import React, { createContext, useContext, useMemo } from "react"
import { createApiClient, type ApiClient } from "../api/client"
import type { ServerInfo } from "../types"
import type { WorkspaceEntry } from "../api/workspace-store"

interface WorkspaceContext {
  instanceId: string
  directory: string
  workspace: WorkspaceEntry
  server: ServerInfo
  client: ApiClient
}

const Ctx = createContext<WorkspaceContext | undefined>(undefined)

export function useWorkspace() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider")
  return ctx
}

/**
 * Resolve workspace server info by instance UUID.
 * Reads api.port + api-secret from the instance root via instances.json.
 */
export async function resolveWorkspaceServer(instanceId: string): Promise<ServerInfo | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    return await invoke<ServerInfo>("get_workspace_server_info", { instanceId })
  } catch {
    return null
  }
}

export function WorkspaceProvider(props: {
  workspace: WorkspaceEntry
  server: ServerInfo
  onReconnectNeeded?: () => void
  onTokenRefreshed?: (update: { expiresAt: string; refreshDeadline: string }) => void
  children: React.ReactNode
}) {
  const value = useMemo(() => {
    const client = createApiClient(props.server, props.workspace.id)
    if (props.onReconnectNeeded) {
      client.setOnReconnectNeeded(props.onReconnectNeeded)
    }
    if (props.onTokenRefreshed) {
      client.setOnTokenRefreshed(props.onTokenRefreshed)
    }

    return {
      instanceId: props.workspace.id,
      directory: props.workspace.directory,
      workspace: props.workspace,
      server: props.server,
      client,
    }
  }, [props.workspace, props.server])

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
