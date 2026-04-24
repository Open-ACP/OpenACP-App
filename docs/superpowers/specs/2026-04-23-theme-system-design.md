# Theme System — Design Spec

**Date:** 2026-04-23
**Branch:** `hiru-themesystem`
**Status:** Ready for implementation plan

---

## 1. Goal

Replace the current 3-option theme picker (`light` / `dark` / `system`) with an **OpenCode-style named theme system** where each theme is a complete, fixed palette. Ship v1 with 11 curated themes; architecture must scale to many more.

### Non-goals (v1)

- No accent color override — each theme keeps its native identity.
- No per-theme light/dark toggle — themes are single, fixed palettes; light/dark is a property of the theme name (e.g., "Catppuccin Latte" vs "Catppuccin Mocha").
- No OS auto-switching — user picks exactly one theme; it stays until they change it.
- No avatar-per-theme override — avatars share defaults by mode (see §4.3).
- No terminal theming in this scope — `terminal-renderer.tsx` hardcoded colors remain untouched (flagged as follow-up work).

---

## 2. Model

Each theme is one complete palette. The list of themes contains both light-mode and dark-mode entries side by side — the user picks one, and that is it.

### 2.1 Initial theme list (v1)

| ID                  | Display name        | Mode  | Family     |
| ------------------- | ------------------- | ----- | ---------- |
| `default-light`     | Default Light       | light | Default    |
| `default-dark`      | Default Dark        | dark  | Default    |
| `amoled-dark`       | AMOLED Dark         | dark  | —          |
| `catppuccin-latte`  | Catppuccin Latte    | light | Catppuccin |
| `catppuccin-mocha`  | Catppuccin Mocha    | dark  | Catppuccin |
| `tokyo-night-dark`  | Tokyo Night Dark    | dark  | —          |
| `gruvbox-dark`      | Gruvbox Dark        | dark  | —          |
| `nord-dark`         | Nord Dark           | dark  | —          |
| `one-dark`          | One Dark            | dark  | —          |
| `github-light`      | GitHub Light        | light | GitHub     |
| `github-dark`       | GitHub Dark         | dark  | GitHub     |

`DEFAULT_THEME_ID = "default-dark"` (unchanged from current default).

### 2.2 Token coverage per theme

Each theme overrides **Core + Syntax + Markdown** tokens. Avatar tokens are **not** overridden per theme — they fall back to mode-based defaults (see §4.3).

| Token group    | Override per theme? | Count (approx) |
| -------------- | ------------------- | -------------- |
| Background     | yes                 | 5              |
| Foreground     | yes                 | 4              |
| Border         | yes                 | 5              |
| Semantic       | yes (5 × 2 weights) | 10             |
| Syntax         | yes                 | 20             |
| Markdown       | yes                 | 15             |
| Avatar         | **no** (use mode fallback) | 12             |
| Shadow         | **no** (shared from `:root`) | 6              |
| Shadcn aliases | **no** (resolve via core tokens) | 14             |

Target: ~55–60 tokens per theme file.

---

## 3. Data model

### 3.1 New file: `src/openacp/lib/themes.ts`

```ts
export type ThemeMode = "light" | "dark"

export type ThemeId =
  | "default-light"    | "default-dark"
  | "amoled-dark"
  | "catppuccin-latte" | "catppuccin-mocha"
  | "tokyo-night-dark"
  | "gruvbox-dark"
  | "nord-dark"
  | "one-dark"
  | "github-light"     | "github-dark"

export type ThemeDescriptor = {
  id: ThemeId
  displayName: string
  mode: ThemeMode
  family?: string  // optional grouping label — "Default", "Catppuccin", "GitHub"
}

export const THEMES: Record<ThemeId, ThemeDescriptor> = { /* see §2.1 */ }

export const DEFAULT_THEME_ID: ThemeId = "default-dark"
export const THEME_IDS = Object.keys(THEMES) as ThemeId[]

export function getThemeDescriptor(id: string): ThemeDescriptor {
  return THEMES[id as ThemeId] ?? THEMES[DEFAULT_THEME_ID]
}

export function groupThemesForUI(): { label: string; themes: ThemeDescriptor[] }[] {
  // Returns:
  //   [
  //     { label: "Default", themes: [default-light, default-dark] },
  //     { label: "Dark",    themes: [...all dark except Default, alphabetized] },
  //     { label: "Light",   themes: [...all light except Default, alphabetized] },
  //   ]
}
```

