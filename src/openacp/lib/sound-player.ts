import { getSetting } from "./settings-store"
import type { SoundEventKey } from "./settings-store"
import { BUILTIN_DEFAULTS, getSoundSrc } from "./sound-registry"

const COOLDOWN_MS = 500
const lastPlayedAt: Partial<Record<SoundEventKey, number>> = {}

/** Cache of resolved soundId → src — warmed by preloadDefaultSounds */
const srcCache: Map<string, string> = new Map()

/** Live audio elements — tracked so stopAllSounds can pause them */
const activeAudios: Set<HTMLAudioElement> = new Set()

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

async function resolveAndCache(
  soundId: string,
  library: Parameters<typeof getSoundSrc>[1],
): Promise<string | null> {
  const cached = srcCache.get(soundId)
  if (cached) return cached
  const src = await getSoundSrc(soundId, library)
  if (src) srcCache.set(soundId, src)
  return src
}

async function playSrc(src: string, volume: number): Promise<void> {
  const audio = new Audio(src)
  audio.volume = clamp01(volume)
  activeAudios.add(audio)
  const cleanup = () => {
    activeAudios.delete(audio)
    audio.removeEventListener("ended", cleanup)
    audio.removeEventListener("error", cleanup)
  }
  audio.addEventListener("ended", cleanup)
  audio.addEventListener("error", cleanup)
  try {
    await audio.play()
  } catch (err) {
    cleanup()
    console.warn("[sound-player] play failed:", err)
  }
}

/** Preload the 4 default built-in sounds' URLs to eliminate first-play latency */
export async function preloadDefaultSounds(): Promise<void> {
  const sounds = await getSetting("sounds")
  const library = sounds?.library ?? []
  const ids = Object.values(BUILTIN_DEFAULTS)
  await Promise.all(ids.map((id) => resolveAndCache(id, library)))
}

/** Play the sound associated with an event — honors enable toggles + cooldown */
export async function playEventSound(eventKey: SoundEventKey): Promise<void> {
  const sounds = await getSetting("sounds")
  if (!sounds?.enabled) return
  const ev = sounds.events?.[eventKey]
  if (!ev?.enabled) return

  const now = Date.now()
  const last = lastPlayedAt[eventKey] ?? 0
  if (now - last < COOLDOWN_MS) return
  lastPlayedAt[eventKey] = now

  const library = sounds.library ?? []
  let src = await resolveAndCache(ev.soundId, library)
  if (!src) {
    src = await resolveAndCache(BUILTIN_DEFAULTS[eventKey], library)
  }
  if (!src) return
  await playSrc(src, sounds.volume)
}

/** Preview a specific sound — bypasses master/event toggles and cooldown */
export async function previewSound(soundId: string): Promise<void> {
  const sounds = await getSetting("sounds")
  const library = sounds?.library ?? []
  const src = await resolveAndCache(soundId, library)
  if (!src) return
  await playSrc(src, sounds?.volume ?? 0.6)
}

/** Stop all currently-playing audios */
export function stopAllSounds(): void {
  for (const a of activeAudios) {
    try {
      a.pause()
      a.currentTime = 0
    } catch {}
  }
  activeAudios.clear()
}

function revokeIfBlob(src: string | undefined): void {
  if (src?.startsWith("blob:")) URL.revokeObjectURL(src)
}

/** Evict a cached src — call after delete/import to pick up changes */
export function invalidateSoundCache(soundId?: string): void {
  if (soundId) {
    revokeIfBlob(srcCache.get(soundId))
    srcCache.delete(soundId)
  } else {
    for (const src of srcCache.values()) revokeIfBlob(src)
    srcCache.clear()
  }
}
