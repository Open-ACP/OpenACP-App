# SolidJS → React + shadcn Migration — Design Spec

**Date:** 2026-04-03
**Branch:** `feat/migrate-react`
**Approach:** Big bang — full migration in one pass

## Goal

Migrate the OpenACP App frontend from SolidJS to React, replacing the custom `src/ui/` design system (28.5k lines, Kobalte-based) with shadcn/ui. Tauri backend and Vite build tool remain unchanged. App must work identically to current after migration.

## Scope

### In Scope
- SolidJS → React (all `.tsx` components and hooks)
- `src/ui/` (custom design system) → shadcn/ui components
- Vite config: `vite-plugin-solid` → `@vitejs/plugin-react`
- tsconfig: `jsxImportSource: "solid-js"` → `"react-jsx"`
- Package dependencies: swap all SolidJS packages for React equivalents
- `src/onboarding/` — 4 screens (splash, install, setup, update-toast)
- `src/platform/loading.tsx` and `webview-zoom.ts`

### Out of Scope
- Tauri backend (Rust) — no changes
- `src/openacp/api/` — pure TS, no framework imports (client.ts, sse.ts, history-cache.ts, workspace-store.ts)
- `src/openacp/types.ts` — pure TS interfaces
- `src/openacp/components/chat/block-utils.ts` — pure TS utilities
- `src/platform/` non-UI files (bindings.ts, cli.ts, menu.ts, updater.ts)
- `src/platform/i18n/` locale files — pure objects

## Pattern Mapping

### Reactivity

| SolidJS | React | Notes |
|---------|-------|-------|
| `createSignal(initial)` | `useState(initial)` | Direct 1:1 |
| `createStore(obj)` + `produce()` | `useReducer` or `useImmer` | For complex nested state (chat context) |
| `createMemo(() => ...)` | `useMemo(() => ..., [deps])` | Must specify deps |
| `createEffect(() => ...)` | `useEffect(() => ..., [deps])` | Must specify deps |
| `createEffect(on(dep, fn))` | `useEffect(fn, [dep])` | |
| `onMount(() => ...)` | `useEffect(() => ..., [])` | Empty deps = mount |
| `onCleanup(() => ...)` | `useEffect(() => { return cleanup }, [])` | Return from useEffect |
| `createResource(fetcher)` | `@tanstack/react-query` `useQuery` | Already using TanStack |
| `createContext()` / `useContext()` | `createContext()` / `useContext()` | Nearly identical API |

### Control Flow

| SolidJS | React |
|---------|-------|
| `<Show when={x}>` | `{x && <Component />}` or ternary |
| `<For each={items}>` | `{items.map((item) => ...)}` with `key` |
| `<Switch><Match when={x}>` | `if/else` chain or switch in render |
| `<Dynamic component={C}>` | Direct: `<C {...props} />` |
| `<Portal>` | `ReactDOM.createPortal()` |

### State Management

Current SolidJS stores (`createStore` + `produce` in chat.tsx) → **`useImmer` hook** for the chat context. This preserves the mutable-style update pattern while being React-compatible.

For simpler contexts (workspace, sessions) → plain `useState` + `useCallback`.

### Package Replacements

| Remove | Add | Purpose |
|--------|-----|---------|
| `solid-js` | `react`, `react-dom` | Core |
| `vite-plugin-solid` | `@vitejs/plugin-react` | Vite plugin |
| `@solidjs/meta` | (not needed for Tauri) | Metadata |
| `@solidjs/router` | `react-router-dom` | Routing (if used) |
| `@tanstack/solid-query` | `@tanstack/react-query` | Data fetching |
| `@solid-primitives/*` (10 packages) | React hooks equivalents | Utilities |
| `@kobalte/core` | (removed, shadcn replaces) | UI primitives |
| `phosphor-solid-js` | `@phosphor-icons/react` | Icons |
| `@thisbeyond/solid-dnd` | `@dnd-kit/core` | Drag-and-drop |
| `solid-list` | (not needed) | Virtual list |
| `motion` (solid) | `framer-motion` | Animations |

### shadcn/ui Components

Map of current `@openacp/ui` usage → shadcn equivalents:

| Current | shadcn Replacement |
|---------|-------------------|
| `Button` | `shadcn/button` |
| `IconButton` | `shadcn/button` variant="ghost" size="icon" |
| `Icon` | `@phosphor-icons/react` directly |
| `Tooltip` | `shadcn/tooltip` |
| `Avatar` | `shadcn/avatar` |
| `DropdownMenu` | `shadcn/dropdown-menu` |
| `Spinner` | Custom or `shadcn/loading` |
| `DockShellForm` / `DockTray` | Custom component (no shadcn equiv) |
| `Markdown` | Keep custom (marked + morphdom) — rewrite as React component |
| `TextShimmer` | Keep custom — rewrite as React component |
| `ResizeHandle` | Keep custom — rewrite as React component |
| `BasicTool` | Removed (replaced by tool-block.tsx) |
| `List` | `shadcn/command` or custom |
| `createAutoScroll` | Keep custom — rewrite as React hook |

### Custom Components to Rewrite (not in shadcn)

These have no shadcn equivalent and must be rewritten as React components:

1. **Markdown** — marked parser + DOMPurify + morphdom diffing + copy button. Rewrite as React component with `useRef` + `useEffect` for DOM updates.
2. **TextShimmer** — CSS animation for loading text. Simple React component.
3. **ResizeHandle** — Draggable resize for panels. React component with mouse event handlers.
4. **DockShellForm / DockTray** — Composer input container. Custom React component.
5. **createAutoScroll** — Auto-scroll hook. Rewrite as `useAutoScroll` React hook.
6. **createPacedValue** — Streaming text pacing. Rewrite as `usePacedValue` React hook.

