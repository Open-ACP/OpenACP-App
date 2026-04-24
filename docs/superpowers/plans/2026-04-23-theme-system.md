# Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `light`/`dark`/`system` theme picker with an OpenCode-style named-theme system that ships 11 curated themes in v1 and scales to many more without architectural changes.

**Architecture:** Each theme is a complete, fixed palette selected via `[data-theme="<id>"]`. A derived `[data-mode="light|dark"]` attribute drives the Tailwind `dark:` variant and shared avatar-token fallbacks. Token coverage per theme is Core + Syntax + Markdown; avatar tokens fall back to mode defaults.

**Tech Stack:** TypeScript 5 · React 19 · Tailwind CSS 4 · shadcn/ui (Select, SelectGroup) · Tauri 2 store · Vitest (unit tests for pure helpers)

**Spec:** `docs/superpowers/specs/2026-04-23-theme-system-design.md`

---

## File Map

**New:**
- `src/openacp/lib/themes.ts` — registry, types, helpers
- `src/openacp/lib/__tests__/themes.test.ts` — unit tests for registry helpers + migration
- `src/openacp/styles/themes/default-light.css`
- `src/openacp/styles/themes/default-dark.css`
- `src/openacp/styles/themes/amoled-dark.css`
- `src/openacp/styles/themes/catppuccin-latte.css`
- `src/openacp/styles/themes/catppuccin-mocha.css`
- `src/openacp/styles/themes/tokyo-night-dark.css`
- `src/openacp/styles/themes/gruvbox-dark.css`
- `src/openacp/styles/themes/nord-dark.css`
- `src/openacp/styles/themes/one-dark.css`
- `src/openacp/styles/themes/github-light.css`
- `src/openacp/styles/themes/github-dark.css`

**Modified:**
- `src/openacp/lib/settings-store.ts` — `theme` type changes to `ThemeId`; `applyTheme` rewritten; migration added
- `src/openacp/components/settings/settings-appearance.tsx` — Tabs → grouped Select
- `src/openacp/styles/theme.css` — palette blocks removed; avatar mode fallbacks added
- `src/openacp/styles/index.css` — `@custom-variant dark` retargeted; 11 theme imports added
- `index.html` — pre-paint script rewritten
- `docs/design/DESIGN.md` — new "Theme System" section + add-a-theme procedure

---

## Verification Commands

Used throughout the plan:

```bash
# Type-check + production build — runs automatically via `pnpm build`
pnpm build

# Run unit tests (Vitest)
pnpm test

# Dev server (Vite only, http://localhost:1420)
pnpm dev

# Full Tauri dev app (opens native window)
pnpm tauri dev
```

Manual UI verification happens at `http://localhost:1420/ds-demo.html` (the design-system demo page).

---

## Phase 1 — Foundation (Tasks 1–8)

At end of Phase 1: app works end-to-end with exactly 2 themes (`default-light`, `default-dark`) under the new architecture. All existing users migrate transparently.

---

### Task 1: Create theme registry with unit tests

**Files:**
- Create: `src/openacp/lib/themes.ts`
- Create: `src/openacp/lib/__tests__/themes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/openacp/lib/__tests__/themes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/openacp/lib/__tests__/themes.test.ts`
Expected: FAIL with "Cannot find module '../themes'".

- [ ] **Step 3: Implement `themes.ts`**

Create `src/openacp/lib/themes.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/openacp/lib/__tests__/themes.test.ts`
Expected: PASS, 12 tests passing.

- [ ] **Step 5: Type-check**

Run: `pnpm build`
Expected: no type errors (note: some other code still references `AppSettings["theme"]` as the old union — that's expected and will be fixed in Task 5; if `pnpm build` fails here due to theme-related type errors, they belong to Task 5's scope).

If unrelated errors appear, stop and investigate.

- [ ] **Step 6: Commit**

```bash
git add src/openacp/lib/themes.ts src/openacp/lib/__tests__/themes.test.ts
git commit -m "feat(theme): add theme registry with migration helpers"
```

---

### Task 2: Create `default-light.css` and `default-dark.css`

**Files:**
- Create: `src/openacp/styles/themes/default-light.css`
- Create: `src/openacp/styles/themes/default-dark.css`

These two files extract the existing light/dark palette content from `theme.css`, renamed with new selectors. Avatar tokens are intentionally excluded — they will live in `theme.css` as mode fallbacks (Task 3).

- [ ] **Step 1: Create `default-light.css`**

Write `src/openacp/styles/themes/default-light.css`:

```css
/* Default Light — OpenACP stock neutral light palette */
[data-theme="default-light"] {
  color-scheme: light;

  /* Background */
  --bg-base:    #f7f7f7;
  --bg-weak:    #f0f0f0;
  --bg-weaker:  #e8e8e8;
  --bg-weakest: #dedede;
  --bg-strong:  #ffffff;

  /* Foreground */
  --fg-base:    #171717;
  --fg-weak:    #525252;
  --fg-weaker:  #737373;
  --fg-weakest: #a3a3a3;

  /* Border */
  --border-base:    rgba(0, 0, 0, 0.12);
  --border-weak:    rgba(0, 0, 0, 0.08);
  --border-weaker:  rgba(0, 0, 0, 0.05);
  --border-weakest: rgba(0, 0, 0, 0.03);
  --border-strong:  rgba(0, 0, 0, 0.24);

  /* Semantic */
  --color-success:          #12c905;
  --color-success-weak:     #dbfed7;
  --color-warning:          #fbdd46;
  --color-warning-weak:     #fcf3cb;
  --color-critical:         #fc533a;
  --color-critical-weak:    #fff2f0;
  --color-info:             #a753ae;
  --color-info-weak:        #fdecfe;
  --color-interactive:      #034cff;
  --color-interactive-weak: #ecf3ff;

  /* Syntax */
  --syntax-comment:      var(--fg-weaker);
  --syntax-regexp:       var(--fg-weak);
  --syntax-string:       #006656;
  --syntax-keyword:      var(--fg-weaker);
  --syntax-primitive:    #fb4804;
  --syntax-operator:     var(--fg-weak);
  --syntax-variable:     var(--fg-base);
  --syntax-property:     #ed6dc8;
  --syntax-type:         #596600;
  --syntax-constant:     #007b80;
  --syntax-punctuation:  var(--fg-weak);
  --syntax-object:       var(--fg-base);
  --syntax-success:      #2dba26;
  --syntax-warning:      #efa72e;
  --syntax-critical:     #ed4831;
  --syntax-info:         #0092a8;
  --syntax-diff-add:     #3a8437;
  --syntax-diff-delete:  #ca2d17;
  --syntax-diff-unknown: #ff0000;

  /* Markdown */
  --markdown-heading:         #d68c27;
  --markdown-text:            #1a1a1a;
  --markdown-link:            #3b7dd8;
  --markdown-link-text:       #318795;
  --markdown-code:            #3d9a57;
  --markdown-block-quote:     #b0851f;
  --markdown-emph:            #b0851f;
  --markdown-strong:          #d68c27;
  --markdown-horizontal-rule: #8a8a8a;
  --markdown-list-item:       #3b7dd8;
  --markdown-list-enumeration:#318795;
  --markdown-image:           #3b7dd8;
  --markdown-image-text:      #318795;
  --markdown-code-block:      #1a1a1a;
}
```

- [ ] **Step 2: Create `default-dark.css`**

Write `src/openacp/styles/themes/default-dark.css`:

