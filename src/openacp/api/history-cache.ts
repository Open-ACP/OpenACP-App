/**
 * Chat history cache using Tauri Store plugin.
 * Each session gets its own store file at: $APPDATA/history/{sessionId}.json
 * Falls back to in-memory cache when Tauri Store is unavailable (dev/browser).
 */
import type { Message } from "../types"

interface CacheEntry {
  sessionId: string
  messages: Message[]
  updatedAt: number
}

// In-memory fallback for non-Tauri environments
const memoryCache = new Map<string, CacheEntry>()

let Store: any = null

async function getStore(sessionId: string) {
  if (!Store) {
    try {
      const mod = await import("@tauri-apps/plugin-store")
      Store = mod.Store
    } catch {
      return null // Not in Tauri — use memory fallback
    }
  }
  try {
    return await Store.load(`history/${sessionId}.json`, { autoSave: true })
  } catch {
    return null
  }
}

/** Save messages for a session to cache */
export async function cacheMessages(sessionId: string, messages: Message[]): Promise<void> {
  const entry: CacheEntry = { sessionId, messages, updatedAt: Date.now() }

  const store = await getStore(sessionId)
  if (store) {
    try {
      await store.set("data", entry)
      await store.save()
      return
    } catch { /* fall through to memory */ }
  }

  memoryCache.set(sessionId, entry)
}

/** Load cached messages for a session */
export async function loadCachedMessages(sessionId: string): Promise<Message[] | null> {
  const store = await getStore(sessionId)
  if (store) {
    try {
      const entry = await store.get("data") as CacheEntry | undefined
      return entry?.messages ?? null
    } catch { /* fall through */ }
  }

  const entry = memoryCache.get(sessionId)
  return entry?.messages ?? null
}

/** Clear cache for a session */
export async function clearCachedMessages(sessionId: string): Promise<void> {
  const store = await getStore(sessionId)
  if (store) {
    try {
      await store.clear()
      await store.save()
    } catch { /* ignore */ }
  }
  memoryCache.delete(sessionId)
}