## File Migration Map

### No Changes Needed (pure TS)
- `src/openacp/api/client.ts`
- `src/openacp/api/sse.ts`
- `src/openacp/api/history-cache.ts`
- `src/openacp/api/workspace-store.ts`
- `src/openacp/types.ts`
- `src/openacp/components/chat/block-utils.ts`
- `src/platform/bindings.ts`
- `src/platform/cli.ts`
- `src/platform/menu.ts`
- `src/platform/updater.ts`
- `src/platform/i18n/*.ts` (18 locale files)

### Rewrite (SolidJS → React)

**Entry:**
- `src/openacp/main.tsx` — `render()` from solid-js/web → `createRoot().render()` from react-dom/client

**Contexts (3):**
- `src/openacp/context/workspace.tsx` — simple, `createContext` → React `createContext`
- `src/openacp/context/sessions.tsx` — `createStore` → `useState` + `useCallback`
- `src/openacp/context/chat.tsx` — complex, `createStore`+`produce` → `useImmer`

**App (2):**
- `src/openacp/app.tsx` — `createSignal`/`createStore`/`createEffect`/`Show` → React equivalents
- `src/openacp/main.tsx` — entry point

**Chat Components (10):**
- `src/openacp/components/chat/chat-view.tsx`
- `src/openacp/components/chat/message-turn.tsx`
- `src/openacp/components/chat/user-message.tsx`
- `src/openacp/components/chat/timeline-step.tsx`
- `src/openacp/components/chat/blocks/text-block.tsx`
- `src/openacp/components/chat/blocks/thinking-block.tsx`
- `src/openacp/components/chat/blocks/tool-block.tsx`
- `src/openacp/components/chat/blocks/plan-block.tsx`
- `src/openacp/components/chat/blocks/error-block.tsx`
- `src/openacp/components/chat/blocks/tool-group.tsx`

**Other Components (7):**
- `src/openacp/components/composer.tsx`
- `src/openacp/components/command-palette.tsx`
- `src/openacp/components/sidebar.tsx`
- `src/openacp/components/sidebar-rail.tsx`
- `src/openacp/components/review-panel.tsx`
- `src/openacp/components/agent-selector.tsx`
- `src/openacp/components/config-selector.tsx`
- `src/openacp/components/welcome.tsx`

**Hooks (2):**
- `src/openacp/hooks/create-paced-value.ts` → `use-paced-value.ts`

**Custom UI (rewrite from src/ui/):**
- `src/openacp/components/ui/markdown.tsx` — New React markdown component
- `src/openacp/components/ui/text-shimmer.tsx` — New React shimmer
- `src/openacp/components/ui/resize-handle.tsx` — New React resize handle
- `src/openacp/components/ui/dock-surface.tsx` — New React dock components
- `src/openacp/hooks/use-auto-scroll.ts` — New React hook

**Platform (2):**
- `src/platform/loading.tsx`
- `src/platform/webview-zoom.ts` — `createSignal` → module-level state or React hook

**Onboarding (4):**
- `src/onboarding/splash-screen.tsx`
- `src/onboarding/install-screen.tsx`
- `src/onboarding/setup-wizard.tsx`
- `src/onboarding/update-toast.tsx`

### Delete
- `src/ui/` — entire directory (28.5k lines, replaced by shadcn)
- `src/app/` — legacy module
- `src/openacp-sdk/` — legacy module

## Infrastructure Changes

### vite.config.ts
```diff
- import solid from "vite-plugin-solid"
+ import react from "@vitejs/plugin-react"

  plugins: [
    openacpResolver(),  // keep, update paths for shadcn
-   solid(),
+   react(),
    tailwindcss(),
  ],
```

### tsconfig.json
```diff
- "jsx": "preserve",
- "jsxImportSource": "solid-js",
+ "jsx": "react-jsx",
+ "jsxImportSource": "react",
```

### shadcn Setup
- Initialize shadcn with `npx shadcn@latest init`
- Components installed to `src/components/ui/` (shadcn default)
- Install needed components: button, tooltip, avatar, dropdown-menu, dialog, popover, command, collapsible

### Tailwind
- Keep Tailwind CSS 4 (`@tailwindcss/vite`) — shadcn works with TW4
- Keep existing `src/openacp/styles.css` (timeline, tool cards, plan CSS)

## Styling Strategy

- **shadcn components** use their own Tailwind-based styles (cn utility)
- **Custom components** (Markdown, TextShimmer, etc.) keep existing CSS classes from `src/openacp/styles.css`
- **Theme tokens** — current CSS custom properties (`--text-base`, `--border-weak-base`, etc.) stay as-is in `styles.css`. shadcn uses its own CSS variables which we configure to match.
- **No dual design system** — once migration complete, `src/ui/` is deleted

## Migration Order

1. **Infrastructure** — package.json, vite.config, tsconfig, shadcn init
2. **Custom UI components** — Markdown, TextShimmer, ResizeHandle, DockSurface, useAutoScroll (these are needed by other components)
3. **Hooks** — usePacedValue
4. **Contexts** — workspace, sessions, chat (bottom-up)
5. **Components** — chat blocks → chat view → sidebar → composer → command palette → review panel
6. **Entry points** — main.tsx, app.tsx
7. **Onboarding** — splash, install, setup, update-toast
8. **Platform** — loading.tsx, webview-zoom.ts
9. **Cleanup** — delete src/ui/, src/app/, src/openacp-sdk/

## Intentionally Unchanged

- Tauri backend (Rust) — no changes
- API layer — pure TypeScript
- SSE event handling logic — same patterns, just React state updates
- Types — pure TypeScript interfaces
- CSS custom properties and theme tokens
- i18n locale files
