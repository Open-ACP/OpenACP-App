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
- **Migration spec**: `docs/superpowers/specs/2026-04-04-shadcn-migration-design.md`

When building FE, read Pencil screens via MCP tools to match layout/spacing 1:1.

## Styling

### CSS Cascade Layers

```
@layer theme → base → components → utilities
```

- **Theme**: Design tokens (colors, typography, spacing, shadows)
- **Base**: Reset, KaTeX math rendering
- **Components**: shadcn/ui + co-located CSS files
- **Utilities**: Animations, custom helpers (`text-12-regular`, `text-14-medium`, etc.)

### Design Tokens (CSS Variables)

Defined in `src/openacp/styles/theme.css`:

**Colors** — Semantic tokens with light/dark variants:
- Background: `--background-base`, `--background-strong`, `--background-stronger`
- Text: `--text-strong`, `--text-base`, `--text-weak`, `--text-weaker`
- Surface: `--surface-raised-base`, `--surface-inset-base`, etc.
- Border: `--border-base`, `--border-weak-base`, `--border-interactive-base`
- Status: `--surface-critical-strong`, `--surface-success-base`, etc.

**shadcn Token Aliases** (mapped to existing tokens):
- `--foreground` → `var(--text-strong)`
- `--background` → `var(--background-base)`
- `--primary` → `var(--button-primary-base)`
- `--border` → `var(--border-base)`
- `--muted` → `var(--surface-weak)`
- `--destructive` → `var(--surface-critical-strong)`
- `--sidebar-*` → sidebar-specific tokens

**Typography:**
- Fonts: `--font-family-sans` (system-ui), `--font-family-mono` (SFMono/Menlo)
- Sizes: small (13px), base (14px), large (16px), x-large (20px)
- Weights: regular (400), medium (500)

**Spacing & Layout:**
- Base spacing: `--spacing: 0.25rem`
- Radius: xs (0.125rem) → xl (0.625rem)
- Shadows: xs, md, lg + border shadows

### Theming

- Light/dark via `data-theme="light|dark"` on `<html>`
- Falls back to `prefers-color-scheme` when no data-theme set
- Dark mode tokens auto-resolve — shadcn aliases are just pointers

### Tailwind Integration

Colors registered in `src/openacp/styles/tailwind/colors.css`:
- All semantic tokens available as utilities: `bg-background-base`, `text-text-strong`, etc.
- All shadcn tokens: `bg-background`, `text-foreground`, `bg-primary`, etc.
- Sidebar tokens: `bg-sidebar-background`, `text-sidebar-foreground`, etc.

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