### 3.2 Update: `src/openacp/lib/settings-store.ts`

- `AppSettings["theme"]` changes from `"dark" | "light" | "system"` → `ThemeId`.
- `defaults.theme = DEFAULT_THEME_ID`.
- `applyTheme(themeId: ThemeId)` rewritten:
  - Look up descriptor via `getThemeDescriptor(themeId)`.
  - Set `data-theme` = themeId, `data-mode` = descriptor.mode.
  - Cache `theme-id` in localStorage (replaces `theme-hint`).
- Add migration helper `migrateLegacyTheme(oldValue: string): ThemeId` — see §5.

---

## 4. CSS architecture

### 4.1 HTML attributes

```html
<html data-theme="catppuccin-mocha" data-mode="dark">
```

- `data-theme` — selects the palette CSS block.
- `data-mode` — derived from theme's `mode` field. Drives:
  - `color-scheme: light | dark` (native widget rendering)
  - Tailwind `dark:` variant (see §4.4)
  - Avatar token fallback layer

### 4.2 Cascade order

```
1. [data-mode="light" | "dark"]   ← Avatar defaults (shared across all themes of same mode)
2. [data-theme="<id>"]             ← Core + Syntax + Markdown (per theme, overrides #1 if it defined the same tokens — which it shouldn't)
```

Themes do not override avatar tokens, so #1 wins for avatars.

### 4.3 Avatar fallback block (`theme.css`)

```css
[data-mode="light"] {
  --avatar-background-pink: #feeef8;
  --avatar-text-pink:       #cd1d8d;
  /* ...6 colors × 2 = 12 tokens */
}
[data-mode="dark"] {
  --avatar-background-pink: #501b3f;
  --avatar-text-pink:       #e34ba9;
  /* ...12 tokens */
}
```

Values mirror the current `theme.css` (no visual change to existing light/dark).

### 4.4 Tailwind `dark:` variant

`index.css` change:

```css
/* before */
@custom-variant dark ([data-theme="dark"] &);

/* after */
@custom-variant dark ([data-mode="dark"] &);
```

All existing `dark:` usages in JSX continue to work — they now key off `data-mode` which is derived from the active theme.

### 4.5 `theme.css` after refactor (~80 lines)

Contains only:
- `:root` shadows
- `:root` shadcn aliases (resolving via `--bg-*`, `--fg-*`…)
- `[data-mode="light"]` / `[data-mode="dark"]` avatar fallbacks
- `[data-font-size]` interface scale blocks

No theme-specific palette remains in this file.

### 4.6 Per-theme files (`src/openacp/styles/themes/<id>.css`)

One file per theme. Each file contains a single CSS block:

```css
/* <Theme Name> — <source URL> */
[data-theme="<id>"] {
  /* Background */  ... (5)
  /* Foreground */  ... (4)
  /* Border */      ... (5)
  /* Semantic */    ... (10)
  /* Syntax */      ... (20)
  /* Markdown */    ... (15)
}
```

Rules:
- First line: comment with theme name and canonical source URL (for audit/attribution).
- Token order: bg → fg → border → semantic → syntax → markdown.
- No avatar, shadow, or shadcn alias overrides.
- All hex values come from the upstream theme's published palette.

### 4.7 `index.css` imports

```css
@import "tailwindcss";
@custom-variant dark ([data-mode="dark"] &);

@import "./theme.css";

@import "./themes/default-light.css";
@import "./themes/default-dark.css";
@import "./themes/amoled-dark.css";
@import "./themes/catppuccin-latte.css";
@import "./themes/catppuccin-mocha.css";
@import "./themes/tokyo-night-dark.css";
@import "./themes/gruvbox-dark.css";
@import "./themes/nord-dark.css";
@import "./themes/one-dark.css";
@import "./themes/github-light.css";
@import "./themes/github-dark.css";

@import "./components.css";
@import "./utilities.css";

@theme { /* tokens registration — unchanged */ }
```

