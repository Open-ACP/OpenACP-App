import { load } from "@tauri-apps/plugin-store"
import type { Session } from "../types"

const STORE_NAME = "sessions.json"

let store: Awaited<ReturnType<typeof load>> | null = null

async function getStore() {
  if (!store) store = await load(STORE_NAME)
  return store
}

/** Cache session list for a workspace */
export async function cacheSessions(workspaceDir: string, sessions: Session[]): Promise<void> {
  try {
    const s = await getStore()
    await s.set(workspaceDir, sessions)
  } catch { /* non-critical */ }
}

/** Load cached sessions for a workspace */
export async function loadCachedSessions(workspaceDir: string): Promise<Session[] | null> {
  try {
    const s = await getStore()
    const data = await s.get(workspaceDir) as Session[] | undefined
    return data ?? null
  } catch {
    return null
  }
}