```css
/* Default Dark — OpenACP stock neutral dark palette */
[data-theme="default-dark"] {
  color-scheme: dark;

  /* Background */
  --bg-base:    #0a0a0a;
  --bg-weak:    #171717;
  --bg-weaker:  #1c1c1c;
  --bg-weakest: #242424;
  --bg-strong:  #121212;

  /* Foreground */
  --fg-base:    #fafafa;
  --fg-weak:    #a3a3a3;
  --fg-weaker:  #737373;
  --fg-weakest: #525252;

  /* Border */
  --border-base:    rgba(255, 255, 255, 0.14);
  --border-weak:    rgba(255, 255, 255, 0.08);
  --border-weaker:  rgba(255, 255, 255, 0.05);
  --border-weakest: rgba(255, 255, 255, 0.03);
  --border-strong:  rgba(255, 255, 255, 0.24);

  /* Semantic */
  --color-success:          #12c905;
  --color-success-weak:     #062d04;
  --color-warning:          #fcd53a;
  --color-warning-weak:     #fdf3cf;
  --color-critical:         #fc533a;
  --color-critical-weak:    #1f0603;
  --color-info:             #edb2f1;
  --color-info-weak:        #feecfe;
  --color-interactive:      #9dbefe;
  --color-interactive-weak: #091f52;

  /* Syntax */
  --syntax-comment:      var(--fg-weaker);
  --syntax-regexp:       var(--fg-weak);
  --syntax-string:       #00ceb9;
  --syntax-keyword:      var(--fg-weaker);
  --syntax-primitive:    #ffba92;
  --syntax-operator:     var(--fg-weak);
  --syntax-variable:     var(--fg-base);
  --syntax-property:     #ff9ae2;
  --syntax-type:         #ecf58c;
  --syntax-constant:     #93e9f6;
  --syntax-punctuation:  var(--fg-weak);
  --syntax-object:       var(--fg-base);
  --syntax-success:      #35c02d;
  --syntax-warning:      #f5b238;
  --syntax-critical:     #f54f36;
  --syntax-info:         #93e9f6;
  --syntax-diff-add:     #9bcd97;
  --syntax-diff-delete:  #faa494;
  --syntax-diff-unknown: #ff0000;

  /* Markdown */
  --markdown-heading:         #9d7cd8;
  --markdown-text:            #eeeeee;
  --markdown-link:            #fab283;
  --markdown-link-text:       #56b6c2;
  --markdown-code:            #7fd88f;
  --markdown-block-quote:     #e5c07b;
  --markdown-emph:            #e5c07b;
  --markdown-strong:          #f5a742;
  --markdown-horizontal-rule: #808080;
  --markdown-list-item:       #fab283;
  --markdown-list-enumeration:#56b6c2;
  --markdown-image:           #fab283;
  --markdown-image-text:      #56b6c2;
  --markdown-code-block:      #eeeeee;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/openacp/styles/themes/default-light.css src/openacp/styles/themes/default-dark.css
git commit -m "feat(theme): extract default palettes to per-theme CSS files"
```

Note: these files are not yet imported — that happens in Task 4.

---

### Task 3: Refactor `theme.css` — remove palette, add avatar mode fallbacks

**Files:**
- Modify: `src/openacp/styles/theme.css`

- [ ] **Step 1: Rewrite `theme.css` in full**

Replace the entire contents of `src/openacp/styles/theme.css` with:

```css
/* ── Design tokens ────────────────────────────────────────────────────────── */
/* Theme selection: set data-theme="<id>" + data-mode="light|dark" on <html>. */
/* See src/openacp/lib/themes.ts for the registry. Per-theme palettes live in */
/* src/openacp/styles/themes/*.css.                                           */

:root {
  --shadow-xxs-border: 0 0 0 0.5px var(--border-weak);
  --shadow-xs-border:
    0 0 0 1px var(--border-base), 0 1px 2px -1px rgba(19, 16, 16, 0.04),
    0 1px 2px 0 rgba(19, 16, 16, 0.06), 0 1px 3px 0 rgba(19, 16, 16, 0.08);
  --shadow-xs-border-base:
    0 0 0 1px var(--border-weak), 0 1px 2px -1px rgba(19, 16, 16, 0.04),
    0 1px 2px 0 rgba(19, 16, 16, 0.06), 0 1px 3px 0 rgba(19, 16, 16, 0.08);
  --shadow-xs-border-select:
    0 0 0 3px color-mix(in oklab, var(--color-interactive) 24%, transparent),
    0 0 0 1px var(--color-interactive), 0 1px 2px -1px rgba(19, 16, 16, 0.25),
    0 1px 2px 0 rgba(19, 16, 16, 0.08), 0 1px 3px 0 rgba(19, 16, 16, 0.12);
  --shadow-xs-border-focus:
    0 0 0 1px var(--border-base), 0 1px 2px -1px rgba(19, 16, 16, 0.25),
    0 1px 2px 0 rgba(19, 16, 16, 0.08), 0 1px 3px 0 rgba(19, 16, 16, 0.12),
    0 0 0 2px var(--bg-weak), 0 0 0 3px var(--color-interactive);
  --shadow-xs-border-hover:
    0 0 0 1px color-mix(in oklab, var(--color-interactive) 22%, transparent),
    0 1px 2px -1px rgba(19, 16, 16, 0.04), 0 1px 2px 0 rgba(19, 16, 16, 0.06),
    0 1px 3px 0 rgba(19, 16, 16, 0.08);
  --shadow-xs-border-critical-base: 0 0 0 1px var(--color-critical);
  --shadow-xs-border-critical-focus:
    0 0 0 3px var(--color-critical-weak), 0 0 0 1px var(--color-critical),
    0 1px 2px -1px rgba(19, 16, 16, 0.25), 0 1px 2px 0 rgba(19, 16, 16, 0.08),
    0 1px 3px 0 rgba(19, 16, 16, 0.12);
  --shadow-lg-border-base:
    0 0 0 1px var(--border-weak), 0 36px 80px 0 rgba(0, 0, 0, 0.03),
    0 13.141px 29.201px 0 rgba(0, 0, 0, 0.04),
    0 6.38px 14.177px 0 rgba(0, 0, 0, 0.05),
    0 3.127px 6.95px 0 rgba(0, 0, 0, 0.06),
    0 1.237px 2.748px 0 rgba(0, 0, 0, 0.09);

  /* shadcn/ui aliases (resolve via semantic tokens from the active theme) */
  --background: var(--bg-base);
  --foreground: var(--fg-base);
  --card: var(--bg-strong);
  --card-foreground: var(--fg-base);
  --popover: var(--bg-strong);
  --popover-foreground: var(--fg-base);
  --primary: var(--fg-base);
  --primary-foreground: var(--bg-strong);
  --secondary: var(--bg-weak);
  --secondary-foreground: var(--fg-base);
  --muted: var(--bg-weak);
  --muted-foreground: var(--fg-weaker);
  --accent: var(--bg-weak);
  --accent-foreground: var(--fg-base);
  --destructive: var(--color-critical);
  --destructive-foreground: var(--bg-strong);
  --border: var(--border-base);
  --input: var(--border-base);
  --ring: var(--color-interactive);
  --radius: 0.5rem;

  /* Sidebar aliases */
  --sidebar-background: var(--bg-base);
  --sidebar-foreground: var(--fg-base);
  --sidebar-primary: var(--fg-base);
  --sidebar-primary-foreground: var(--bg-base);
  --sidebar-accent: var(--bg-weak);
  --sidebar-accent-foreground: var(--fg-base);
  --sidebar-border: var(--border-weak);
  --sidebar-ring: var(--color-interactive);
}

/* ── Avatar — shared fallback by mode ──────────────────────────────────────── */
/* Themes do not override avatar tokens; they inherit from the mode block.      */

[data-mode="light"] {
  --avatar-background-pink:   #feeef8;
  --avatar-background-mint:   #e1fbf4;
  --avatar-background-orange: #fff1e7;
  --avatar-background-purple: #f9f1fe;
  --avatar-background-cyan:   #e7f9fb;
  --avatar-background-lime:   #eefadc;
  --avatar-text-pink:   #cd1d8d;
  --avatar-text-mint:   #147d6f;
  --avatar-text-orange: #ed5f00;
  --avatar-text-purple: #8445bc;
  --avatar-text-cyan:   #0894b3;
  --avatar-text-lime:   #5d770d;
}

[data-mode="dark"] {
  --avatar-background-pink:   #501b3f;
  --avatar-background-mint:   #033a34;
  --avatar-background-orange: #5f2a06;
  --avatar-background-purple: #432155;
  --avatar-background-cyan:   #0f3058;
  --avatar-background-lime:   #2b3711;
  --avatar-text-pink:   #e34ba9;
  --avatar-text-mint:   #95f3d9;
  --avatar-text-orange: #ff802b;
  --avatar-text-purple: #9d5bd2;
  --avatar-text-cyan:   #369eff;
  --avatar-text-lime:   #c4f042;
}

/* ── Interface scale ────────────────────────────────────────────────────────── */

[data-font-size="small"]  { font-size: 14px; }
[data-font-size="medium"] { font-size: 15px; }
[data-font-size="large"]  { font-size: 16px; }
```

- [ ] **Step 2: Commit**

```bash
git add src/openacp/styles/theme.css
git commit -m "refactor(theme): move palette out of theme.css; keep shadows + avatar mode fallbacks"
```

