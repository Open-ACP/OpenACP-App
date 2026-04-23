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
