# Color Token Migration: Legacy to shadcn/Tailwind v4

## Goal

Consolidate the dual color system (283 legacy tokens + 28 shadcn aliases) into a single shadcn-standard system. shadcn tokens become the source of truth; specialized tokens (syntax, diff, markdown, avatar) are kept as-is.

## Current State

- **283 legacy tokens** per theme (`--background-base`, `--text-strong`, `--surface-raised-base-hover`...)
- **28 shadcn aliases** that point to legacy tokens (e.g. `--background: var(--background-base)`)
- **280+ legacy usages** in app components, **70 shadcn usages** in ui/ components only
- **257 Tailwind color registrations** in `tailwind/colors.css`
- Three theme sections in `theme.css`: light (default), dark (media query), dark (explicit)

## Target State

- **shadcn tokens are source of truth** with direct values
- **Legacy tokens become backward-compat aliases** pointing to shadcn (Phase 1-2), then removed (Phase 3)
- **Extension tokens** added for granularity shadcn lacks (border-weak, foreground-weak/weaker)
- **Specialized tokens kept** unchanged (syntax, markdown, diff, avatar, shadow)
- **~400 lines** in theme.css (down from ~1000)

## Token Architecture

### Standard shadcn tokens (source of truth)

```css
:root, [data-theme="light"] {
  --background: #f8f8f8;
  --foreground: #171717;
  --card: #fcfcfc;
  --card-foreground: #171717;
  --popover: #fcfcfc;
  --popover-foreground: #171717;
  --primary: #171717;
  --primary-foreground: #fcfcfc;
  --secondary: rgba(0,0,0,0.031);
  --secondary-foreground: #171717;
  --muted: rgba(0,0,0,0.051);
  --muted-foreground: #8f8f8f;
  --accent: rgba(0,0,0,0.051);
  --accent-foreground: #171717;
  --destructive: #fc533a;
  --destructive-foreground: #fcfcfc;
  --border: rgba(0,0,0,0.162);
  --input: rgba(0,0,0,0.162);
  --ring: rgba(3,76,255,0.99);
  --radius: 0.5rem;
  --sidebar-background: #f8f8f8;
  --sidebar-foreground: #171717;
  --sidebar-primary: #171717;
  --sidebar-primary-foreground: #fcfcfc;
  --sidebar-accent: rgba(0,0,0,0.031);
  --sidebar-accent-foreground: #171717;
  --sidebar-border: #e5e5e5;
  --sidebar-ring: #a3c1fd;
}
```

### Extension tokens (shadcn naming convention)

```css
  --border-weak: #e5e5e5;
  --foreground-weak: #8f8f8f;    /* was --text-base */
  --foreground-weaker: #c7c7c7;  /* was --text-weaker */
```

### Specialized tokens (kept as-is, not migrated)

| Group | Count | Reason |
|-------|-------|--------|
| `--syntax-*` | 19 | Code highlighting in markdown component |
| `--markdown-*` | 14 | Markdown rendering styles |
| `--surface-diff-*` | 25 | Diff view colors (add/delete/hidden) |
| `--avatar-*` | 12 | Avatar color palette |
| `--shadow-*` | ~15 | Shadow tokens (not colors) |

## Migration Strategy: 3 Phases

### Phase 1: Invert aliases (zero visual change)

Flip the direction of aliases in `theme.css`:

**Before:** `--background: var(--background-base)` (shadcn points to legacy)
**After:** `--background-base: var(--background)` (legacy points to shadcn)

- Define values directly on shadcn tokens
- Keep all legacy tokens as backward-compat aliases
- Add extension tokens (`--border-weak`, `--foreground-weak`, `--foreground-weaker`)
- Update `tailwind/colors.css` to register shadcn tokens as primary

**Verification:** Build passes, app renders identically.

### Phase 2: Migrate component classes

Find-replace in `src/openacp/components/**/*.tsx` (excluding `ui/`):

| Find | Replace |
|------|---------|
| `bg-background-base` | `bg-background` |
| `bg-background-stronger` | `bg-card` |
| `bg-background-weak` | `bg-background-weak` (extension) |
| `text-text-strong` | `text-foreground` |
| `text-text-base` | `text-foreground-weak` |
| `text-text-weak` | `text-muted-foreground` |
| `text-text-weaker` | `text-foreground-weaker` |
| `text-icon-weak` | `text-foreground-weaker` |
| `text-icon-base` | `text-muted-foreground` |
| `text-text-interactive-base` | `text-primary` |
| `text-text-invert-strong` | `text-primary-foreground` |
| `border-border-base` | `border-border` |
| `border-border-weak-base` | `border-border-weak` |
| `border-border-weaker-base` | `border-border-weak/50` |
| `bg-surface-raised-base-hover` | `bg-accent` |
| `bg-surface-raised-base` | `bg-secondary` |
| `bg-surface-inset-base` | `bg-muted` |
| `bg-surface-weak` | `bg-muted` |

Also update `var()` references in:
- `src/openacp/styles/components.css` (markdown, spinner styles)
- `src/openacp/styles.css` (custom app styles)

**Verification:** Build passes, visual QA on all screens.

### Phase 3: Cleanup

- Remove legacy alias tokens from `theme.css`
- Rebuild `tailwind/colors.css` with only shadcn + extension + specialized tokens
- Remove duplicate dark theme sections (keep `@media` + `[data-theme]`, consolidate if identical)
- Target: `theme.css` ~400 lines (from ~1000)

**Verification:** Build passes, no legacy token references remain in codebase.

## Files Affected

| File | Phase | Change |
|------|-------|--------|
| `src/openacp/styles/theme.css` | 1, 3 | Invert aliases, then cleanup |
| `src/openacp/styles/tailwind/colors.css` | 1, 3 | Re-register tokens |
| `src/openacp/components/**/*.tsx` (~27 files) | 2 | Replace class names |
| `src/openacp/styles/components.css` | 2 | Update `var()` references |
| `src/openacp/styles.css` | 2 | Update `var()` references |
| `src/openacp/styles/tailwind/index.css` | 3 | Simplify @theme block |

## Risk Mitigation

- Each phase is independently deployable — app works at every step
- Phase 1 has zero visual change (pure refactor of token direction)
- Phase 2 is mechanical find-replace, verifiable by build
- Legacy aliases during transition prevent any breakage
- Specialized tokens (syntax, diff, avatar) are not touched

## Out of Scope

- Redesigning the color palette (values stay the same)
- Migrating syntax/markdown/diff/avatar tokens to shadcn
- Changing hardcoded Tailwind colors (`text-red-500`, etc.)
- Adding new themes beyond light/dark