Note: the app is temporarily broken on this commit (no palette is imported yet). Resolved in Task 4.

---

### Task 4: Update `index.css` — retarget `dark` variant + import theme files

**Files:**
- Modify: `src/openacp/styles/index.css`

- [ ] **Step 1: Locate the `@custom-variant` line**

Read `src/openacp/styles/index.css` to confirm the current line is:

```css
@custom-variant dark ([data-theme="dark"] &);
```

- [ ] **Step 2: Retarget to `data-mode`**

Change that line to:

```css
@custom-variant dark ([data-mode="dark"] &);
```

- [ ] **Step 3: Add theme imports**

Find the line that imports `theme.css`. Immediately after it, insert (in alphabetical order, with `default-*` listed first):

```css
@import "./themes/default-light.css";
@import "./themes/default-dark.css";
```

(The other 9 theme imports are added in Tasks 9–17 as each theme is created.)

- [ ] **Step 4: Type-check + dev build**

Run: `pnpm build`
Expected: no new type errors.

- [ ] **Step 5: Commit**

```bash
git add src/openacp/styles/index.css
git commit -m "feat(theme): retarget dark variant to data-mode; import default theme files"
```

Note: the app still won't render correctly at this point because `settings-store` still sets `data-theme="dark"` (not `"default-dark"`). Fixed in Task 5.

---

### Task 5: Update `settings-store.ts` — type, `applyTheme`, migration

**Files:**
- Modify: `src/openacp/lib/settings-store.ts`

- [ ] **Step 1: Import theme registry + types**

At the top of `src/openacp/lib/settings-store.ts`, add:

```ts
import {
  type ThemeId,
  DEFAULT_THEME_ID,
  getThemeDescriptor,
  migrateLegacyTheme,
} from "./themes"
```

- [ ] **Step 2: Change the `theme` field type**

Locate the `AppSettings` type. Change:

```ts
theme: "dark" | "light" | "system"
```

to:

```ts
theme: ThemeId
```

Locate the `defaults` object. Change:

```ts
theme: "dark",
```

to:

```ts
theme: DEFAULT_THEME_ID,
```

- [ ] **Step 3: Update `getAllSettings()` to migrate legacy values**

Locate the line:

```ts
const theme = ((await s.get("theme")) as AppSettings["theme"]) ?? defaults.theme
```

Replace it with:

```ts
const rawTheme = (await s.get("theme")) as string | undefined
const theme: ThemeId =
  rawTheme == null ? defaults.theme : migrateLegacyTheme(rawTheme)
if (rawTheme != null && rawTheme !== theme) {
  await s.set("theme", theme)
  await s.save()
  console.info(`[theme] migrated "${rawTheme}" → "${theme}"`)
}
```

- [ ] **Step 4: Rewrite `applyTheme`**

Replace the existing `applyTheme` function body with:

```ts
export function applyTheme(theme: ThemeId) {
  const descriptor = getThemeDescriptor(theme)
  const root = document.documentElement
  root.setAttribute("data-theme", descriptor.id)
  root.setAttribute("data-mode", descriptor.mode)
  try {
    localStorage.setItem("theme-id", descriptor.id)
  } catch {}
}
```

- [ ] **Step 5: Type-check**

Run: `pnpm build`
Expected: should succeed. If `settings-appearance.tsx` raises type errors because it was still calling `applyTheme("system")`, those are fixed in Task 7 — acceptable to see errors only in that file.

If errors appear in files other than `settings-appearance.tsx`, stop and investigate.

- [ ] **Step 6: Run unit tests**

Run: `pnpm test`
Expected: all existing tests pass + 12 theme registry tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/openacp/lib/settings-store.ts
git commit -m "feat(theme): migrate settings-store to ThemeId with legacy value migration"
```

---

### Task 6: Update `index.html` pre-paint script

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Locate the existing pre-paint script**

Open `index.html` and find the inline `<script>` that reads `localStorage.getItem("theme-hint")` and sets `data-theme`.

- [ ] **Step 2: Replace the script body**

Replace the entire script contents (everything between `<script>` and `</script>`) with:

```js
(function () {
  var MODES = {
    "default-light":    "light",
    "default-dark":     "dark",
    "amoled-dark":      "dark",
    "catppuccin-latte": "light",
    "catppuccin-mocha": "dark",
    "tokyo-night-dark": "dark",
    "gruvbox-dark":     "dark",
    "nord-dark":        "dark",
    "one-dark":         "dark",
    "github-light":     "light",
    "github-dark":      "dark"
  };

  var id = null;
  try { id = localStorage.getItem("theme-id"); } catch (e) {}

  // Legacy migration: old key was "theme-hint" (values "light" | "dark")
  if (!id) {
    var hint = null;
    try { hint = localStorage.getItem("theme-hint"); } catch (e) {}
    if (hint === "light") id = "default-light";
    else if (hint === "dark") id = "default-dark";
    try {
      if (id) {
        localStorage.setItem("theme-id", id);
        localStorage.removeItem("theme-hint");
      }
    } catch (e) {}
  }

  if (!id || !MODES[id]) id = "default-dark";
  var mode = MODES[id];
  var r = document.documentElement;
  r.setAttribute("data-theme", id);
  r.setAttribute("data-mode", mode);
  window.__THEME_MODES__ = MODES;
})();
```

- [ ] **Step 3: Manual verification**

Run: `pnpm tauri dev`
Expected behavior:
- App launches, renders in Default Dark theme (for a fresh install or any user whose stored `theme` was `"dark"` / `"system"` on a dark-OS machine).
- Inspect the `<html>` element — it should have `data-theme="default-dark"` and `data-mode="dark"` attributes.
- Settings → Appearance still shows the old Tabs UI (light/dark/system) — that's fine, will be fixed in Task 7. Clicking the tabs may throw a type error runtime-side — acceptable until Task 7.

Hard-refresh the page a few times to verify there is no flash-of-wrong-theme.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(theme): rewrite pre-paint script for theme-id + data-mode + legacy hint migration"
```

---

### Task 7: Update Settings Appearance UI — Tabs → grouped Select

**Files:**
- Modify: `src/openacp/components/settings/settings-appearance.tsx`

- [ ] **Step 1: Read the current file to confirm structure**

Run: `cat src/openacp/components/settings/settings-appearance.tsx` to see the current imports and the SettingRow for "Color scheme".

- [ ] **Step 2: Update imports**

Remove the `Tabs`/`TabsList`/`TabsTrigger` import (it may still be used for other rows in the file — keep it if so; remove only if unused).

Add these imports near the other UI imports:

```tsx
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { type ThemeId, groupThemesForUI } from "../../lib/themes"
```

- [ ] **Step 3: Update state type**

Locate:

```tsx
const [theme, setTheme] = useState<AppSettings["theme"]>("dark")
```

Change the fallback from `"dark"` to a valid default:

```tsx
const [theme, setTheme] = useState<AppSettings["theme"]>("default-dark")
```

- [ ] **Step 4: Update `handleThemeChange` signature**

The function likely reads:

```tsx
async function handleThemeChange(value: AppSettings["theme"]) {
  setTheme(value)
  applyTheme(value)
  await setSetting("theme", value)
}
```

It already uses `AppSettings["theme"]`, which now resolves to `ThemeId`. No signature change needed. Confirm the body still calls `applyTheme(value)` and `setSetting("theme", value)` — it should.

- [ ] **Step 5: Replace the SettingRow block**

Locate the existing block that renders Tabs for color scheme:

```tsx
<SettingRow label="Color scheme" description="Choose light, dark, or system theme">
  <Tabs value={theme} onValueChange={(v) => void handleThemeChange(v as AppSettings["theme"])}>
    {/* TabsList with Light / Dark / System */}
  </Tabs>
</SettingRow>
```

Replace it with:

```tsx
<SettingRow label="Theme" description="Customise how OpenACP is themed">
  <Select
    value={theme}
    onValueChange={(v) => void handleThemeChange(v as ThemeId)}
  >
    <SelectTrigger className="w-56">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {groupThemesForUI().map((group) => (
        <SelectGroup key={group.label}>
          <SelectLabel>{group.label}</SelectLabel>
          {group.themes.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.displayName}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </SelectContent>
  </Select>
</SettingRow>
```

- [ ] **Step 6: Type-check**

Run: `pnpm build`
Expected: clean build, no type errors anywhere.

- [ ] **Step 7: Manual verification**

