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

- **Never hardcode values** — always use Tailwind utility classes and design tokens. No inline `color:`, `font-size:`, `padding:` with raw values. Use `text-foreground`, `text-sm`, `p-2`, etc.
- **Use component variants** — rely on `variant` and `size` props from Button/Badge/etc. Don't override colors with custom className unless layout requires it (e.g. `absolute`, `w-full`).
- **Icons**: Use `@phosphor-icons/react` — never inline SVG for standard icons.
- **Border levels**: `border-weaker` → `border-weak` → `border` → `border-strong` (lightest to darkest).
- **Text levels**: `text-foreground-weaker` → `text-muted-foreground` → `text-foreground-weak` → `text-foreground` (lightest to darkest).

## Styling

### File Structure (flat 4-file layout)

```
src/openacp/styles/
  index.css         Entry point: Tailwind imports + @theme config + color registrations
  theme.css         Design tokens: colors, shadows, shadcn aliases (light/dark/dim)
  components.css    Component styles: markdown, .oac-* app styles
  utilities.css     Text presets, no-scrollbar, animations
```

No `tailwind/` subdirectory — all Tailwind `@theme` config and color registrations are in `index.css`.

### CSS Cascade Layers

```
@layer theme → base → components → utilities
```

- **Theme**: Design tokens via `theme.css` (colors, shadows — light/dark/dim)
- **Base**: Tailwind preflight + KaTeX math rendering
- **Components**: shadcn/ui + `.oac-*` app styles
- **Utilities**: Text presets (`text-sm-regular`, `text-md-medium`), animations

### Design Tokens (CSS Variables)

Defined in `theme.css`:

**Colors** — Semantic tokens with light/dark/dim variants:
- Background: `--background-base`, `--background-strong`, `--background-stronger`, `--background-weak`
- Text: `--text-strong`, `--text-base`, `--text-weak`, `--text-weaker`
- Surface: `--surface-raised-base`, `--surface-inset-base`, `--surface-float-base`, etc.
- Border (4 levels, light→dark): `--border-weaker-base` → `--border-weak-base` → `--border-base` → `--border-strong-base`
- Each border level has states: `hover`, `active`, `selected`, `disabled`, `focus`
- Status: `--surface-critical-strong`, `--surface-success-base`, `--surface-warning-base`, etc.
- Icons: `--icon-base`, `--icon-weak-base`, `--icon-strong-base`, semantic icon tokens
- Syntax: `--syntax-comment`, `--syntax-keyword`, `--syntax-string`, etc.
- Diff: `--surface-diff-add-*`, `--surface-diff-delete-*`

**shadcn Token Aliases** (mapped to existing tokens):
- `--foreground` → `var(--text-strong)`
- `--background` → `var(--background-base)`
- `--primary` → `var(--button-primary-base)`
- `--border` → `var(--border-base)`
- `--border-weak` → `var(--border-weak-base)`
- `--muted` → `var(--surface-weak)`
- `--muted-foreground` → `var(--text-weak)`
- `--foreground-weak` → `var(--text-base)`
- `--foreground-weaker` → `var(--text-weaker)`
- `--destructive` → `var(--surface-critical-strong)`
- `--card` → `var(--surface-raised-stronger)`
- `--sidebar-*` → sidebar-specific tokens

**Typography** (in `index.css` `@theme`):
- Fonts: `--font-sans` (SF Pro, system-ui), `--font-mono` (SFMono, Menlo)
- Sizes: 2xs (11px), xs (12px), sm (14px), base/md (16px), lg (18px), xl (20px), 2xl (24px), 3xl (28px)
- Weights: regular (400), medium (500)
- Line heights: lg (150%), xl (180%), 2xl (200%)
- Tracking: normal (0), tight (-0.16px), tightest (-0.32px)

**Spacing & Layout** (in `index.css` `@theme`):
- Base spacing: `--spacing: 0.25rem`
- Radius: xs (0.125rem) → xl (0.625rem)
- Shadows: xs, sm, md, lg, xl, 2xl + border shadows (`--shadow-xs-border`, etc.)

### Theming

- Light/dark/dim via `data-theme="light|dark|dim"` on `<html>`
- Falls back to `prefers-color-scheme` when no data-theme set
- Dark mode tokens auto-resolve — shadcn aliases are just pointers

### Tailwind Integration

Color registrations in `index.css` `@theme` block (no separate `tailwind/` directory):
- shadcn core: `bg-background`, `text-foreground`, `bg-primary`, `border-border`, etc.
- Extensions: `border-weak`, `text-foreground-weak`, `text-foreground-weaker`
- Sidebar: `bg-sidebar-background`, `text-sidebar-foreground`, etc.
- Legacy surface/border/icon tokens: `bg-surface-raised-base`, `text-text-strong`, `border-border-weak-base`, etc.
- Full icon/syntax/diff/markdown token sets registered as color utilities

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
