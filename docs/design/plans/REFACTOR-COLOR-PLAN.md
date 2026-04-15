# Color System Refactor Plan

**Status**: ✅ Completed 2026-04-13 across 10 commits on `develop` (2c37830 → 0dac582). Remaining work: visual smoke test in `pnpm tauri dev` and DESIGN.md update.
**Goal**: Collapse the sprawling color token system into a tight, predictable scheme — 3 neutral families (background, foreground, border) × 4 levels each, plus a flat semantic palette and the existing avatar/syntax/markdown tokens.

## Commit history

| # | SHA | Commit |
|---|---|---|
| 1 | 2c37830 | feat(theme): add new bg/fg/border/semantic color tokens (additive) |
| 2 | 4164338 | refactor(theme): migrate surface-* status colors to new --color-* |
| 3 | c5c87ef | refactor(theme): migrate surface-* elevated/inset to bg-* |
| 4 | d169817 | refactor(theme): migrate bg-background-* utilities to bg-bg-* |
| 5 | b154dc6 | refactor(theme): migrate text-foreground-weak/weaker to text-fg-* |
| 6 | 4c4cd02 | refactor(theme): point shadcn aliases at new bg/fg/color tokens |
| 6.5 | 7213c8a | refactor(theme): migrate straggler --icon-* / --color-text-interactive-base / --border-weak-base refs |
| 7 | f19d6a9 | chore(theme): rewrite theme.css with lean token surface (-680 lines) |
| 8 | 486791d | chore(theme): prune index.css @theme color registrations (-200 lines) |
| 9 | 0dac582 | refactor(ds-demo): rebuild Colors page for new flat token scheme |

## Result

- `src/openacp/styles/theme.css`: 1043 → 370 lines
- `src/openacp/styles/index.css` @theme block: ~270 → ~30 entries
- ds-demo Colors page: 23 sections / ~200 swatches → 9 sections / ~88 swatches
- Zero circular `--border-base` refs, one source of truth per token.

---

## Target token surface

### Background (5 tokens — 4 levels + 1 elevated)

| Token | Role | Light | Dark |
|---|---|---|---|
| `--bg-base` | Page background, app shell, sidebar | `#f8f8f8` | `#101010` |
| `--bg-weak` | Hover row, alt panel, input bg | `#f3f3f3` | `#181818` |
| `--bg-weaker` | Selected row, deeper alt | `#ededed` | `#1e1e1e` |
| `--bg-weakest` | Pressed/active state, deepest | `#e5e5e5` | `#252525` |
| `--bg-strong` | Elevated surface — card / popover / dropdown / modal | `#ffffff` | `#1c1c1c` |

Tailwind utilities: `bg-bg-base`, `bg-bg-weak`, `bg-bg-strong`, …

### Foreground (4 tokens)

| Token | Role | Light | Dark |
|---|---|---|---|
| `--fg-base` | Heading, strong text | `#171717` | `rgba(255,255,255,.94)` |
| `--fg-weak` | Body text | `#6f6f6f` | `rgba(255,255,255,.62)` |
| `--fg-weaker` | Caption, label, muted | `#8f8f8f` | `rgba(255,255,255,.42)` |
| `--fg-weakest` | Disabled, placeholder, hint | `#c7c7c7` | `rgba(255,255,255,.28)` |

Tailwind utilities: `text-fg-base`, `text-fg-weak`, …

### Border (4 tokens — name kept verbose on purpose)

| Token | Role | Light | Dark |
|---|---|---|---|
| `--border-base` | Default border | `rgba(0,0,0,.16)` | `rgba(255,255,255,.20)` |
| `--border-weak` | Card divider | `#e5e5e5` | `#282828` |
| `--border-weaker` | Hairline | `#f0f0f0` | `#202020` |
| `--border-weakest` | Faintest | `#f5f5f5` | `#1a1a1a` |

Tailwind utilities: `border-border-base`, `border-border-weak`, … (verbose but explicit).

### Semantic (10 tokens — 5 colors × 2 weights)

| Token | Role | Light | Dark |
|---|---|---|---|
| `--color-success` | Dot, icon, accent fill | `#12c905` | `#12c905` |
| `--color-success-weak` | Subtle bg fill | `#dbfed7` | `#062d04` |
| `--color-warning` |  | `#fbdd46` | `#fcd53a` |
| `--color-warning-weak` |  | `#fcf3cb` | `#fdf3cf` |
| `--color-critical` | Destructive, error | `#fc533a` | `#fc533a` |
| `--color-critical-weak` |  | `#fff2f0` | `#1f0603` |
| `--color-info` |  | `#a753ae` | `#edb2f1` |
| `--color-info-weak` |  | `#fdecfe` | `#feecfe` |
| `--color-interactive` | Link, focus ring | `#034cff` | `#9dbefe` |
| `--color-interactive-weak` |  | `#ecf3ff` | `#091f52` |

Tailwind utilities: `bg-success`, `text-success`, `border-success`, `bg-success-weak`, …

### Kept as-is