Run: `pnpm tauri dev`
- Open Settings → Appearance.
- The theme row shows a Select with current theme displayed.
- Click the Select — dropdown opens with three labeled groups: Default / Dark / Light. Default contains "Default Light" + "Default Dark". Dark and Light groups are empty for now (other themes land in Phase 2).
- Switch between Default Light and Default Dark — UI updates instantly, no flash.
- Close + reopen the app — chosen theme persists.

- [ ] **Step 8: Commit**

```bash
git add src/openacp/components/settings/settings-appearance.tsx
git commit -m "feat(theme): replace color-scheme tabs with grouped theme Select"
```

---

### Task 8: Phase 1 checkpoint — verification

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `pnpm build`
Expected: clean build.

- [ ] **Step 2: Unit tests**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 3: Manual theme switch smoke test**

Run: `pnpm tauri dev` (or `pnpm dev` if Rust build is slow).

In the running app:
- [ ] Open Settings → Appearance.
- [ ] Switch theme to "Default Light" → entire UI switches to light theme. No layout shift.
- [ ] Switch theme to "Default Dark" → UI switches to dark. Avatar colors visible and correct.
- [ ] Open a code block (e.g., start a chat with a sample code response, or use the ds-demo page) — syntax highlighting renders correctly in both themes.
- [ ] Hard refresh (Cmd+R in dev). No flash-of-wrong-theme on initial paint.

- [ ] **Step 4: Legacy migration smoke test**

- Quit the app.
- Open the Tauri store file for the app (typically under `~/Library/Application Support/<app-id>/store.bin` on macOS). Easier alternative: open `localStorage` in the dev tools before quitting and set `theme-id` to `"light"` (invalid in the new system — forces migration path).
- Relaunch. App should load as Default Light (migration path triggered). Check console for `[theme] migrated "light" → "default-light"`.

- [ ] **Step 5: Checkpoint commit (if any stray dev artifacts)**

Run `git status` — should be clean. If there are stray changes from verification, discard them:

```bash
git status
# If clean, skip. Otherwise investigate.
```

---

## Phase 2 — Add 9 more themes (Tasks 9–17)

Each task in this phase follows the same recipe:

1. Create `src/openacp/styles/themes/<id>.css` with the specified palette.
2. Add an `@import` line to `src/openacp/styles/index.css` (in alphabetical order, after the default files).
3. Verify the theme renders correctly.
4. Commit.

**The `THEMES` registry and pre-paint `MODES` table already list all 11 themes (set up in Tasks 1 and 6)**, so no registry changes are needed in Phase 2 — only the CSS file and import line.

All palette values below are sourced from the upstream theme's published palette (URL in each file header). If the implementer discovers a value drifts from the source, correct it during manual verification.

---

### Task 9: Add AMOLED Dark

**Files:**
- Create: `src/openacp/styles/themes/amoled-dark.css`
- Modify: `src/openacp/styles/index.css` (add 1 import line)

- [ ] **Step 1: Create CSS file**

Write `src/openacp/styles/themes/amoled-dark.css`:

```css
/* AMOLED Dark — pure-black palette for OLED displays */
[data-theme="amoled-dark"] {
  color-scheme: dark;

  --bg-base:    #000000;
  --bg-weak:    #000000;
  --bg-weaker:  #000000;
  --bg-weakest: #0a0a0a;
  --bg-strong:  #050505;

  --fg-base:    #ffffff;
  --fg-weak:    #b0b0b0;
  --fg-weaker:  #808080;
  --fg-weakest: #505050;

  --border-base:    rgba(255, 255, 255, 0.14);
  --border-weak:    rgba(255, 255, 255, 0.08);
  --border-weaker:  rgba(255, 255, 255, 0.05);
  --border-weakest: rgba(255, 255, 255, 0.03);
  --border-strong:  rgba(255, 255, 255, 0.30);

  --color-success:          #4ade80;
  --color-success-weak:     #052e16;
  --color-warning:          #facc15;
  --color-warning-weak:     #1a1400;
  --color-critical:         #f87171;
  --color-critical-weak:    #2a0808;
  --color-info:             #c084fc;
  --color-info-weak:        #1a0b2e;
  --color-interactive:      #60a5fa;
  --color-interactive-weak: #0a1a33;

  --syntax-comment:      var(--fg-weaker);
  --syntax-regexp:       var(--fg-weak);
  --syntax-string:       #4ade80;
  --syntax-keyword:      #c084fc;
  --syntax-primitive:    #facc15;
  --syntax-operator:     var(--fg-weak);
  --syntax-variable:     var(--fg-base);
  --syntax-property:     #f472b6;
  --syntax-type:         #fb923c;
  --syntax-constant:     #60a5fa;
  --syntax-punctuation:  var(--fg-weak);
  --syntax-object:       var(--fg-base);
  --syntax-success:      #4ade80;
  --syntax-warning:      #facc15;
  --syntax-critical:     #f87171;
  --syntax-info:         #60a5fa;
  --syntax-diff-add:     #22c55e;
  --syntax-diff-delete:  #ef4444;
  --syntax-diff-unknown: #ff0000;

  --markdown-heading:          #60a5fa;
  --markdown-text:             #ffffff;
  --markdown-link:             #60a5fa;
  --markdown-link-text:        #22d3ee;
  --markdown-code:             #4ade80;
  --markdown-block-quote:      #facc15;
  --markdown-emph:             #facc15;
  --markdown-strong:           #60a5fa;
  --markdown-horizontal-rule:  #404040;
  --markdown-list-item:        #60a5fa;
  --markdown-list-enumeration: #22d3ee;
  --markdown-image:            #60a5fa;
  --markdown-image-text:       #22d3ee;
  --markdown-code-block:       #ffffff;
}
```

- [ ] **Step 2: Add import**

In `src/openacp/styles/index.css`, add below the `default-dark.css` import (alphabetical position):

```css
@import "./themes/amoled-dark.css";
```

- [ ] **Step 3: Build + verify**

Run: `pnpm build` — expect clean build.
Run: `pnpm dev`, then in Settings → Appearance, switch to "AMOLED Dark". Expect pure-black background.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/styles/themes/amoled-dark.css src/openacp/styles/index.css
git commit -m "feat(theme): add AMOLED Dark theme"
```

---

### Task 10: Add Catppuccin Latte

**Files:**
- Create: `src/openacp/styles/themes/catppuccin-latte.css`
- Modify: `src/openacp/styles/index.css`

- [ ] **Step 1: Create CSS file**

Write `src/openacp/styles/themes/catppuccin-latte.css`. Palette source: https://catppuccin.com/palette/latte.

```css
/* Catppuccin Latte — https://catppuccin.com/palette/latte */
[data-theme="catppuccin-latte"] {
  color-scheme: light;

  --bg-base:    #eff1f5;  /* base */
  --bg-weak:    #e6e9ef;  /* mantle */
  --bg-weaker:  #dce0e8;  /* crust */
  --bg-weakest: #ccd0da;  /* surface0 */
  --bg-strong:  #ffffff;

  --fg-base:    #4c4f69;  /* text */
  --fg-weak:    #5c5f77;  /* subtext1 */
  --fg-weaker:  #6c6f85;  /* subtext0 */
  --fg-weakest: #8c8fa1;  /* overlay1 */

  --border-base:    rgba(76, 79, 105, 0.14);
  --border-weak:    rgba(76, 79, 105, 0.08);
  --border-weaker:  rgba(76, 79, 105, 0.05);
  --border-weakest: rgba(76, 79, 105, 0.03);
  --border-strong:  rgba(76, 79, 105, 0.24);

  --color-success:          #40a02b;  /* green */
  --color-success-weak:     #e8f5e6;
  --color-warning:          #df8e1d;  /* yellow */
  --color-warning-weak:     #fbeed3;
  --color-critical:         #d20f39;  /* red */
  --color-critical-weak:    #fadde3;
  --color-info:             #8839ef;  /* mauve */
  --color-info-weak:        #ece0fb;
  --color-interactive:      #1e66f5;  /* blue */
  --color-interactive-weak: #dae6fd;

  --syntax-comment:      #9ca0b0;  /* overlay0 */
  --syntax-regexp:       #ea76cb;  /* pink */
  --syntax-string:       #40a02b;  /* green */
  --syntax-keyword:      #8839ef;  /* mauve */
  --syntax-primitive:    #fe640b;  /* peach */
  --syntax-operator:     #179299;  /* teal */
  --syntax-variable:     #4c4f69;  /* text */
  --syntax-property:     #ea76cb;  /* pink */
  --syntax-type:         #df8e1d;  /* yellow */
  --syntax-constant:     #fe640b;  /* peach */
  --syntax-punctuation:  #7c7f93;  /* overlay2 */
  --syntax-object:       #4c4f69;
  --syntax-success:      #40a02b;
  --syntax-warning:      #df8e1d;
  --syntax-critical:     #d20f39;
  --syntax-info:         #1e66f5;
  --syntax-diff-add:     #40a02b;
  --syntax-diff-delete:  #d20f39;
  --syntax-diff-unknown: #e64553;

  --markdown-heading:          #8839ef;
  --markdown-text:             #4c4f69;
  --markdown-link:             #1e66f5;
  --markdown-link-text:        #209fb5;
  --markdown-code:             #40a02b;
  --markdown-block-quote:      #df8e1d;
  --markdown-emph:             #df8e1d;
  --markdown-strong:           #8839ef;
  --markdown-horizontal-rule:  #bcc0cc;
  --markdown-list-item:        #1e66f5;
  --markdown-list-enumeration: #209fb5;
  --markdown-image:            #1e66f5;
  --markdown-image-text:       #209fb5;
  --markdown-code-block:       #4c4f69;
}
```

- [ ] **Step 2: Add import**

In `src/openacp/styles/index.css`, add (alphabetical, after `amoled-dark.css`):

```css
@import "./themes/catppuccin-latte.css";
```

- [ ] **Step 3: Build + verify**

Run: `pnpm build`; switch to "Catppuccin Latte" in Settings. Expect warm-lavender light palette.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/styles/themes/catppuccin-latte.css src/openacp/styles/index.css
git commit -m "feat(theme): add Catppuccin Latte theme"
```

