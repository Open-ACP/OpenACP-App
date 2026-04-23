/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest"
import {
  THEMES,
  THEME_IDS,
  DEFAULT_THEME_ID,
  getThemeDescriptor,
  groupThemesForUI,
  migrateLegacyTheme,
} from "../themes"

describe("THEMES registry", () => {
  it("contains 11 themes", () => {
    expect(THEME_IDS.length).toBe(11)
  })

  it("every theme has id, displayName, mode", () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id]
      expect(t.id).toBe(id)
      expect(typeof t.displayName).toBe("string")
      expect(t.displayName.length).toBeGreaterThan(0)
      expect(["light", "dark"]).toContain(t.mode)
    }
  })

  it("DEFAULT_THEME_ID points to a real theme", () => {
    expect(THEMES[DEFAULT_THEME_ID]).toBeDefined()
  })
})

describe("getThemeDescriptor", () => {
  it("returns the theme for a known id", () => {
    expect(getThemeDescriptor("catppuccin-mocha").displayName).toBe("Catppuccin Mocha")
  })

  it("falls back to DEFAULT_THEME_ID for unknown id", () => {
    expect(getThemeDescriptor("nonexistent").id).toBe(DEFAULT_THEME_ID)
  })
})

describe("groupThemesForUI", () => {
  it("returns Default group first, then Dark, then Light", () => {
    const groups = groupThemesForUI()
    expect(groups.map((g) => g.label)).toEqual(["Default", "Dark", "Light"])
  })

  it("Default group contains default-light and default-dark", () => {
    const g = groupThemesForUI().find((x) => x.label === "Default")!
    const ids = g.themes.map((t) => t.id)
    expect(ids).toContain("default-light")
    expect(ids).toContain("default-dark")
  })

  it("Dark group is alphabetized by displayName and excludes Default", () => {
    const g = groupThemesForUI().find((x) => x.label === "Dark")!
    const names = g.themes.map((t) => t.displayName)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)
    expect(names).not.toContain("Default Dark")
  })

  it("Light group is alphabetized and excludes Default", () => {
    const g = groupThemesForUI().find((x) => x.label === "Light")!
    const names = g.themes.map((t) => t.displayName)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(names).not.toContain("Default Light")
  })
})

describe("migrateLegacyTheme", () => {
  it('maps "light" → "default-light"', () => {
    expect(migrateLegacyTheme("light")).toBe("default-light")
  })

  it('maps "dark" → "default-dark"', () => {
    expect(migrateLegacyTheme("dark")).toBe("default-dark")
  })

  it('maps "system" to default-dark when OS prefers dark', () => {
    expect(migrateLegacyTheme("system", { prefersDark: true })).toBe("default-dark")
  })

  it('maps "system" to default-light when OS prefers light', () => {
    expect(migrateLegacyTheme("system", { prefersDark: false })).toBe("default-light")
  })

  it("passes through a known ThemeId unchanged (idempotent)", () => {
    expect(migrateLegacyTheme("catppuccin-mocha")).toBe("catppuccin-mocha")
  })

  it("falls back to DEFAULT_THEME_ID for unknown value", () => {
    expect(migrateLegacyTheme("bogus-value")).toBe(DEFAULT_THEME_ID)
  })
})
