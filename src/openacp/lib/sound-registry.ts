import { convertFileSrc } from "@tauri-apps/api/core"
import { appDataDir } from "@tauri-apps/api/path"
import type { ImportedSound, SoundEventKey } from "./settings-store"

export interface Sound {
  /** "builtin:<name>" or "imported:<uuid>" */
  id: string
  /** User-visible name */
  name: string
  source: "builtin" | "imported"
}

/** Default soundId per event — used as fallback when user's choice is missing */
export const BUILTIN_DEFAULTS: Record<SoundEventKey, string> = {
  agentResponse:       "builtin:staplebops-01",
  permissionRequest:   "builtin:yup-03",
  messageFailed:       "builtin:nope-01",
  mentionNotification: "builtin:bip-bop-02",
}

/** Built-in assets — Vite glob, lazy by default */
const BUILTIN_LOADERS = import.meta.glob("../../assets/sounds/*.aac", {
  import: "default",
}) as Record<string, () => Promise<string>>

/** Extract "<name>" from "../../assets/sounds/<name>.aac" */
function builtinNameFromPath(path: string): string {
  const match = path.match(/\/([^/]+)\.aac$/)
  return match ? match[1] : path
}

/** List all available built-in sound names */
function listBuiltinNames(): string[] {
  return Object.keys(BUILTIN_LOADERS).map(builtinNameFromPath).sort()
}

/** Return a unified catalog of all sounds (built-in + imported) */
export async function getAllSounds(library: ImportedSound[]): Promise<Sound[]> {
  const builtins: Sound[] = listBuiltinNames().map((name) => ({
    id: `builtin:${name}`,
    name,
    source: "builtin",
  }))
  const imported: Sound[] = library.map((s) => ({
    id: `imported:${s.id}`,
    name: s.name,
    source: "imported",
  }))
  return [...builtins, ...imported]
}

/** Resolve a soundId to a playable URL. Returns null if unresolvable. */
export async function getSoundSrc(
  soundId: string,
  library: ImportedSound[],
): Promise<string | null> {
  if (soundId.startsWith("builtin:")) {
    const name = soundId.slice("builtin:".length)
    const entry = Object.entries(BUILTIN_LOADERS).find(
      ([p]) => builtinNameFromPath(p) === name,
    )
    if (!entry) return null
    try {
      return await entry[1]()
    } catch (err) {
      console.warn("[sound-registry] built-in load failed:", name, err)
      return null
    }
  }
  if (soundId.startsWith("imported:")) {
    const id = soundId.slice("imported:".length)
    const meta = library.find((s) => s.id === id)
    if (!meta) return null
    try {
      const base = await appDataDir()
      const absolutePath = `${base}/sounds/${meta.id}.${meta.ext}`
      return convertFileSrc(absolutePath)
    } catch (err) {
      console.warn("[sound-registry] imported resolve failed:", id, err)
      return null
    }
  }
  return null
}