---

### Task 11: Add Catppuccin Mocha

**Files:**
- Create: `src/openacp/styles/themes/catppuccin-mocha.css`
- Modify: `src/openacp/styles/index.css`

- [ ] **Step 1: Create CSS file**

Write `src/openacp/styles/themes/catppuccin-mocha.css`. Palette source: https://catppuccin.com/palette/mocha.

```css
/* Catppuccin Mocha — https://catppuccin.com/palette/mocha */
[data-theme="catppuccin-mocha"] {
  color-scheme: dark;

  --bg-base:    #1e1e2e;  /* base */
  --bg-weak:    #181825;  /* mantle */
  --bg-weaker:  #11111b;  /* crust */
  --bg-weakest: #313244;  /* surface0 */
  --bg-strong:  #313244;

  --fg-base:    #cdd6f4;  /* text */
  --fg-weak:    #bac2de;  /* subtext1 */
  --fg-weaker:  #a6adc8;  /* subtext0 */
  --fg-weakest: #7f849c;  /* overlay1 */

  --border-base:    rgba(205, 214, 244, 0.14);
  --border-weak:    rgba(205, 214, 244, 0.08);
  --border-weaker:  rgba(205, 214, 244, 0.05);
  --border-weakest: rgba(205, 214, 244, 0.03);
  --border-strong:  rgba(205, 214, 244, 0.24);

  --color-success:          #a6e3a1;  /* green */
  --color-success-weak:     #1f2d1c;
  --color-warning:          #f9e2af;  /* yellow */
  --color-warning-weak:     #2c2716;
  --color-critical:         #f38ba8;  /* red */
  --color-critical-weak:    #2d1a20;
  --color-info:             #cba6f7;  /* mauve */
  --color-info-weak:        #241b33;
  --color-interactive:      #89b4fa;  /* blue */
  --color-interactive-weak: #152038;

  --syntax-comment:      #6c7086;  /* overlay0 */
  --syntax-regexp:       #f5c2e7;  /* pink */
  --syntax-string:       #a6e3a1;  /* green */
  --syntax-keyword:      #cba6f7;  /* mauve */
  --syntax-primitive:    #fab387;  /* peach */
  --syntax-operator:     #94e2d5;  /* teal */
  --syntax-variable:     #cdd6f4;  /* text */
  --syntax-property:     #f5c2e7;  /* pink */
  --syntax-type:         #f9e2af;  /* yellow */
  --syntax-constant:     #fab387;  /* peach */
  --syntax-punctuation:  #9399b2;  /* overlay2 */
  --syntax-object:       #cdd6f4;
  --syntax-success:      #a6e3a1;
  --syntax-warning:      #f9e2af;
  --syntax-critical:     #f38ba8;
  --syntax-info:         #89b4fa;
  --syntax-diff-add:     #a6e3a1;
  --syntax-diff-delete:  #f38ba8;
  --syntax-diff-unknown: #eba0ac;

  --markdown-heading:          #cba6f7;
  --markdown-text:             #cdd6f4;
  --markdown-link:             #89b4fa;
  --markdown-link-text:        #74c7ec;
  --markdown-code:             #a6e3a1;
  --markdown-block-quote:      #f9e2af;
  --markdown-emph:             #f9e2af;
  --markdown-strong:           #cba6f7;
  --markdown-horizontal-rule:  #585b70;
  --markdown-list-item:        #89b4fa;
  --markdown-list-enumeration: #74c7ec;
  --markdown-image:            #89b4fa;
  --markdown-image-text:       #74c7ec;
  --markdown-code-block:       #cdd6f4;
}
```

- [ ] **Step 2: Add import**

In `src/openacp/styles/index.css`:

```css
@import "./themes/catppuccin-mocha.css";
```

- [ ] **Step 3: Build + verify**

Switch to "Catppuccin Mocha". Expect the signature deep-lavender background with pastel accents.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/styles/themes/catppuccin-mocha.css src/openacp/styles/index.css
git commit -m "feat(theme): add Catppuccin Mocha theme"
```

---

### Task 12: Add Tokyo Night Dark

**Files:**
- Create: `src/openacp/styles/themes/tokyo-night-dark.css`
- Modify: `src/openacp/styles/index.css`

- [ ] **Step 1: Create CSS file**

Palette source: https://github.com/enkia/tokyo-night-vscode-theme (Tokyo Night storm/night variant).

```css
/* Tokyo Night Dark — https://github.com/enkia/tokyo-night-vscode-theme */
[data-theme="tokyo-night-dark"] {
  color-scheme: dark;

  --bg-base:    #1a1b26;
  --bg-weak:    #16161e;
  --bg-weaker:  #13131a;
  --bg-weakest: #24253a;
  --bg-strong:  #24253a;

  --fg-base:    #c0caf5;
  --fg-weak:    #a9b1d6;
  --fg-weaker:  #737aa2;
  --fg-weakest: #565f89;

  --border-base:    rgba(192, 202, 245, 0.14);
  --border-weak:    rgba(192, 202, 245, 0.08);
  --border-weaker:  rgba(192, 202, 245, 0.05);
  --border-weakest: rgba(192, 202, 245, 0.03);
  --border-strong:  rgba(192, 202, 245, 0.24);

  --color-success:          #9ece6a;
  --color-success-weak:     #1b2a18;
  --color-warning:          #e0af68;
  --color-warning-weak:     #2a2116;
  --color-critical:         #f7768e;
  --color-critical-weak:    #2d1820;
  --color-info:             #bb9af7;
  --color-info-weak:        #231b33;
  --color-interactive:      #7aa2f7;
  --color-interactive-weak: #131d33;

  --syntax-comment:      #565f89;
  --syntax-regexp:       #f7768e;
  --syntax-string:       #9ece6a;
  --syntax-keyword:      #bb9af7;
  --syntax-primitive:    #ff9e64;
  --syntax-operator:     #89ddff;
  --syntax-variable:     #c0caf5;
  --syntax-property:     #7dcfff;
  --syntax-type:         #2ac3de;
  --syntax-constant:     #ff9e64;
  --syntax-punctuation:  #89ddff;
  --syntax-object:       #c0caf5;
  --syntax-success:      #9ece6a;
  --syntax-warning:      #e0af68;
  --syntax-critical:     #f7768e;
  --syntax-info:         #7aa2f7;
  --syntax-diff-add:     #9ece6a;
  --syntax-diff-delete:  #f7768e;
  --syntax-diff-unknown: #ff9e64;

  --markdown-heading:          #bb9af7;
  --markdown-text:             #c0caf5;
  --markdown-link:             #7aa2f7;
  --markdown-link-text:        #7dcfff;
  --markdown-code:             #9ece6a;
  --markdown-block-quote:      #e0af68;
  --markdown-emph:             #e0af68;
  --markdown-strong:           #bb9af7;
  --markdown-horizontal-rule:  #565f89;
  --markdown-list-item:        #7aa2f7;
  --markdown-list-enumeration: #7dcfff;
  --markdown-image:            #7aa2f7;
  --markdown-image-text:       #7dcfff;
  --markdown-code-block:       #c0caf5;
}
```

- [ ] **Step 2: Add import**

```css
@import "./themes/tokyo-night-dark.css";
```

- [ ] **Step 3: Build + verify**

Switch to "Tokyo Night Dark". Expect deep navy-black with cool blues and soft purples.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/styles/themes/tokyo-night-dark.css src/openacp/styles/index.css
git commit -m "feat(theme): add Tokyo Night Dark theme"
```