- **Avatar** — `--avatar-background-{color}` + `--avatar-text-{color}` for 6 colors (pink/mint/orange/purple/cyan/lime).
- **Syntax** — full `--syntax-*` set (used by code highlighting).
- **Markdown** — full `--markdown-*` set.

### shadcn/ui compat layer

Aliases mapping the new scheme to shadcn names — no shadcn component touches needed:

```css
--background:          var(--bg-base);
--foreground:          var(--fg-base);
--card:                var(--bg-strong);
--card-foreground:     var(--fg-base);
--popover:             var(--bg-strong);
--popover-foreground:  var(--fg-base);
--primary:             var(--fg-base);
--primary-foreground:  var(--bg-strong);
--secondary:           var(--bg-weak);
--secondary-foreground: var(--fg-base);
--muted:               var(--bg-weak);
--muted-foreground:    var(--fg-weaker);
--accent:              var(--bg-weak);
--accent-foreground:   var(--fg-base);
--destructive:         var(--color-critical);
--destructive-foreground: var(--bg-strong);
--border:              var(--border-base);
--input:               var(--border-base);
--ring:                var(--color-interactive);

/* Sidebar */
--sidebar-background:        var(--bg-base);
--sidebar-foreground:        var(--fg-base);
--sidebar-primary:           var(--fg-base);
--sidebar-primary-foreground: var(--bg-base);
--sidebar-accent:            var(--bg-weak);
--sidebar-accent-foreground: var(--fg-base);
--sidebar-border:            var(--border-weak);
--sidebar-ring:              var(--color-interactive);
```

### Tokens to delete entirely

Everything not listed above. Specifically:

- All legacy `--background-base/-weak/-strong/-stronger`
- All legacy `--foreground-weak/-weaker`
- All `--surface-*` (raised/inset/float/weak/strong/brand/interactive/success/warning/critical/info/diff)
- All `--icon-*` (base/strong/weak/invert/brand/success/warning/critical/info/on-*/agent/diff)
- All `--button-*-base/-hover` (primary/secondary/ghost)
- All `--color-text-*` and `--color-text-on-*` and `--color-text-diff-*`
- All `--border-strong-*/-weak-*/-weaker-*/-interactive-*/-success-*/-warning-*/-critical-*/-info-*` legacy hover/active/selected variants
- All `--input-base/-hover/-active/-selected/-focus/-disabled`
- All `--shadow-xs-border-*` (these reference deleted `--border-*-base` vars)
- `--text-mix-blend-mode`
- `--base`, `--base2`, `--base3`

---

## Execution phases

### Phase 1 — Rewrite `src/openacp/styles/theme.css`

Replace all 3 themed blocks with the lean token set above:
- `[data-theme="light"]` (lines 50–345)
- `@media (prefers-color-scheme: dark)` → `:root` (lines 349–647)
- `[data-theme="dark"]` (lines 649–962)

Each block goes from ~290 lines → ~80 lines. Net: ~977 lines → ~280 lines.

Keep at top of file: `--shadow-xxs-border` chain (used for focus rings) — but rewrite to reference `--border-base`/`--border-weak` instead of legacy `--border-*-base`.

### Phase 2 — Rewrite `src/openacp/styles/index.css` `@theme`

Replace the giant color registration block (lines 122–388) with ~30 entries:

```css
@theme {
  /* Background */
  --color-bg-base: var(--bg-base);
  --color-bg-weak: var(--bg-weak);
  --color-bg-weaker: var(--bg-weaker);
  --color-bg-weakest: var(--bg-weakest);
  --color-bg-strong: var(--bg-strong);

  /* Foreground */
  --color-fg-base: var(--fg-base);
  --color-fg-weak: var(--fg-weak);
  --color-fg-weaker: var(--fg-weaker);
  --color-fg-weakest: var(--fg-weakest);

  /* Border */
  --color-border-base: var(--border-base);
  --color-border-weak: var(--border-weak);
  --color-border-weaker: var(--border-weaker);
  --color-border-weakest: var(--border-weakest);

  /* Semantic */
  --color-success: var(--color-success);
  --color-success-weak: var(--color-success-weak);
  --color-warning: var(--color-warning);
  --color-warning-weak: var(--color-warning-weak);
  --color-critical: var(--color-critical);
  --color-critical-weak: var(--color-critical-weak);
  --color-info: var(--color-info);
  --color-info-weak: var(--color-info-weak);
  --color-interactive: var(--color-interactive);
  --color-interactive-weak: var(--color-interactive-weak);

  /* shadcn aliases (unchanged names) */
  --color-background, --color-foreground, --color-card, --color-popover,
  --color-primary, --color-secondary, --color-muted, --color-accent,
  --color-destructive, --color-border, --color-input, --color-ring …

  /* Sidebar (unchanged names) */
  --color-sidebar-* …

  /* Syntax */
  --color-syntax-* …

  /* Markdown */
  --color-markdown-* …

  /* Avatar — runtime only, no Tailwind utilities needed */
}
```

### Phase 3 — Code migration

Refactor every consumer of deleted tokens. Known sites:

**`bg-background-base` / `bg-background-stronger` → `bg-bg-base` / `bg-bg-strong`**
- `src/onboarding/install-screen.tsx:95`
- `src/onboarding/setup-wizard.tsx:196`
- `src/openacp/main.tsx:132`
- `src/platform/loading.tsx:65`
- `src/openacp/components/settings/settings-dialog.tsx:80`
- `src/openacp/components/composer.tsx:454,614`

**`bg-background-weak` → `bg-bg-weak`**
- `src/openacp/components/composer.tsx:454`

**`text-foreground` / `text-foreground-weak` / `text-foreground-weaker` → `text-fg-base` / `text-fg-weak` / `text-fg-weaker`**
- Run a project-wide grep+replace, all `*.tsx`.

**`bg-foreground` / `text-background` etc → `bg-fg-base` / `text-bg-base`**
- Project-wide grep+replace.

**`var(--surface-success-strong)` → `var(--color-success)`**
- `src/openacp/components/composer.tsx:92`
- `src/openacp/components/welcome.tsx:60`
- `src/openacp/components/sortable-workspace-item.tsx:94`
- `src/openacp/components/update-notification.tsx:71`
- `src/openacp/components/add-workspace/local-tab.tsx:74`
- `src/onboarding/update-toast.tsx:173`

**`var(--surface-critical-strong)` → `var(--color-critical)`**
- `src/openacp/components/sortable-workspace-item.tsx:92`

**`var(--surface-interactive-subtle)` → `var(--color-interactive-weak)`**
- `src/openacp/components/chat/permission-request.tsx:96`

**`var(--surface-stronger-non-alpha)` / `var(--surface-raised-stronger-non-alpha)` → `var(--bg-strong)`**
- `src/openacp/components/chat/chat-view.tsx:57`
- `src/openacp/components/composer.tsx:591`
- `src/openacp/components/command-palette.tsx:193` (`bg-surface-raised-stronger-non-alpha` → `bg-bg-strong`)

**`bg-surface-base` → `bg-bg-weak`** (closest neutral; surface-base was a subtle off-white)
- `src/openacp/components/plugins-marketplace.tsx:66`
- `src/openacp/components/plugins-installed.tsx:96`

**`var(--surface-float-base)` → `var(--bg-strong)`**
- `src/openacp/styles/components.css:180`

**`var(--surface-inset-base)` → `var(--bg-weaker)`**
- `src/openacp/styles/components.css:251,275`
- `src/openacp/components/chat/permission-request.tsx:97,121`

**`bg-surface-weak` → `bg-bg-weaker`**
- `src/platform/loading.tsx:74`

**Markdown editor refs**
- `src/openacp/components/ui/markdown.tsx:22` — `var(--color-background-stronger)` → `var(--bg-strong)`

**Other legacy `--color-text-*` / `--icon-*` / `--button-*-base` references**
- Project-wide grep after Phase 1+2 to catch stragglers.

### Phase 4 — Update `src/ds-demo/registry.tsx` Colors entry

Collapse the 23 ColorGroup blocks down to:
1. **Background** (5 swatches: base/weak/weaker/weakest/strong)
2. **Foreground** (4 swatches)
3. **Border** (4 swatches)
4. **Semantic** (10 swatches: 5 colors × 2 weights)
5. **shadcn aliases** (background/foreground/card/popover/primary/secondary/muted/accent/destructive/border/input/ring)
6. **Sidebar** (8 swatches)
7. **Syntax** (existing)
8. **Markdown** (existing)
9. **Avatar** (existing paired bg+text)

### Phase 5 — Verify

```bash
pnpm build
```

Then visually smoke-test the demo page (`http://localhost:1420/ds-demo.html`) and the main app (`pnpm tauri dev`) — light mode + dark mode toggle. Look for:
- Any broken/transparent surfaces (missing token)
- Wrong contrast (e.g. dark text on dark bg)
- Sidebar primary FG visibility
- Composer/chat-view backgrounds
- Permission request highlight

### Phase 6 — Document

Update `docs/design/DESIGN.md` to reflect the new token model — replace any references to old `--surface-*` / `--color-text-*` / `--icon-*` tokens.

---

## Risks & mitigation

| Risk | Mitigation |
|---|---|
| Missed call-site → broken styling | Project-wide grep after Phase 1; build will likely still pass (CSS vars fall back to nothing), so visual smoke test is mandatory |
| Sidebar primary FG breakage (only existing use of `--background-strong`) | Explicitly remap to `var(--bg-base)` in sidebar aliases |
| Demo page diverging from actual code | Update demo registry in same PR (Phase 4) |
| Shadow border tokens reference deleted `--border-*-base` | Rewrite shadow chains to use new `--border-base/-weak` |

## Out of scope (explicit non-goals)

- **Don't touch** `--shadow-*` size scale (xs/sm/md/lg/xl/2xl) — only the `--shadow-xs-border-*` border-color references.
- **Don't touch** spacing, font sizes, radius, breakpoints.
- **Don't touch** Pencil design file (separate manual update later).
- **Don't add** new components or change shadcn component variants.