---

## 5. Migration

Existing users have `settings.theme ∈ {"light", "dark", "system"}` stored in Tauri store.

### 5.1 Mapping

| Old value | New value |
| --------- | --------- |
| `"light"`  | `"default-light"` |
| `"dark"`   | `"default-dark"`  |
| `"system"` | `"default-dark"` if `prefers-color-scheme: dark` else `"default-light"` (snapshot once) |
| any key already in `THEMES` | unchanged (pass through — migration is idempotent) |
| other (unrecognized) | `DEFAULT_THEME_ID` |

### 5.2 Strategy

- **Lazy, silent migration** in `getAllSettings()` / `applyTheme()`: when the stored value is not in `THEMES`, translate via `migrateLegacyTheme()` and persist the new value.
- No user-visible dialog or toast. Users who previously selected "dark" will see "Default Dark" as active — matches expectation.
- Console log the migration for debugging: `console.info("[theme] migrated <old> → <new>")`.

---

## 6. Settings UI (`settings-appearance.tsx`)

### 6.1 Component change

Replace `Tabs` with shadcn `Select`. `Select` already exists in `src/openacp/components/ui/select.tsx`; no new component needed.

### 6.2 Layout

```
┌───────────────────────────────────────────────────┐
│ Theme                                             │
│ Customise how OpenACP is themed                   │
│                               [Catppuccin Mocha▾] │
└───────────────────────────────────────────────────┘
```

Setting row label: `Theme`
Description: `Customise how OpenACP is themed`
Trigger placeholder: active theme's display name.

### 6.3 Dropdown structure (grouped)

```
── Default ──
  Default Light
  Default Dark
── Dark ──
  AMOLED Dark
  Catppuccin Mocha
  GitHub Dark
  Gruvbox Dark
  Nord Dark
  One Dark
  Tokyo Night Dark
── Light ──
  Catppuccin Latte
  GitHub Light
```

Grouping logic (from `groupThemesForUI()`):
1. **Default** group — always first, contains `default-light` + `default-dark`.
2. **Dark** group — all non-Default themes with `mode="dark"`, sorted alphabetically by displayName.
3. **Light** group — all non-Default themes with `mode="light"`, sorted alphabetically by displayName.

Implemented via `SelectGroup` + `SelectLabel` from shadcn.

### 6.4 Remove from UI

- The `Color scheme` row and `Light | Dark | System` Tabs control are removed entirely.
- Replaced in-place by the new `Theme` row.

---

## 7. Pre-paint script (`index.html`)

Rewrite the inline script to set both `data-theme` and `data-mode` before CSS paints.

```html
<script>
(function () {
  var id = localStorage.getItem("theme-id") || "default-dark";
  var MODES = {
    "default-light": "light", "default-dark": "dark",
    "amoled-dark": "dark",
    "catppuccin-latte": "light", "catppuccin-mocha": "dark",
    "tokyo-night-dark": "dark", "gruvbox-dark": "dark",
    "nord-dark": "dark", "one-dark": "dark",
    "github-light": "light", "github-dark": "dark"
  };
  var mode = MODES[id] || "dark";
  var r = document.documentElement;
  r.setAttribute("data-theme", id);
  r.setAttribute("data-mode", mode);
  window.__THEME_MODES__ = MODES;  // exposed for dev-mode consistency check (§9.2)
})();
</script>
```

**Maintenance rule:** when a new theme is added, the `MODES` lookup table here must be updated. This will be documented in `docs/design/DESIGN.md` and covered by a simple runtime assertion during development (see §9.3).

### 7.1 Legacy localStorage key

The previous key was `theme-hint` (stored `"light"` or `"dark"`). The new key is `theme-id` (stored a full `ThemeId`). On first run after upgrade:
- If `theme-id` is missing but `theme-hint` exists → read `theme-hint`, pick `default-light` / `default-dark` accordingly, write `theme-id`, remove `theme-hint`.
- Otherwise use default.

---

## 8. Documentation

### 8.1 `docs/design/DESIGN.md`

Add a new top-level section **"Theme System"** covering:
- Two-layer architecture diagram (`data-mode` fallback + `data-theme` override)
- Token-group table (which groups each theme overrides, which it inherits)
- Full list of v1 themes with screenshots
- Step-by-step guide to add a new theme (see §8.2)

