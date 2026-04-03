# Remove src/ui + shadcn/ui Migration

**Date:** 2026-04-03
**Status:** Approved
**Branch:** feat/shadcn-migration

## Context

The app has been migrated from SolidJS to React, but `src/ui/` still contains ~50 SolidJS components (Kobalte-based) and a full CSS system. Only CSS styles and 3 components in `src/platform/loading.tsx` still depend on `src/ui/`. The goal is to fully remove this dependency and adopt shadcn/ui as the component and theming foundation.

## Decisions

- **Framework:** React only, zero SolidJS
- **Component library:** shadcn/ui as foundation, replace all UI components
- **Theme system:** shadcn convention (`--background`, `--foreground`, `--primary`, etc.), no legacy CSS variables
- **Custom components:** Refactor existing 5 React components (`spinner`, `text-shimmer`, `markdown`, `resize-handle`, `dock-surface`) to follow shadcn patterns (cn utility, Tailwind classes)
- **Approach:** Bottom-up (foundation first), single branch with phased commits

## Phase 1: Setup shadcn foundation

1. Create `src/openacp/lib/utils.ts` with `cn()` helper (clsx + tailwind-merge)
2. Create `src/openacp/styles/globals.css` with shadcn theme variables
   - Map current colors to shadcn convention:
     - `--background-base` → `--background`
     - `--text-strong` → `--foreground`
     - `--gray-dark-*` → `--muted`, `--accent`, `--border`, etc.
   - Dark theme (current app is dark-first)
3. Update `src/openacp/main.tsx` to import new `globals.css` instead of `../ui/src/styles/tailwind/index.css`
4. Add `components.json` for shadcn CLI
5. Install deps: `clsx`, `tailwind-merge`, `class-variance-authority`
6. Verify build + visual parity

## Phase 2: Install shadcn components + replace imports

Components currently used from `src/ui/` or local `ui/` folder:

| Current | Used by | Replacement |
|---------|---------|-------------|
| `Spinner` (local) | sidebar.tsx | Refactor with cn/cva pattern |
| `TextShimmer` (local) | message-turn.tsx, tool-block.tsx | Refactor with cn/Tailwind |
| `Markdown` (local) | text-block.tsx | Refactor with cn pattern (keep custom logic) |
| `ResizeHandle` (local) | sidebar.tsx, review-panel.tsx | Refactor with cn pattern |
| `DockShellForm/DockTray` (local) | composer.tsx | Refactor with cn pattern |
| `Font` (@openacp/ui) | loading.tsx | Inline or remove |
| `Splash` (@openacp/ui) | loading.tsx | Inline SVG |
| `Progress` (@openacp/ui) | loading.tsx | shadcn Progress |

1. Refactor 5 local components to shadcn pattern (cn, Tailwind, cva where useful)
2. Install shadcn `Progress` component
3. Update all imports

## Phase 3: Migrate src/platform/loading.tsx

1. Rewrite from SolidJS to React:
   - `createSignal` → `useState`
   - `createEffect` → `useEffect`
   - `createMemo` → `useMemo`
   - `onMount/onCleanup` → `useEffect` cleanup
   - `render()` → `createRoot().render()`
2. Replace `@openacp/ui/font` → inline or remove
3. Replace `@openacp/ui/logo` → inline SVG
4. Replace `@openacp/ui/progress` → shadcn Progress
5. Remove `@solidjs/meta` dependency

## Phase 4: Cleanup

1. Delete `src/ui/` folder
2. Remove `@openacp/ui/*` resolver from `vite.config.ts`
3. Remove `@openacp/ui/*` path mapping from `tsconfig.json`
4. Remove SolidJS-related dependencies from `package.json` (if any remain)
5. Update `CLAUDE.md` to reflect new architecture
6. Verify build passes with zero `src/ui` references

## Theme Mapping Reference

```
shadcn variable          ← current source
--background             ← --background-base (--gray-dark-1: #161616)
--foreground             ← --text-strong (--gray-dark-12: #ededed)
--muted                  ← --surface-weak (~--gray-dark-3)
--muted-foreground       ← --text-weak (~--gray-dark-11)
--primary                ← --icon-warning-base (accent color)
--primary-foreground     ← white
--border                 ← --gray-dark-5
--input                  ← --gray-dark-4
--ring                   ← --primary
--accent                 ← --gray-dark-4
--accent-foreground      ← --gray-dark-12
--card                   ← --gray-dark-2
--card-foreground        ← --gray-dark-12
--destructive            ← red scale
--destructive-foreground ← white
--radius                 ← 0.5rem
```

## Success Criteria

- `npx vite build` passes
- Zero imports from `src/ui/`
- Zero SolidJS code in codebase
- Visual appearance matches current app (dark theme, same colors)
- All existing functionality works (sidebar, chat, composer, loading screen)