---

### Task 13: Add Gruvbox Dark

**Files:**
- Create: `src/openacp/styles/themes/gruvbox-dark.css`
- Modify: `src/openacp/styles/index.css`

- [ ] **Step 1: Create CSS file**

Palette source: https://github.com/morhetz/gruvbox.

```css
/* Gruvbox Dark — https://github.com/morhetz/gruvbox */
[data-theme="gruvbox-dark"] {
  color-scheme: dark;

  --bg-base:    #282828;  /* bg0 */
  --bg-weak:    #3c3836;  /* bg1 */
  --bg-weaker:  #504945;  /* bg2 */
  --bg-weakest: #665c54;  /* bg3 */
  --bg-strong:  #32302f;  /* bg0_s */

  --fg-base:    #ebdbb2;  /* fg1 */
  --fg-weak:    #d5c4a1;  /* fg2 */
  --fg-weaker:  #bdae93;  /* fg3 */
  --fg-weakest: #a89984;  /* fg4 */

  --border-base:    rgba(235, 219, 178, 0.14);
  --border-weak:    rgba(235, 219, 178, 0.08);
  --border-weaker:  rgba(235, 219, 178, 0.05);
  --border-weakest: rgba(235, 219, 178, 0.03);
  --border-strong:  rgba(235, 219, 178, 0.28);

  --color-success:          #b8bb26;
  --color-success-weak:     #1f2208;
  --color-warning:          #fabd2f;
  --color-warning-weak:     #2a2108;
  --color-critical:         #fb4934;
  --color-critical-weak:    #2d110c;
  --color-info:             #d3869b;
  --color-info-weak:        #2a1820;
  --color-interactive:      #83a598;
  --color-interactive-weak: #1a2320;

  --syntax-comment:      #928374;
  --syntax-regexp:       #fb4934;
  --syntax-string:       #b8bb26;
  --syntax-keyword:      #fb4934;
  --syntax-primitive:    #fe8019;
  --syntax-operator:     #fe8019;
  --syntax-variable:     #ebdbb2;
  --syntax-property:     #8ec07c;
  --syntax-type:         #fabd2f;
  --syntax-constant:     #d3869b;
  --syntax-punctuation:  #a89984;
  --syntax-object:       #ebdbb2;
  --syntax-success:      #b8bb26;
  --syntax-warning:      #fabd2f;
  --syntax-critical:     #fb4934;
  --syntax-info:         #83a598;
  --syntax-diff-add:     #b8bb26;
  --syntax-diff-delete:  #fb4934;
  --syntax-diff-unknown: #fe8019;

  --markdown-heading:          #fabd2f;
  --markdown-text:             #ebdbb2;
  --markdown-link:             #83a598;
  --markdown-link-text:        #8ec07c;
  --markdown-code:             #b8bb26;
  --markdown-block-quote:      #d3869b;
  --markdown-emph:             #d3869b;
  --markdown-strong:           #fabd2f;
  --markdown-horizontal-rule:  #665c54;
  --markdown-list-item:        #83a598;
  --markdown-list-enumeration: #8ec07c;
  --markdown-image:            #83a598;
  --markdown-image-text:       #8ec07c;
  --markdown-code-block:       #ebdbb2;
}
```

- [ ] **Step 2: Add import**

```css
@import "./themes/gruvbox-dark.css";
```

- [ ] **Step 3: Build + verify**

Switch to "Gruvbox Dark". Expect warm retro browns/greens/yellows.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/styles/themes/gruvbox-dark.css src/openacp/styles/index.css
git commit -m "feat(theme): add Gruvbox Dark theme"
```

---

### Task 14: Add Nord Dark

**Files:**
- Create: `src/openacp/styles/themes/nord-dark.css`
- Modify: `src/openacp/styles/index.css`

- [ ] **Step 1: Create CSS file**

Palette source: https://www.nordtheme.com/docs/colors-and-palettes.

```css
/* Nord Dark — https://www.nordtheme.com/docs/colors-and-palettes */
[data-theme="nord-dark"] {
  color-scheme: dark;

  --bg-base:    #2e3440;  /* nord0 */
  --bg-weak:    #3b4252;  /* nord1 */
  --bg-weaker:  #434c5e;  /* nord2 */
  --bg-weakest: #4c566a;  /* nord3 */
  --bg-strong:  #3b4252;

  --fg-base:    #eceff4;  /* nord6 */
  --fg-weak:    #e5e9f0;  /* nord5 */
  --fg-weaker:  #d8dee9;  /* nord4 */
  --fg-weakest: #7b88a1;

  --border-base:    rgba(216, 222, 233, 0.14);
  --border-weak:    rgba(216, 222, 233, 0.08);
  --border-weaker:  rgba(216, 222, 233, 0.05);
  --border-weakest: rgba(216, 222, 233, 0.03);
  --border-strong:  rgba(216, 222, 233, 0.24);

  --color-success:          #a3be8c;  /* nord14 */
  --color-success-weak:     #1f2a1a;
  --color-warning:          #ebcb8b;  /* nord13 */
  --color-warning-weak:     #2a2518;
  --color-critical:         #bf616a;  /* nord11 */
  --color-critical-weak:    #2a161a;
  --color-info:             #b48ead;  /* nord15 */
  --color-info-weak:        #2a1f28;
  --color-interactive:      #88c0d0;  /* nord8 */
  --color-interactive-weak: #1d2a30;

  --syntax-comment:      #616e88;
  --syntax-regexp:       #bf616a;
  --syntax-string:       #a3be8c;
  --syntax-keyword:      #81a1c1;
  --syntax-primitive:    #d08770;
  --syntax-operator:     #81a1c1;
  --syntax-variable:     #eceff4;
  --syntax-property:     #8fbcbb;
  --syntax-type:         #8fbcbb;
  --syntax-constant:     #d08770;
  --syntax-punctuation:  #d8dee9;
  --syntax-object:       #eceff4;
  --syntax-success:      #a3be8c;
  --syntax-warning:      #ebcb8b;
  --syntax-critical:     #bf616a;
  --syntax-info:         #88c0d0;
  --syntax-diff-add:     #a3be8c;
  --syntax-diff-delete:  #bf616a;
  --syntax-diff-unknown: #d08770;

  --markdown-heading:          #88c0d0;
  --markdown-text:             #eceff4;
  --markdown-link:             #88c0d0;
  --markdown-link-text:        #8fbcbb;
  --markdown-code:             #a3be8c;
  --markdown-block-quote:      #ebcb8b;
  --markdown-emph:             #ebcb8b;
  --markdown-strong:           #88c0d0;
  --markdown-horizontal-rule:  #4c566a;
  --markdown-list-item:        #88c0d0;
  --markdown-list-enumeration: #8fbcbb;
  --markdown-image:            #88c0d0;
  --markdown-image-text:       #8fbcbb;
  --markdown-code-block:       #eceff4;
}
```

- [ ] **Step 2: Add import**

```css
@import "./themes/nord-dark.css";
```

- [ ] **Step 3: Build + verify**

Switch to "Nord Dark". Expect arctic blue-grey palette.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/styles/themes/nord-dark.css src/openacp/styles/index.css
git commit -m "feat(theme): add Nord Dark theme"
```

---

### Task 15: Add One Dark

**Files:**
- Create: `src/openacp/styles/themes/one-dark.css`
- Modify: `src/openacp/styles/index.css`

- [ ] **Step 1: Create CSS file**

Palette source: https://github.com/atom/atom/tree/master/packages/one-dark-ui + https://github.com/atom/atom/tree/master/packages/one-dark-syntax.

