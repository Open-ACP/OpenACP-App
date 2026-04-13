# OpenACP Desktop — Design System Overview

## Architecture

```
src/openacp/                    App layer
  components/ui/                shadcn/ui components (Radix-based)
  components/                   App components (chat, sidebar, composer...)
  context/                      React contexts (Chat, Sessions, Workspace)
  api/                          REST client + SSE manager
  styles/                       Design tokens + Tailwind config

src/ui/                         Legacy @openacp/ui (Kobalte-based) — being phased out
src/platform/                   Tauri integrations + i18n (18 languages)
```

## Design Reference

- **Pencil file**: `docs/design/pencil/openacp.pen` — 18 screens, 87 shadcn components, full token system
- **Demo page**: `/ds-demo.html` — Live showcase of all design tokens, components, and patterns. Open in dev server at `http://localhost:1420/ds-demo.html`
- **Migration spec**: `docs/superpowers/specs/2026-04-04-shadcn-migration-design.md`

When building FE, read Pencil screens via MCP tools to match layout/spacing 1:1.

## Guidelines

- **Never hardcode values.** Always use Tailwind utility classes and design tokens. No inline `style={{ color: ..., padding: ... }}` with raw values. No `bg-[#...]`, `p-[13px]`, `text-[11px]`. No Tailwind built-in palette (`emerald-*`, `slate-*`, `zinc-*` etc.) — it doesn't follow light/dark theme.
- **Font weight max 500** (`font-medium`). No `font-semibold` / `font-bold` / heavier — the brand wants a restrained typography feel. Use color contrast or size for emphasis, not weight.
- **Font size min 11px** (`text-2xs`). Nothing smaller — fails accessibility.
- **4px spacing grid** — only multiples of 4 via the spacing scale (`p-1` / `p-2` / `p-3` / ...). Half-steps (`p-0.5`, `p-1.5`) are the exception.
- **Use component variants** — rely on `variant` / `size` props. Don't override colors via className unless strictly for layout (`absolute`, `w-full`).
- **Icons**: `@phosphor-icons/react` only. Never inline SVG. **No emoji in UI.**
- **Border scale** (strong → weak): `border-border-base` → `border-border-weak` → `border-border-weaker` → `border-border-weakest`.
- **Foreground scale** (strong → weak): `text-fg-base` → `text-fg-weak` → `text-fg-weaker` → `text-fg-weakest`.

## Styling

### File Structure (flat 4-file layout)

```
src/openacp/styles/
  index.css         Entry point: Tailwind imports + @theme config + color registrations
  theme.css         Design tokens: colors, shadows, shadcn aliases (light/dark)
  components.css    Component styles: markdown, .oac-* app styles
  utilities.css     Text presets, no-scrollbar, animations
```

No `tailwind/` subdirectory — all Tailwind `@theme` config and color registrations are in `index.css`.

### CSS Cascade Layers

```
@layer theme → base → components → utilities
```

- **Theme**: Design tokens via `theme.css` (colors, shadows — light/dark)
- **Base**: Tailwind preflight + KaTeX math rendering
- **Components**: shadcn/ui + `.oac-*` app styles
- **Utilities**: Text presets (`text-sm-regular`, `text-md-medium`), animations

### Design Tokens (CSS Variables)

Defined in `theme.css`. The system is **3 neutral families × 4 levels + 1 elevated + flat semantic palette**.

**Background** (5 tokens — 4 levels + 1 elevated):
- `--bg-base` — page background, sidebar, app shell
- `--bg-weak` — hover row, alt panel, input bg
- `--bg-weaker` — selected row, deeper alt
- `--bg-weakest` — pressed / active state
- `--bg-strong` — **elevated** surface (card / popover / dropdown / modal)

**Foreground** (4 tokens):
- `--fg-base` — heading, strong text
- `--fg-weak` — body text
- `--fg-weaker` — caption, label, muted
- `--fg-weakest` — disabled, placeholder, hint

