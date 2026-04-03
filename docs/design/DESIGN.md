# OpenACP Desktop — Design System Overview

## Architecture

```
src/ui/                     @openacp/ui design system
  src/components/           63 UI components (Kobalte-based)
  src/styles/               CSS layers + design tokens
  src/theme/                OKLCH color generation + runtime switching
  src/i18n/                 UI-level translations

src/openacp/                App layer
  components/               9 main components (chat, sidebar, composer...)
  context/                  3 providers (Chat, Sessions, Workspace)
  api/                      REST client + SSE manager

src/platform/               Tauri integrations + i18n (18 languages)
```

## Styling

### CSS Cascade Layers

```
@layer theme → base → components → utilities
```

- **Theme**: Design tokens (colors, typography, spacing, shadows)
- **Base**: Reset, KaTeX math rendering
- **Components**: 50+ co-located CSS files
- **Utilities**: Animations, custom helpers

### Design Tokens (CSS Variables)

**Colors** — OKLCH color space, dynamically generated from seed colors:
- Palettes: neutral, primary, success, warning, error, info, interactive, diff
- Examples: `--button-primary-base`, `--surface-base-active`, `--icon-strong-hover`

**Typography:**
- Fonts: `--font-family-sans` (system-ui), `--font-family-mono` (SFMono/Menlo)
- Sizes: small (13px), base (14px), large (16px), x-large (20px)
- Weights: regular (400), medium (500)
- Line heights: normal (130%), large (150%), x-large (180%), 2x-large (200%)

**Spacing & Layout:**
- Base spacing: `--spacing: 0.25rem`
- Radius: xs (0.125rem) → xl (0.625rem)
- Breakpoints: sm (40rem) → 2xl (96rem)
- Shadows: xs, md, lg

### Theming

- **37 themes** (OLED, Dracula, GitHub, Nord, Tokyo Night, Catppuccin...)
- Each theme: light + dark variant
- Runtime switching via `theme/context.tsx`
- Color generation: seed hex → OKLCH → CSS variables (`theme/resolve.ts`)

### Component Styling Pattern

- Kobalte headless components for accessibility
- `data-*` attributes for variant styling (e.g. `[data-size="small"]`, `[data-variant="primary"]`)
- No Tailwind utility classes in components — pure CSS + tokens

## Component Categories

### Form (12)
button, icon-button, input, text-field, checkbox, radio-group, select, switch, tabs, tag, textarea, toggle

### Disclosure (8)
accordion, collapsible, dialog, dropdown-menu, hover-card, popover, tooltip, context-menu

### Data Display (6)
list, progress, progress-circle, spinner, animated-number, badge

### Content (8)
card, avatar, markdown, message-part, session-turn, session-review, scroll-view, resize-handle

### Feedback (3)
toast, alert, keybind

### Navigation (2)
sidebar, breadcrumb

## App Components (`src/openacp/components/`)

| Component | Purpose |
|-----------|---------|
| `chat-view.tsx` | Main chat interface |
| `composer.tsx` | Message input + tools |
| `message.tsx` | Render messages (text, thinking, tool-call parts) |
| `command-palette.tsx` | Command search & execution |
| `sidebar.tsx` | Session list + navigation |
| `sidebar-rail.tsx` | Workspace switcher |
| `agent-selector.tsx` | Agent picker |
| `config-selector.tsx` | Config settings |
| `welcome.tsx` | Onboarding screen |

## State Management

3 SolidJS context providers:

1. **ChatContext** — messages, streaming state, SSE connection, `sendPrompt()`
2. **SessionsContext** — session CRUD, real-time SSE updates
3. **WorkspaceContext** — workspace directory, server info, API client

## Key Dependencies

| Category | Library |
|----------|---------|
| Framework | SolidJS 1.9 + @solidjs/router |
| UI | @kobalte/core (headless, accessible) |
| Animations | motion 12.38 |
| Data | @tanstack/solid-query |
| Validation | zod |
| Markdown | marked + shiki + katex |
| Desktop | Tauri 2 (10+ plugins) |
| Build | Vite 6 + Tailwind CSS 4 |
| i18n | @solid-primitives/i18n |
