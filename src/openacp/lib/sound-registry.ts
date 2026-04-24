import { BaseDirectory, exists, mkdir, readFile, writeFile, remove } from "@tauri-apps/plugin-fs"
import type { ImportedFormat, ImportedSound, SoundEventKey } from "./settings-store"

const MIME_FOR_EXT: Record<ImportedFormat, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
}

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
      // Read file bytes via fs plugin + wrap in Blob URL.
      // (convertFileSrc would need Tauri assetProtocol configured; using fs
      // plugin avoids that extra config and stays within the scoped fs
      // permissions already granted in capabilities/default.json.)
      const bytes = await readFile(`sounds/${meta.id}.${meta.ext}`, {
        baseDir: BaseDirectory.AppData,
      })
      const blob = new Blob([bytes], { type: MIME_FOR_EXT[meta.ext] })
      return URL.createObjectURL(blob)
    } catch (err) {
      console.warn("[sound-registry] imported resolve failed:", id, err)
      return null
    }
  }
  return null
}

// ── Import / delete ─────────────────────────────────────────────────────────

const ALLOWED_EXTS: ImportedFormat[] = ["mp3", "wav", "ogg"]
const MAX_SIZE_BYTES = 5 * 1024 * 1024
export const MAX_LIBRARY_SIZE = 50

export class SoundImportError extends Error {
  constructor(
    public code: "library-full" | "too-large" | "unsupported-format" | "write-failed",
    message: string,
  ) {
    super(message)
    this.name = "SoundImportError"
  }
}

function sanitizeDisplayName(raw: string): string {
  // Strip extension, keep only word chars + space + dash + dot; cap 64 chars
  const withoutExt = raw.replace(/\.[^./\\]+$/, "")
  return withoutExt.replace(/[^\w\s\-.]/g, "").trim().slice(0, 64) || "Sound"
}

function extOf(filename: string): string | null {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : null
}

async function ensureSoundsDir(): Promise<void> {
  const present = await exists("sounds", { baseDir: BaseDirectory.AppData })
  if (!present) {
    await mkdir("sounds", { baseDir: BaseDirectory.AppData, recursive: true })
  }
}

/**
 * Import a user-selected audio file.
 *
 * Validates size + format + library cap. Writes to appDataDir/sounds/<uuid>.<ext>.
 * Returns metadata — caller MUST re-read `sounds` settings via `getSetting('sounds')`
 * immediately before persisting the new library to avoid clobbering concurrent writes.
 *
 * The `currentLibrary` argument is for the library-size precheck only (may be
 * stale). The authoritative atomicity step lives in the caller (see
 * `settings-sounds.tsx` `handleImport`), which re-reads settings AFTER this
 * function returns and BEFORE `setSetting`.
 */
export async function importSound(
  file: File,
  currentLibrary: ImportedSound[],
): Promise<ImportedSound> {
  if (currentLibrary.length >= MAX_LIBRARY_SIZE) {
    throw new SoundImportError(
      "library-full",
      `Library full (max ${MAX_LIBRARY_SIZE} sounds) — delete unused sounds first`,
    )
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new SoundImportError("too-large", "File too large (max 5MB)")
  }
  const ext = extOf(file.name)
  if (!ext || !ALLOWED_EXTS.includes(ext as ImportedFormat)) {
    throw new SoundImportError("unsupported-format", "Use MP3, WAV, or OGG")
  }

  const id = crypto.randomUUID()
  const bytes = new Uint8Array(await file.arrayBuffer())

  try {
    await ensureSoundsDir()
    await writeFile(`sounds/${id}.${ext}`, bytes, { baseDir: BaseDirectory.AppData })
  } catch (err) {
    console.error("[sound-registry] write failed:", err)
    throw new SoundImportError("write-failed", "Failed to save imported sound")
  }

  return {
    id,
    name: sanitizeDisplayName(file.name),
    ext: ext as ImportedFormat,
    importedAt: Date.now(),
  }
}

/**
 * Delete an imported sound's file from disk. Idempotent — missing file is OK.
 */
export async function deleteImportedSoundFile(id: string, ext: ImportedFormat): Promise<void> {
  try {
    const present = await exists(`sounds/${id}.${ext}`, { baseDir: BaseDirectory.AppData })
    if (present) {
      await remove(`sounds/${id}.${ext}`, { baseDir: BaseDirectory.AppData })
    }
  } catch (err) {
    // Orphaned file is harmless — surface in logs but don't throw
    console.warn("[sound-registry] remove failed (entry will still be dropped):", err)
  }
}
