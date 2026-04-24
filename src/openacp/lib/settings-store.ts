import { load } from "@tauri-apps/plugin-store"
import {
  type ThemeId,
  DEFAULT_THEME_ID,
  getThemeDescriptor,
  migrateLegacyTheme,
} from "./themes"

const STORE_NAME = "settings.json"

export interface NotificationSettings {
  /** Master toggle — disables all system notifications when false */
  enabled: boolean
  /** Notify when agent finishes responding (window unfocused) */
  agentResponse: boolean
  /** Notify when agent requests permission approval (window unfocused) */
  permissionRequest: boolean
  /** Notify when a message fails to process */
  messageFailed: boolean
}

export type SoundEventKey =
  | "agentResponse"
  | "permissionRequest"
  | "messageFailed"
  | "mentionNotification"

export type ImportedFormat = "mp3" | "wav" | "ogg"

export interface ImportedSound {
  /** UUID — sole component of stored filename (prevents path traversal) */
  id: string
  /** User-visible name (default: original filename without ext, sanitized) */
  name: string
  /** Lowercase; file stored as "<id>.<ext>" in appDataDir/sounds/ */
  ext: ImportedFormat
  /** Epoch ms */
  importedAt: number
}

export interface SoundEventSettings {
  enabled: boolean
  /** "builtin:<name>" or "imported:<uuid>" */
  soundId: string
}

export interface SoundSettings {
  /** Master toggle — disables all sound effects when false */
  enabled: boolean
  /** 0..1 — global volume multiplier (clamped) */
  volume: number
  /** Imported sound metadata — files live in appDataDir/sounds/ (max 50 entries) */
  library: ImportedSound[]
  /** Per-event config */
  events: Record<SoundEventKey, SoundEventSettings>
}

export interface AppSettings {
  theme: ThemeId
  fontSize: "small" | "medium" | "large"
  language: string
  devMode: boolean
  browserPanel: boolean
  browserLastMode: "docked" | "floating" | "pip"
  browserSearchEngine: "google" | "duckduckgo" | "bing"
  toolAutoExpand: Record<string, boolean>
  messageMode: "queue" | "instant"
  notifications: NotificationSettings
  sounds: SoundSettings
}

const defaults: AppSettings = {
  theme: DEFAULT_THEME_ID,
  fontSize: "medium",
  language: "en",
  devMode: false,
  browserPanel: true,
  browserLastMode: "docked",
  browserSearchEngine: "google",
  toolAutoExpand: {
    read: false,
    search: false,
    edit: true,
    write: true,
    execute: true,
    agent: true,
    web: false,
    skill: false,
    other: false,
  },
  messageMode: "queue",
  notifications: {
    enabled: true,
    agentResponse: true,
    permissionRequest: true,
    messageFailed: true,
  },
  sounds: {
    enabled: true,
    volume: 0.6,
    library: [],
    events: {
      agentResponse:       { enabled: true, soundId: "builtin:staplebops-01" },
      permissionRequest:   { enabled: true, soundId: "builtin:yup-03" },
      messageFailed:       { enabled: true, soundId: "builtin:nope-01" },
      mentionNotification: { enabled: true, soundId: "builtin:bip-bop-02" },
    },
  },
}

let store: Awaited<ReturnType<typeof load>> | null = null

async function getStore() {
  if (!store) store = await load(STORE_NAME, { autoSave: true })
  return store
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const s = await getStore()
  return ((await s.get(key)) as AppSettings[K]) ?? defaults[key]
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  const s = await getStore()
  await s.set(key, value)
}

export async function getAllSettings(): Promise<AppSettings> {
  const s = await getStore()
  const rawTheme = (await s.get("theme")) as string | undefined
  const theme: ThemeId =
    rawTheme == null ? defaults.theme : migrateLegacyTheme(rawTheme)
  if (rawTheme != null && rawTheme !== theme) {
    await s.set("theme", theme)
    await s.save()
    console.info(`[theme] migrated "${rawTheme}" → "${theme}"`)
  }
  const fontSize = ((await s.get("fontSize")) as AppSettings["fontSize"]) ?? defaults.fontSize
  const language = ((await s.get("language")) as AppSettings["language"]) ?? defaults.language
  const devMode = ((await s.get("devMode")) as AppSettings["devMode"]) ?? defaults.devMode
  const browserPanel = ((await s.get("browserPanel")) as AppSettings["browserPanel"]) ?? defaults.browserPanel
  const browserLastMode =
    ((await s.get("browserLastMode")) as AppSettings["browserLastMode"]) ?? defaults.browserLastMode
  const browserSearchEngine =
    ((await s.get("browserSearchEngine")) as AppSettings["browserSearchEngine"]) ?? defaults.browserSearchEngine
  const toolAutoExpand =
    ((await s.get("toolAutoExpand")) as AppSettings["toolAutoExpand"]) ?? defaults.toolAutoExpand
  const messageMode =
    ((await s.get("messageMode")) as AppSettings["messageMode"]) ?? defaults.messageMode
  const notifications =
    ((await s.get("notifications")) as AppSettings["notifications"]) ?? defaults.notifications
  const sounds =
    ((await s.get("sounds")) as AppSettings["sounds"]) ?? defaults.sounds
  return { theme, fontSize, language, devMode, browserPanel, browserLastMode, browserSearchEngine, toolAutoExpand, messageMode, notifications, sounds }
}

/** Apply theme to document element. Looks up the descriptor from the theme registry
 *  and writes both `data-theme` (descriptor id) and `data-mode` (light/dark) so that
 *  token CSS and Tailwind's `dark:` variant stay in sync. Mirrors the id into
 *  localStorage so the pre-paint script in index.html can restore it on next launch
 *  without waiting for the Tauri store. */
export function applyTheme(theme: ThemeId) {
  const descriptor = getThemeDescriptor(theme)
  const root = document.documentElement
  root.setAttribute("data-theme", descriptor.id)
  root.setAttribute("data-mode", descriptor.mode)
  try {
    localStorage.setItem("theme-id", descriptor.id)
  } catch {}
}

/** Apply font size scaling to html root — scales entire UI proportionally (text, icons, spacing).
 *  All rem-based values in Tailwind scale with this, acting as a UI zoom level. */
export function applyFontSize(fontSize: AppSettings["fontSize"]) {
  const root = document.documentElement
  root.removeAttribute("data-font-size")
  root.setAttribute("data-font-size", fontSize)
}
