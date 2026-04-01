import { createContext, useContext, type ParentProps, type Accessor } from "solid-js"
import { createApiClient, type ApiClient } from "../api/client"
import type { ServerInfo } from "../types"

interface WorkspaceContext {
  directory: string
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
 * Resolve workspace server info from .openacp/ directory.
 * Uses Tauri command to read api.port + api-secret files.
 */
export async function resolveWorkspaceServer(directory: string): Promise<ServerInfo | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    return await invoke<ServerInfo>("get_workspace_server_info", { directory })
  } catch {
    return null
  }
}

export function WorkspaceProvider(props: ParentProps<{ directory: string; server: ServerInfo }>) {
  const client = createApiClient(props.server)

  const value: WorkspaceContext = {
    get directory() { return props.directory },
    server: props.server,
    client,
  }

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
