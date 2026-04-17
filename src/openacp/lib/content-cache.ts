interface CacheEntry {
  content: string
  language: string
  size: number
}

const MAX_ENTRIES = 40
const MAX_TOTAL_BYTES = 20 * 1024 * 1024 // 20MB

const cache = new Map<string, CacheEntry>()
let totalBytes = 0

function evictOldest() {
  const first = cache.keys().next()
  if (first.done) return
  const entry = cache.get(first.value)!
  totalBytes -= entry.size
  cache.delete(first.value)
}

export function getContent(path: string): CacheEntry | undefined {
  const entry = cache.get(path)
  if (!entry) return undefined
  // Move to end (most recently used)
  cache.delete(path)
  cache.set(path, entry)
  return entry
}

export function setContent(path: string, content: string, language: string): void {
  const size = new Blob([content]).size
  // Remove existing entry if updating
  const existing = cache.get(path)
  if (existing) {
    totalBytes -= existing.size
    cache.delete(path)
  }
  // Evict until within limits
  while (cache.size >= MAX_ENTRIES || (totalBytes + size > MAX_TOTAL_BYTES && cache.size > 0)) {
    evictOldest()
  }
  cache.set(path, { content, language, size })
  totalBytes += size
}

export function removeContent(path: string): void {
  const entry = cache.get(path)
  if (entry) {
    totalBytes -= entry.size
    cache.delete(path)
  }
}

export function clearCache(): void {
  cache.clear()
  totalBytes = 0
}
