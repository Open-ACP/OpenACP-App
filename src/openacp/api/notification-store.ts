import { load } from "@tauri-apps/plugin-store"

export interface AppNotification {
  id: string
  type: "agent-response" | "permission-request" | "message-failed" | "mention"
  sessionId?: string
  sessionName?: string
  workspaceName?: string
  title: string
  timestamp: number
  read: boolean
  action?: { type: string; payload?: Record<string, unknown> }
}

const STORE_NAME = "notifications.json"
const MAX_NOTIFICATIONS = 500
const TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

let store: Awaited<ReturnType<typeof load>> | null = null

async function getStore() {
  if (!store) store = await load(STORE_NAME)
  return store
}

function prune(list: AppNotification[]): AppNotification[] {
  const cutoff = Date.now() - TTL_MS
  const fresh = list.filter((n) => n.timestamp >= cutoff)
  if (fresh.length <= MAX_NOTIFICATIONS) return fresh
  return fresh.slice(fresh.length - MAX_NOTIFICATIONS)
}

export async function loadNotifications(): Promise<AppNotification[]> {
  try {
    const s = await getStore()
    const data = (await s.get("items")) as AppNotification[] | undefined
    return prune(data ?? [])
  } catch {
    return []
  }
}

export async function saveNotifications(items: AppNotification[]): Promise<void> {
  try {
    const s = await getStore()
    await s.set("items", items)
  } catch { /* non-critical */ }
}