**Border** (4 levels + 1 strong):
- `--border-base` — default visible border
- `--border-weak` — card / section divider
- `--border-weaker` — hairline
- `--border-weakest` — faintest
- `--border-strong` — **high contrast** (focus, active, attention) — brighter than base in dark, darker than base in light

**Semantic** (5 colors × 2 weights — flat palette):
- `--color-success` / `--color-success-weak`
- `--color-warning` / `--color-warning-weak`
- `--color-critical` / `--color-critical-weak` (= shadcn destructive)
- `--color-info` / `--color-info-weak`
- `--color-interactive` / `--color-interactive-weak` (= link / focus ring)

**Other token families kept**:
- `--syntax-*` — code highlighting (comment, keyword, string, type, etc.)
- `--markdown-*` — markdown rendering (heading, link, code, emph, strong, etc.)
- `--avatar-background-{color}` + `--avatar-text-{color}` for 6 avatar colors (pink / mint / orange / purple / cyan / lime)

**shadcn/ui aliases** — compat layer, point at the new tokens:
```
--background          → var(--bg-base)
--foreground          → var(--fg-base)
--card / --popover    → var(--bg-strong)
--primary             → var(--fg-base)
--primary-foreground  → var(--bg-strong)
--secondary, --muted,
--accent              → var(--bg-weak)
--muted-foreground    → var(--fg-weaker)
--destructive         → var(--color-critical)
--border, --input     → var(--border-base)
--ring                → var(--color-interactive)
--sidebar-*           → sidebar-specific (backed by --bg-/--fg-/--border-)
```

**Direct tokens vs shadcn aliases — use which, when:**

- **App / domain code** (`src/onboarding/`, `src/openacp/components/**` except `ui/`): always use **direct tokens** — `text-fg-weaker`, `bg-bg-weak`, `border-border-base`, `text-critical`. Never `text-muted-foreground`, `bg-muted`, `text-destructive` in hand-written app code.
- **shadcn primitives** (`src/openacp/components/ui/*.tsx`): keep the shadcn aliases (`bg-primary`, `text-muted-foreground`, `border-border`, etc.) — these files are meant to be drop-in compatible with shadcn/ui updates. Don't touch them unless adding a variant.
- **Third-party components** (Radix primitives, headless UI libs): shadcn aliases also acceptable.

The two sets resolve to the same pixel values — this rule is about consistency and making app code grep-friendly for the project's token vocabulary.

**Typography** (in `index.css` `@theme`):
- Fonts: `--font-sans` (SF Pro, system-ui), `--font-mono` (SFMono, Menlo)
- Sizes: `text-2xs` (11px), `text-xs` (12px), `text-sm` (14px), `text-base` (16px), `text-lg` (18px), `text-xl` (20px), `text-2xl` (24px), `text-3xl` (28px)
- **Weights (only two)**: `font-normal` (400), `font-medium` (500) — **nothing heavier**
- Line heights: `leading-lg` (150%), `leading-xl` (180%), `leading-2xl` (200%)
- Tracking: `tracking-normal` (0), `tracking-tight` (-0.16px), `tracking-tightest` (-0.32px)

**Spacing & Layout** (in `index.css` `@theme`):
- Base spacing: `--spacing: 0.25rem`
- Radius: xs (0.125rem) → xl (0.625rem), 2xl (1rem), 3xl (1.5rem), full (9999px)
- Shadows: xs, sm, md, lg, xl, 2xl + border shadows (`--shadow-xs-border`, etc.)

### Theming

- Light/dark via `data-theme="light|dark"` on `<html>` — the only theme selector in CSS (no `@media (prefers-color-scheme)` fallback block)
- Pre-paint init: inline script in `index.html` sets `data-theme` before CSS paint using a `localStorage` hint (mirrored by `applyTheme`) or `prefers-color-scheme` on first launch — prevents flash-of-wrong-theme
- Runtime: `applyTheme(theme)` in `lib/settings-store.ts` resolves `"system"` via `matchMedia`, sets the attribute, and mirrors the value to `localStorage.theme-hint`
- Tailwind `dark:` variant: bound to `[data-theme="dark"]` via `@custom-variant dark` in `index.css` — follows the explicit attribute, not `prefers-color-scheme`
- shadcn aliases (`--card`, `--primary`, …) are declared once in `:root`, pointing at `--bg-*` / `--fg-*` / `--color-*` — raw tokens get overridden per theme and aliases auto-resolve via `var()` at use-time

