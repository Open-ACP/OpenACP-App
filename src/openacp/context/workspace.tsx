import { createContext, useContext, type ParentProps } from "solid-js"
import { createApiClient, type ApiClient } from "../api/client"
import type { ServerInfo } from "../types"
import type { WorkspaceEntry } from "../api/workspace-store"

interface WorkspaceContext {
  instanceId: string
  directory: string  // workspace root dir (for display/file ops)
  workspace: WorkspaceEntry
  server: ServerInfo
  client: ApiClient
}

const Ctx = createContext<WorkspaceContext>()

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

export function WorkspaceProvider(props: ParentProps<{
  workspace: WorkspaceEntry
  server: ServerInfo
  onReconnectNeeded?: () => void
  onTokenRefreshed?: (update: { expiresAt: string; refreshDeadline: string }) => void
}>) {
  const client = createApiClient(props.server, props.workspace.id)
  if (props.onReconnectNeeded) {
    client.setOnReconnectNeeded(props.onReconnectNeeded)
  }
  if (props.onTokenRefreshed) {
    client.setOnTokenRefreshed(props.onTokenRefreshed)
  }

  const value: WorkspaceContext = {
    get instanceId() { return props.workspace.id },
    get directory() { return props.workspace.directory },
    get workspace() { return props.workspace },
    server: props.server,
    client,
  }

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