```css
/* One Dark — https://github.com/atom/atom (one-dark-ui + one-dark-syntax) */
[data-theme="one-dark"] {
  color-scheme: dark;

  --bg-base:    #282c34;
  --bg-weak:    #21252b;
  --bg-weaker:  #1b1d23;
  --bg-weakest: #3e4451;
  --bg-strong:  #2c313a;

  --fg-base:    #abb2bf;
  --fg-weak:    #9da5b4;
  --fg-weaker:  #7f848e;
  --fg-weakest: #5c6370;

  --border-base:    rgba(171, 178, 191, 0.14);
  --border-weak:    rgba(171, 178, 191, 0.08);
  --border-weaker:  rgba(171, 178, 191, 0.05);
  --border-weakest: rgba(171, 178, 191, 0.03);
  --border-strong:  rgba(171, 178, 191, 0.24);

  --color-success:          #98c379;
  --color-success-weak:     #1e281a;
  --color-warning:          #e5c07b;
  --color-warning-weak:     #2a2516;
  --color-critical:         #e06c75;
  --color-critical-weak:    #2c191b;
  --color-info:             #c678dd;
  --color-info-weak:        #291a33;
  --color-interactive:      #61afef;
  --color-interactive-weak: #132536;

  --syntax-comment:      #5c6370;
  --syntax-regexp:       #e06c75;
  --syntax-string:       #98c379;
  --syntax-keyword:      #c678dd;
  --syntax-primitive:    #d19a66;
  --syntax-operator:     #56b6c2;
  --syntax-variable:     #abb2bf;
  --syntax-property:     #e06c75;
  --syntax-type:         #e5c07b;
  --syntax-constant:     #d19a66;
  --syntax-punctuation:  #abb2bf;
  --syntax-object:       #abb2bf;
  --syntax-success:      #98c379;
  --syntax-warning:      #e5c07b;
  --syntax-critical:     #e06c75;
  --syntax-info:         #61afef;
  --syntax-diff-add:     #98c379;
  --syntax-diff-delete:  #e06c75;
  --syntax-diff-unknown: #d19a66;

  --markdown-heading:          #c678dd;
  --markdown-text:             #abb2bf;
  --markdown-link:             #61afef;
  --markdown-link-text:        #56b6c2;
  --markdown-code:             #98c379;
  --markdown-block-quote:      #e5c07b;
  --markdown-emph:             #e5c07b;
  --markdown-strong:           #c678dd;
  --markdown-horizontal-rule:  #3e4451;
  --markdown-list-item:        #61afef;
  --markdown-list-enumeration: #56b6c2;
  --markdown-image:            #61afef;
  --markdown-image-text:       #56b6c2;
  --markdown-code-block:       #abb2bf;
}
```

- [ ] **Step 2: Add import**

```css
@import "./themes/one-dark.css";
```

- [ ] **Step 3: Build + verify**

Switch to "One Dark". Expect the signature Atom slate-blue palette.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/styles/themes/one-dark.css src/openacp/styles/index.css
git commit -m "feat(theme): add One Dark theme"
```

---

### Task 16: Add GitHub Light

**Files:**
- Create: `src/openacp/styles/themes/github-light.css`
- Modify: `src/openacp/styles/index.css`

- [ ] **Step 1: Create CSS file**

Palette source: https://primer.style/foundations/color (GitHub Primer light theme).

```css
/* GitHub Light — https://primer.style/foundations/color */
[data-theme="github-light"] {
  color-scheme: light;

  --bg-base:    #ffffff;
  --bg-weak:    #f6f8fa;
  --bg-weaker:  #eaeef2;
  --bg-weakest: #d0d7de;
  --bg-strong:  #ffffff;

  --fg-base:    #1f2328;
  --fg-weak:    #57606a;
  --fg-weaker:  #6e7781;
  --fg-weakest: #8c959f;

  --border-base:    #d0d7de;
  --border-weak:    #d8dee4;
  --border-weaker:  #eaeef2;
  --border-weakest: #f6f8fa;
  --border-strong:  #8c959f;

  --color-success:          #1a7f37;
  --color-success-weak:     #dafbe1;
  --color-warning:          #9a6700;
  --color-warning-weak:     #fff8c5;
  --color-critical:         #cf222e;
  --color-critical-weak:    #ffebe9;
  --color-info:             #8250df;
  --color-info-weak:        #fbefff;
  --color-interactive:      #0969da;
  --color-interactive-weak: #ddf4ff;

  --syntax-comment:      #6e7781;
  --syntax-regexp:       #116329;
  --syntax-string:       #0a3069;
  --syntax-keyword:      #cf222e;
  --syntax-primitive:    #0550ae;
  --syntax-operator:     #cf222e;
  --syntax-variable:     #953800;
  --syntax-property:     #116329;
  --syntax-type:         #953800;
  --syntax-constant:     #0550ae;
  --syntax-punctuation:  #24292f;
  --syntax-object:       #1f2328;
  --syntax-success:      #1a7f37;
  --syntax-warning:      #9a6700;
  --syntax-critical:     #cf222e;
  --syntax-info:         #0969da;
  --syntax-diff-add:     #1a7f37;
  --syntax-diff-delete:  #cf222e;
  --syntax-diff-unknown: #9a6700;

  --markdown-heading:          #0969da;
  --markdown-text:             #1f2328;
  --markdown-link:             #0969da;
  --markdown-link-text:        #1a7f37;
  --markdown-code:             #1a7f37;
  --markdown-block-quote:      #57606a;
  --markdown-emph:             #57606a;
  --markdown-strong:           #1f2328;
  --markdown-horizontal-rule:  #d0d7de;
  --markdown-list-item:        #0969da;
  --markdown-list-enumeration: #1a7f37;
  --markdown-image:            #0969da;
  --markdown-image-text:       #1a7f37;
  --markdown-code-block:       #1f2328;
}
```

- [ ] **Step 2: Add import**

```css
@import "./themes/github-light.css";
```

- [ ] **Step 3: Build + verify**

Switch to "GitHub Light". Expect clean GitHub-style white with classic blue accents.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/styles/themes/github-light.css src/openacp/styles/index.css
git commit -m "feat(theme): add GitHub Light theme"
```

---

### Task 17: Add GitHub Dark

**Files:**
- Create: `src/openacp/styles/themes/github-dark.css`
- Modify: `src/openacp/styles/index.css`

- [ ] **Step 1: Create CSS file**

Palette source: https://primer.style/foundations/color (GitHub Primer dark theme).

```css
/* GitHub Dark — https://primer.style/foundations/color */
[data-theme="github-dark"] {
  color-scheme: dark;

  --bg-base:    #0d1117;
  --bg-weak:    #161b22;
  --bg-weaker:  #010409;
  --bg-weakest: #21262d;
  --bg-strong:  #161b22;

  --fg-base:    #c9d1d9;
  --fg-weak:    #8b949e;
  --fg-weaker:  #6e7681;
  --fg-weakest: #484f58;

  --border-base:    #30363d;
  --border-weak:    #21262d;
  --border-weaker:  #161b22;
  --border-weakest: #0d1117;
  --border-strong:  #484f58;

  --color-success:          #3fb950;
  --color-success-weak:     #0c2913;
  --color-warning:          #d29922;
  --color-warning-weak:     #282006;
  --color-critical:         #f85149;
  --color-critical-weak:    #2b0d0f;
  --color-info:             #a371f7;
  --color-info-weak:        #1d1433;
  --color-interactive:      #58a6ff;
  --color-interactive-weak: #0c1d33;

  --syntax-comment:      #8b949e;
  --syntax-regexp:       #7ee787;
  --syntax-string:       #a5d6ff;
  --syntax-keyword:      #ff7b72;
  --syntax-primitive:    #79c0ff;
  --syntax-operator:     #ff7b72;
  --syntax-variable:     #ffa657;
  --syntax-property:     #7ee787;
  --syntax-type:         #ffa657;
  --syntax-constant:     #79c0ff;
  --syntax-punctuation:  #c9d1d9;
  --syntax-object:       #c9d1d9;
  --syntax-success:      #3fb950;
  --syntax-warning:      #d29922;
  --syntax-critical:     #f85149;
  --syntax-info:         #58a6ff;
  --syntax-diff-add:     #3fb950;
  --syntax-diff-delete:  #f85149;
  --syntax-diff-unknown: #d29922;

  --markdown-heading:          #58a6ff;
  --markdown-text:             #c9d1d9;
  --markdown-link:             #58a6ff;
  --markdown-link-text:        #3fb950;
  --markdown-code:             #3fb950;
  --markdown-block-quote:      #8b949e;
  --markdown-emph:             #8b949e;
  --markdown-strong:           #c9d1d9;
  --markdown-horizontal-rule:  #30363d;
  --markdown-list-item:        #58a6ff;
  --markdown-list-enumeration: #3fb950;
  --markdown-image:            #58a6ff;
  --markdown-image-text:       #3fb950;
  --markdown-code-block:       #c9d1d9;
}
```