### 8.2 Add-a-theme procedure (in DESIGN.md)

1. Create `src/openacp/styles/themes/<id>.css` using a same-mode theme as a template.
2. Fill palette from the upstream source; put the source URL in the file header comment.
3. Add entry to `THEMES` registry in `src/openacp/lib/themes.ts`.
4. Add entry to `MODES` lookup in the `index.html` pre-paint script.
5. Add `@import` line to `src/openacp/styles/index.css`.
6. Verify: open `/ds-demo.html`, switch to the new theme, check core UI, code blocks, and markdown render.

Estimated effort per theme: 15–20 minutes.

---

## 9. Testing & verification

### 9.1 Manual verification checklist (per theme)

For each of the 11 v1 themes:
- [ ] Theme loads without console errors
- [ ] Background, text, border tokens render correctly
- [ ] Semantic colors (success, warning, critical, interactive) visually distinct
- [ ] Code block syntax highlighting readable
- [ ] Markdown rendering (headings, links, quotes, code) matches theme mood
- [ ] Avatar colors remain consistent (shared mode defaults)
- [ ] Native form controls use correct `color-scheme`
- [ ] No flash-of-wrong-theme on reload (pre-paint script working)

### 9.2 Dev-mode assertions

In development builds only, on app startup (wrapped in `if (import.meta.env.DEV)`):
- Assert every `ThemeId` in `THEMES` has a matching CSS block. Implementation: iterate `THEME_IDS`, for each temporarily set `data-theme` on a detached element, read `getComputedStyle().getPropertyValue("--bg-base")`, warn if empty.
- Assert the `MODES` lookup table inlined in `index.html` matches `THEMES` registry. Implementation: at runtime, read `MODES` from a `window.__THEME_MODES__` global written by the pre-paint script, compare keys + mode values against `THEMES`, log a single warning on mismatch.

Both assertions are warnings, not hard failures — they serve as a reminder to add new themes consistently.

### 9.3 Migration test

With Tauri store pre-populated with `theme: "light"` / `"dark"` / `"system"` / `"unknown-value"`, verify:
- App loads without error
- `getAllSettings().theme` returns a valid `ThemeId`
- Settings dropdown shows the migrated theme selected

---

## 10. Out of scope / follow-up work

- **Terminal theming** — `src/openacp/components/terminal-renderer.tsx` has hardcoded xterm colors. Tracked separately; when addressed, each theme will optionally provide ANSI color overrides.
- **Inline-style hardcoded fallbacks** — minor hex fallbacks in `composer.tsx` and `review-panel.tsx` should be removed in a cleanup pass, but are not theme-specific regressions.
- **Search/filter in dropdown** — acceptable with 11 themes; when the list grows to 20+, migrate from `Select` to `Command` (shadcn combobox).
- **User-defined themes** — not in v1. If added later, introduce a `themes.user` Tauri store slice parallel to the built-in registry.
- **Accent color override** — explicitly rejected for v1. Revisit only if user feedback demands it.

---

## 11. File summary

### New files

- `src/openacp/lib/themes.ts` — registry, types, helpers
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

### Modified files

- `src/openacp/lib/settings-store.ts` — type change + migration + updated `applyTheme`
- `src/openacp/components/settings/settings-appearance.tsx` — Tabs → Select
- `src/openacp/styles/theme.css` — palette blocks removed; keep shadows, aliases, avatar mode defaults, font-size blocks
- `src/openacp/styles/index.css` — `@custom-variant dark` retargeted; `@import` the 11 theme files
- `index.html` — pre-paint script rewritten
- `docs/design/DESIGN.md` — new "Theme System" section + add-a-theme procedure

---

## 12. Open questions

None at design time. All product decisions captured above:
1. Model X (named themes, fixed palettes) ✓
2. 11 themes in v1 ✓
3. Core + Syntax + Markdown coverage ✓
4. No accent override ✓
5. No Light/Dark/System toggle — single dropdown ✓
6. Grouped dropdown (Default / Dark / Light) ✓
7. Lazy silent migration ✓
