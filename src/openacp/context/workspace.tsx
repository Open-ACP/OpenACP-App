import { createContext, useContext, type ReactNode } from "react"
import { createApiClient, type ApiClient } from "../api/client"
import type { ServerInfo } from "../types"

interface WorkspaceContext {
  instanceId: string
  directory: string  // workspace root dir (for display/file ops)
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
 * Resolve workspace server info by instance ID.
 * Looks up the instance root from instances.json, then reads api.port + api-secret.
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
  instanceId: string
  directory: string
  server: ServerInfo
  children: ReactNode
}) {
  const client = createApiClient(props.server)

  const value: WorkspaceContext = {
    instanceId: props.instanceId,
    directory: props.directory,
    server: props.server,
    client,
  }

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