### Tailwind Integration

Color registrations in `index.css` `@theme` block:

- Background: `bg-bg-base`, `bg-bg-weak`, `bg-bg-weaker`, `bg-bg-weakest`, `bg-bg-strong`
- Foreground: `text-fg-base`, `text-fg-weak`, `text-fg-weaker`, `text-fg-weakest`
- Border: `border-border-base`, `border-border-weak`, `border-border-weaker`, `border-border-weakest`, `border-border-strong`
- Semantic: `bg-success` / `text-success` / `border-success` / `bg-success-weak` (and same for `warning` / `critical` / `info` / `interactive`)
- shadcn aliases: `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-destructive`, etc.
- Sidebar: `bg-sidebar-background`, `text-sidebar-foreground`, `bg-sidebar-accent`, etc.
- Syntax: `text-syntax-keyword`, `text-syntax-string`, `text-syntax-comment`, etc.
- Markdown: `text-markdown-heading`, `text-markdown-link`, etc.

## shadcn/ui Components (`src/openacp/components/ui/`)

Installed via `npx shadcn add`. Config in `components.json` (new-york style, Phosphor icons).

### Primitives
button, badge, input, textarea, switch, checkbox, tooltip, progress

### With Dependencies
dialog, dropdown-menu, select, tabs

### Composites
command, sidebar, sheet, sonner (toast), separator, skeleton

## App Components (`src/openacp/components/`)

| Component | Purpose | shadcn Components Used |
|-----------|---------|----------------------|
| `welcome.tsx` | Onboarding screen | Button |
| `add-workspace/` | Add workspace modal | Dialog, Tabs, Input, Select, Button, Badge |
| `plugins-modal.tsx` | Plugin management | Dialog, Tabs |
| `plugins-installed.tsx` | Installed plugins list | Switch, Badge, Button |
| `plugins-marketplace.tsx` | Plugin marketplace | Input, Badge, Button |
| `sidebar.tsx` | Session list + nav | Button |
| `sidebar-rail.tsx` | Workspace switcher | Button |
| `command-palette.tsx` | Command search | Input, Button |
| `composer.tsx` | Message input + tools | Button |
| `chat/chat-view.tsx` | Chat interface | Button |
| `agent-selector.tsx` | Agent picker | DropdownMenu, Button, Input |
| `config-selector.tsx` | Config settings | DropdownMenu, Button |
| `review-panel.tsx` | File diff viewer | Button |

### Custom (Tier 3 — not replacing with shadcn)

| Component | Reason |
|-----------|--------|
| `ui/markdown.tsx` | Custom parser chain (marked + shiki + KaTeX + morphdom) |
| `review-panel.tsx` | Custom diff viewer with `diff` package |
| `chat/blocks/*` | Domain-specific: thinking, tool use, plan, error blocks |
| `composer.tsx` | Complex: drag-drop, file attachments, keyboard shortcuts, DockTray |
| `ui/resize-handle.tsx` | Custom drag resize behavior |

## State Management

3 React context providers:

1. **ChatContext** — messages, streaming state, SSE connection, `sendPrompt()`
2. **SessionsContext** — session CRUD, real-time SSE updates
3. **WorkspaceContext** — workspace directory, server info, API client

## Key Dependencies

| Category | Library |
|----------|---------|
| Framework | React 19 |
| UI | shadcn/ui + Radix UI primitives |
| Icons | @phosphor-icons/react |
| Data | @tanstack/react-query |
| Styling | Tailwind CSS 4 + class-variance-authority |
| Markdown | marked + shiki + katex |
| Desktop | Tauri 2 (10+ plugins) |
| Build | Vite 6 |