- [ ] **Step 2: Add import**

```css
@import "./themes/github-dark.css";
```

- [ ] **Step 3: Build + verify**

Switch to "GitHub Dark". Expect deep navy-black with Primer accents.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/styles/themes/github-dark.css src/openacp/styles/index.css
git commit -m "feat(theme): add GitHub Dark theme"
```

---

## Phase 3 — Polish (Tasks 18–19)

---

### Task 18: Add dev-mode consistency assertions

**Files:**
- Modify: `src/openacp/lib/themes.ts`
- Modify: `src/openacp/app.tsx` (add a call at app mount)

- [ ] **Step 1: Add assertion helpers to `themes.ts`**

At the bottom of `src/openacp/lib/themes.ts`, append:

```ts
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
```

- [ ] **Step 2: Call `verifyThemeRegistry` at app mount**

Locate `src/openacp/app.tsx`. Find the import of `applyTheme` and add `verifyThemeRegistry`:

```tsx
import { applyTheme } from "./lib/settings-store"
import { verifyThemeRegistry } from "./lib/themes"
```

Find the location where `applyTheme(settings.theme)` is called (around line 684 per the current state). Add a one-time dev-mode check nearby — the easiest is to wrap the existing `useEffect` that mounts theme-related setup (or add a new one):

```tsx
useEffect(() => {
  if (import.meta.env.DEV) verifyThemeRegistry()
}, [])
```

Place this effect near the top of the component body alongside other mount effects.

- [ ] **Step 3: Type-check**

Run: `pnpm build`
Expected: clean.

- [ ] **Step 4: Manual verification**

Run: `pnpm dev`. Open browser console. On first load, no `[theme]` warnings should appear (everything is consistent).

To verify the assertion works, temporarily break it by removing one entry from `MODES` in `index.html`, reload, check for `[theme] MODES missing ids: ...` warning, then restore.

- [ ] **Step 5: Commit**

```bash
git add src/openacp/lib/themes.ts src/openacp/app.tsx
git commit -m "feat(theme): add dev-mode registry consistency assertions"
```

---

### Task 19: Update `docs/design/DESIGN.md`

**Files:**
- Modify: `docs/design/DESIGN.md`

- [ ] **Step 1: Locate insertion point**

Read `docs/design/DESIGN.md` and find the end of the top-level "Design Tokens" section (or the most logical place for a sibling section on theming).

- [ ] **Step 2: Add "Theme System" section**

Append (adjust heading level to match the file's hierarchy):

```markdown
## Theme System

OpenACP ships with a registry of named themes. A theme is a complete, fixed palette — users pick one from a dropdown in Settings → Appearance. There is no separate light/dark toggle; the mode is a property of the theme (e.g. "Catppuccin Latte" is the light one).

### Architecture

Two HTML attributes drive styling:

- `data-theme="<id>"` — selects the palette CSS block in `src/openacp/styles/themes/<id>.css`
- `data-mode="light" | "dark"` — derived from the theme's `mode` field; drives:
  - `color-scheme` (native widget rendering)
  - Tailwind `dark:` variant (via `@custom-variant dark ([data-mode="dark"] &)`)
  - Avatar-token fallbacks (`[data-mode="light"]` / `[data-mode="dark"]` blocks in `theme.css`)

### Token coverage

Each theme overrides three groups (~55 tokens):

- **Background** (5), **Foreground** (4), **Border** (5)
- **Semantic** (5 colors × 2 weights = 10)
- **Syntax** (~20)
- **Markdown** (~15)

Avatar tokens are **not** overridden per theme — they fall back to the shared `[data-mode]` block so agent/user colors stay consistent across theme changes.

Shadows, shadcn aliases, and radii are theme-independent and live in `theme.css` at `:root`.

### Registry (v1)

| ID                  | Display name       | Mode  |
| ------------------- | ------------------ | ----- |
| `default-light`     | Default Light      | light |
| `default-dark`      | Default Dark       | dark  |
| `amoled-dark`       | AMOLED Dark        | dark  |
| `catppuccin-latte`  | Catppuccin Latte   | light |
| `catppuccin-mocha`  | Catppuccin Mocha   | dark  |
| `tokyo-night-dark`  | Tokyo Night Dark   | dark  |
| `gruvbox-dark`      | Gruvbox Dark       | dark  |
| `nord-dark`         | Nord Dark          | dark  |
| `one-dark`          | One Dark           | dark  |
| `github-light`      | GitHub Light       | light |
| `github-dark`       | GitHub Dark        | dark  |

Registry source: `src/openacp/lib/themes.ts`.

### Adding a new theme

1. Create `src/openacp/styles/themes/<id>.css`. Start from a same-mode theme as a template. Put the source URL in the file's header comment.
2. Fill palette values from the upstream source. Cover Core + Syntax + Markdown. **Do not override avatar tokens.**
3. Add an entry to `THEMES` in `src/openacp/lib/themes.ts`.
4. Add an entry to the `MODES` lookup in the inline script in `index.html`.
5. Add an `@import` line to `src/openacp/styles/index.css` (alphabetical, after default themes).
6. Run `pnpm dev`, open `/ds-demo.html`, switch to the new theme, verify:
   - Core UI renders correctly
   - Code blocks have readable syntax highlighting
   - Markdown (headings, links, code, quotes) matches theme mood
   - Avatars remain consistent

Estimated time: ~15–20 minutes per theme.

### Dev-mode checks

On startup in development builds, `verifyThemeRegistry()` (in `themes.ts`) probes each theme's CSS block and verifies the `MODES` lookup table in `index.html` stays in sync with the registry. Warnings — not errors — appear in the console.
```

- [ ] **Step 3: Commit**

```bash
git add docs/design/DESIGN.md
git commit -m "docs(theme): document theme system architecture and add-a-theme procedure"
```

---

## Final checkpoint

- [ ] **Step 1: Full build**

```bash
pnpm build
```
Expected: clean.

- [ ] **Step 2: All tests**

```bash
pnpm test
```
Expected: all pass.

- [ ] **Step 3: Switch through every theme manually**

Run `pnpm tauri dev`. In Settings → Appearance, cycle through all 11 themes:

- [ ] Default Light
- [ ] Default Dark
- [ ] AMOLED Dark
- [ ] Catppuccin Latte
- [ ] Catppuccin Mocha
- [ ] Tokyo Night Dark
- [ ] Gruvbox Dark
- [ ] Nord Dark
- [ ] One Dark
- [ ] GitHub Light
- [ ] GitHub Dark

For each: no console errors, no layout shifts, avatars render, code blocks highlight, markdown looks right.

- [ ] **Step 4: Branch review**

```bash
git log --oneline origin/develop..HEAD
```

Expect ~19 commits telling a coherent story: registry → foundation → 9 themes → polish → docs.

- [ ] **Step 5: Push**

```bash
git push -u origin hiru-themesystem
```

Then open a PR into `develop` using the project's normal workflow.

---

## Notes for the implementer

- **Palette verification:** The hex values in Phase 2 are sourced from well-known upstream theme palettes (URLs in every file header). If you notice a value that doesn't match the canonical source during manual verification, correct it in-place — do not open a separate task. This is considered part of normal verification work.
- **Build failures between Tasks 3 and 7:** The CSS/settings migration is intentionally split into atomic commits. Between Task 3 and Task 5, `pnpm dev` may render a broken-looking theme because `settings-store` still sets `data-theme="dark"` while `theme.css` no longer has that block. This is expected — complete through Task 7 before judging correctness.
- **No snapshots or visual-regression tests:** CSS/visual changes are verified manually. The unit tests in Task 1 cover the pure registry/migration logic. Do not add screenshot tests unless the project acquires that infrastructure separately.
- **No Co-Authored-By lines** in commit messages (project convention).
- **Commit focused changes:** one logical change per commit. Don't batch unrelated edits.
