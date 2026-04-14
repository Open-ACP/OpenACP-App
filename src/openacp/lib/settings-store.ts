import { load } from "@tauri-apps/plugin-store"

const STORE_NAME = "settings.json"

export interface AppSettings {
  theme: "dark" | "light" | "system"
  fontSize: "small" | "medium" | "large"
  language: string
  devMode: boolean
  browserPanel: boolean
  browserLastMode: "docked" | "floating" | "pip"
  browserSearchEngine: "google" | "duckduckgo" | "bing"
  toolAutoExpand: Record<string, boolean>
  messageMode: "queue" | "instant"
}

const defaults: AppSettings = {
  theme: "dark",
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
  const theme = ((await s.get("theme")) as AppSettings["theme"]) ?? defaults.theme
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
  return { theme, fontSize, language, devMode, browserPanel, browserLastMode, browserSearchEngine, toolAutoExpand, messageMode }
}

/** Apply theme to document element. `system` resolves to the OS preference so that
 *  both our `[data-theme]` tokens and Tailwind's `dark:` variant stay in sync.
 *  Mirrors the resolved value into localStorage so the pre-paint script in
 *  index.html can restore it on next launch without waiting for the Tauri store. */
export function applyTheme(theme: AppSettings["theme"]) {
  const root = document.documentElement
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme
  root.setAttribute("data-theme", resolved)
  try {
    localStorage.setItem("theme-hint", resolved)
  } catch {}
}

/** Apply font size scaling to html root — scales entire UI proportionally (text, icons, spacing).
 *  All rem-based values in Tailwind scale with this, acting as a UI zoom level. */
export function applyFontSize(fontSize: AppSettings["fontSize"]) {
  const root = document.documentElement
  root.removeAttribute("data-font-size")
  root.setAttribute("data-font-size", fontSize)
}
