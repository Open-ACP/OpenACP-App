# Design System Demo Page

## Goal

A standalone demo/showcase page for the OpenACP design system — components, tokens, typography. Runs on the same Vite dev server at `/ds-demo.html`, completely separate from the main app.

## Architecture

- **Entry point**: `ds-demo.html` + `src/ds-demo/main.tsx`
- **Vite config**: Add `ds-demo.html` to `build.rollupOptions.input` for multi-page support
- **URL**: `http://localhost:1420/ds-demo.html`
- **Styles**: Imports the same `tailwind/index.css` and `theme.css` — reuses all design tokens
- **No routing library**: Single-page with state-based navigation (useState for active item)

## Layout

Flat sidebar (left) + content area (right). Dark/light toggle in header.

```
┌──────────────────────────────────────────────┐
│  OpenACP Design System           [dark/light]│
├───────────┬──────────────────────────────────┤
│ Sidebar   │  Content                         │
│ (240px)   │                                  │
│           │  Component title + description   │
│ Group     │  Live preview (all variants)     │
│  Item●    │  Code snippet                    │
│  Item     │  Props table                     │
│           │                                  │
│ Group     │                                  │
│  Item     │                                  │
└───────────┴──────────────────────────────────┘
```

## Sidebar Groups

| Group | Items |
|-------|-------|
| **General** | Button, Badge, Input, Textarea, Separator, Skeleton |
| **Overlay** | Dialog, DropdownMenu, Sheet, Tooltip, Select |
| **Navigation** | Tabs |
| **Data Display** | Switch, Spinner, TextShimmer, Markdown |
| **Tokens** | Colors, Typography, Spacing, Shadows, Radius |

## Content: Component Pages

Each component page shows:

1. **Title + description** — component name, one-line purpose
2. **Live preview** — render actual shadcn component with all variants/sizes in a grid
3. **Code snippet** — `<pre>` block with import + basic usage example
4. **Props table** — prop name, type, default value

## Content: Token Pages

- **Colors** — grid of color swatches: shadcn core (`--primary`, `--secondary`, etc.) + extensions (`--border-weak`, `--foreground-weak`) + specialized groups (avatar, status). Each swatch shows name + computed hex value.
- **Typography** — font families, sizes (small/base/large/x-large), weights, line heights with rendered examples.
- **Spacing** — visual scale of `--spacing` multiples (1-16).
- **Shadows** — boxes with each shadow token applied.
- **Radius** — boxes with each radius token applied.

## File Structure

```
ds-demo.html                        — HTML entry point (minimal, loads main.tsx)
src/ds-demo/
├── main.tsx                         — React mount + style imports
├── app.tsx                          — Layout shell (header, sidebar, content area)
├── components/
│   ├── sidebar.tsx                  — Navigation sidebar with groups
│   ├── component-page.tsx           — Generic component showcase renderer
│   └── token-page.tsx               — Token showcase (colors, typography, etc.)
└── registry.tsx                     — All component/token metadata: name, group, demo JSX, code snippet, props
```

## Registry Format

```tsx
interface DemoEntry {
  id: string
  name: string
  group: string
  description: string
  render: () => React.ReactNode    // live preview
  code: string                     // usage example
  props?: { name: string; type: string; default: string }[]
}
```

All demo entries defined in `registry.tsx`. Adding a new component = adding one entry.

## Dark/Light Toggle

- Button in header toggles `data-theme` attribute on `<html>`
- Reuses existing `theme.css` token system — zero extra CSS needed
- Persists choice in localStorage

## Vite Config Change

```ts
build: {
  rollupOptions: {
    input: {
      main: resolve(__dirname, 'index.html'),
      'ds-demo': resolve(__dirname, 'ds-demo.html'),
    },
  },
},
```

## Out of Scope

- Interactive props playground (like Storybook controls)
- Auto-generated documentation from source code
- Component testing
- Search functionality
