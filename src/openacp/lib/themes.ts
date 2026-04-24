export type ThemeMode = "light" | "dark"

export type ThemeId =
  | "default-light"
  | "default-dark"
  | "amoled-dark"
  | "catppuccin-latte"
  | "catppuccin-mocha"
  | "tokyo-night-dark"
  | "gruvbox-dark"
  | "nord-dark"
  | "one-dark"
  | "github-light"
  | "github-dark"

export type ThemeDescriptor = {
  id: ThemeId
  displayName: string
  mode: ThemeMode
  family?: string
}

export const THEMES: Record<ThemeId, ThemeDescriptor> = {
  "default-light":    { id: "default-light",    displayName: "Default Light",    mode: "light", family: "Default" },
  "default-dark":     { id: "default-dark",     displayName: "Default Dark",     mode: "dark",  family: "Default" },
  "amoled-dark":      { id: "amoled-dark",      displayName: "AMOLED Dark",      mode: "dark"  },
  "catppuccin-latte": { id: "catppuccin-latte", displayName: "Catppuccin Latte", mode: "light", family: "Catppuccin" },
  "catppuccin-mocha": { id: "catppuccin-mocha", displayName: "Catppuccin Mocha", mode: "dark",  family: "Catppuccin" },
  "tokyo-night-dark": { id: "tokyo-night-dark", displayName: "Tokyo Night Dark", mode: "dark"  },
  "gruvbox-dark":     { id: "gruvbox-dark",     displayName: "Gruvbox Dark",     mode: "dark"  },
  "nord-dark":        { id: "nord-dark",        displayName: "Nord Dark",        mode: "dark"  },
  "one-dark":         { id: "one-dark",         displayName: "One Dark",         mode: "dark"  },
  "github-light":     { id: "github-light",     displayName: "GitHub Light",     mode: "light", family: "GitHub" },
  "github-dark":      { id: "github-dark",      displayName: "GitHub Dark",      mode: "dark",  family: "GitHub" },
}

export const DEFAULT_THEME_ID: ThemeId = "default-dark"
export const THEME_IDS = Object.keys(THEMES) as ThemeId[]

export function getThemeDescriptor(id: string): ThemeDescriptor {
  return THEMES[id as ThemeId] ?? THEMES[DEFAULT_THEME_ID]
}

type Group = { label: string; themes: ThemeDescriptor[] }

export function groupThemesForUI(): Group[] {
  const all = Object.values(THEMES)
  const defaults = all.filter((t) => t.family === "Default")
  const otherDark = all
    .filter((t) => t.family !== "Default" && t.mode === "dark")
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  const otherLight = all
    .filter((t) => t.family !== "Default" && t.mode === "light")
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  return [
    { label: "Default", themes: defaults },
    { label: "Dark",    themes: otherDark },
    { label: "Light",   themes: otherLight },
  ]
}

export function migrateLegacyTheme(
  value: string,
  opts?: { prefersDark?: boolean },
): ThemeId {
  if (value in THEMES) return value as ThemeId
  if (value === "light") return "default-light"
  if (value === "dark") return "default-dark"
  if (value === "system") {
    const prefersDark =
      opts?.prefersDark ??
      (typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    return prefersDark ? "default-dark" : "default-light"
  }
  return DEFAULT_THEME_ID
}

/** Dev-only: probe computed styles to verify each theme CSS block exists.
 *  Runs at app startup when import.meta.env.DEV is true. Logs warnings, not errors. */
export function verifyThemeRegistry(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return

  // 1. Check every registry entry has a CSS block
  const probe = document.createElement("div")
  probe.style.position = "absolute"
  probe.style.opacity = "0"
  probe.style.pointerEvents = "none"
  document.body.appendChild(probe)

  const missing: ThemeId[] = []
  for (const id of THEME_IDS) {
    probe.setAttribute("data-theme", id)
    const bg = getComputedStyle(probe).getPropertyValue("--bg-base").trim()
    if (!bg) missing.push(id)
  }
  probe.remove()
  if (missing.length > 0) {
    console.warn(`[theme] missing CSS blocks for: ${missing.join(", ")}`)
  }

  // 2. Check pre-paint MODES table matches registry
  const modes = (window as unknown as { __THEME_MODES__?: Record<string, ThemeMode> }).__THEME_MODES__
  if (!modes) {
    console.warn("[theme] __THEME_MODES__ missing from window — check pre-paint script")
    return
  }
  const extraInModes = Object.keys(modes).filter((k) => !(k in THEMES))
  const missingFromModes = THEME_IDS.filter((id) => !(id in modes))
  const wrongMode = THEME_IDS.filter((id) => id in modes && modes[id] !== THEMES[id].mode)
  if (extraInModes.length > 0)
    console.warn(`[theme] MODES has unknown ids: ${extraInModes.join(", ")}`)
  if (missingFromModes.length > 0)
    console.warn(`[theme] MODES missing ids: ${missingFromModes.join(", ")}`)
  if (wrongMode.length > 0)
    console.warn(`[theme] MODES mode mismatch for: ${wrongMode.join(", ")}`)
}
