/**
 * Chat history cache using Tauri Store plugin (LazyStore).
 * Each session gets its own store file at: $APPDATA/history/{sessionId}.json
 * LazyStore creates a fresh instance each call, avoiding proxy revocation
 * issues during HMR/hot reload while still persisting data to disk.
 * Falls back to in-memory cache when Tauri is unavailable (browser dev).
 */
import type { Message } from "../types"

interface CacheEntry {
  messages: Message[]
  updatedAt: number
}

// In-memory fallback for non-Tauri environments or when store fails
const memoryCache = new Map<string, CacheEntry>()

/** Create a fresh LazyStore instance (avoids proxy revocation on HMR) */
async function withStore<T>(sessionId: string, fn: (store: any) => Promise<T>): Promise<T | null> {
  try {
    const { LazyStore } = await import("@tauri-apps/plugin-store")
    const store = new LazyStore(`history/${sessionId}.json`)
    return await fn(store)
  } catch {
    return null
  }
}

/** Strip large dataUrl from attachments before caching */
function stripAttachmentData(messages: Message[]): Message[] {
  return messages.map(msg => {
    if (!msg.attachments?.length) return msg
    return {
      ...msg,
      attachments: msg.attachments.map(att => ({
        ...att,
        dataUrl: "",
      })),
    }
  })
}

/** Save messages for a session to cache */
export async function cacheMessages(sessionId: string, messages: Message[]): Promise<void> {
  const entry: CacheEntry = { messages: stripAttachmentData(messages), updatedAt: Date.now() }

  // Always save to memory as backup
  memoryCache.set(sessionId, entry)

  // Persist to disk via LazyStore
  await withStore(sessionId, async (store) => {
    await store.set("data", entry)
    await store.save()
  })
}

/** Load cached messages for a session */
export async function loadCachedMessages(sessionId: string): Promise<Message[] | null> {
  // Try disk first
  const diskEntry = await withStore(sessionId, async (store) => {
    return await store.get("data") as CacheEntry | undefined
  })
  if (diskEntry?.messages?.length) return diskEntry.messages

  // Fall back to memory
  const memEntry = memoryCache.get(sessionId)
  return memEntry?.messages ?? null
}

/** Clear cache for a session */
export async function clearCachedMessages(sessionId: string): Promise<void> {
  await withStore(sessionId, async (store) => {
    await store.clear()
    await store.save()
  })
  memoryCache.delete(sessionId)
}
