# Workflow Log

Chronological record of design & development sessions.

## 2026-04-02

### Session 1cf75d51

- Setup moi truong: install deps (pnpm), cai Rust toolchain, build Tauri app (544 crates, 5m36s)
- Checkout `develop`, rebuild (39s voi cache)
- Thiet ke UI/UX flow "Installing OpenACP" trong Pencil MCP:
  - Screen 1: In Progress — icon, 3 steps, progress bar 67%, install plan card
  - Screen 2: Success — all steps done, "Get started" card, Open Documentation button
  - Screen 3: Error — failed step, alert box, Retry Installation button
- Dung design tokens co san: `--primary`, `--color-success`, `--color-error`
- Reuse components: Progress bar, Alert, Button
- Update 8 skills git cho khop convention (branch `hiru-`, docs trong `docs/design/`, UPPERCASE filenames)
- Tao `docs/design/DESIGN.md` voi full design system overview
- Tao `docs/design/STATUS.md`, commit + push len develop
- Merge develop vao hiru-uiux, push len remote
- Setup memory system (git confirm rule, user profile, project conventions)

## 2026-04-06

### Session dd4da782

- **PR #3 Review Fixes (all 6 items from lngdao review):**
  - Regenerated icon.ico (285KB, 4 sizes RGBA) from IconKitchen source
  - Applied circular mask to Android round icons (all 5 densities)
  - Regenerated all platform icons: macOS icns, iOS 18 files, Windows Store 10 files
  - Removed dead deps: lucide-react, next-themes, cmdk, sonner
  - Deleted 6 unused shadcn components (~1,500 lines): checkbox, progress, sonner, command, sidebar, use-mobile
  - Stripped "use client" directives from 3 shadcn component files
- **CSS Cleanup (~30KB removed):**
  - Deleted colors.css (25KB — entirely unreferenced color palette)
  - Deleted animations.css (2KB — unused keyframes)
  - Removed 4 unused @utility definitions from tailwind/utilities.css
  - Removed 3 unused text utility classes from utilities.css
  - Removed dock-surface styles from components.css
  - Gitignored generated Pencil PNGs (~14MB)
- **Color Token Migration (Phase 1+2 of 3):**
  - Phase 1: Inverted aliases in theme.css — shadcn tokens now source of truth, legacy tokens become backward-compat aliases
  - Added 3 extension tokens: --border-weak, --foreground-weak, --foreground-weaker
  - Phase 2: Migrated 27 app component .tsx files from legacy token classes to shadcn naming
  - Updated var() references in styles.css and components.css
  - Phase 3 (deferred): Remove legacy backward-compat aliases
  - Wrote design spec: docs/superpowers/specs/2026-04-06-color-token-migration-design.md
- **Rebase & Conflict Resolution:**
  - Rebased hiru/uiux onto develop (2 conflicts resolved: agent-selector.tsx, sidebar-rail.tsx)
  - Kept shadcn components + merged new features (agent switching, install agent button)
- **Build:** all passes, visual QA confirmed
- **Color Token Phase 3 (complete):**
  - Migrated remaining inline var() references (14 files)
  - Updated syntax tokens in theme.css to use shadcn tokens
  - Removed all backward-compat aliases from theme.css
  - Updated tailwind/colors.css registrations
  - Zero legacy token references remaining
- **Typography System Refactor:**
  - Renamed text utility classes: text-12→sm, text-14→md, text-16→lg, text-20→xl, text-11/10→2xs
  - Rewrote utilities.css with @apply + Tailwind theme() references
  - Removed 14 duplicate token definitions from theme.css (spacing, breakpoints, containers, radius)
  - Removed legacy font-size/weight/line-height CSS vars — inlined into Tailwind @theme
  - Defined font-size scale in rem (text-2xs through text-3xl, base 1rem=16px)
  - Fixed --color-text-base collision with Tailwind text-base utility
  - Fixed root font-size: moved data-font-size from html to body (preserve rem=16px)
  - Fixed dark mode --primary-foreground contrast
  - Added cursor-pointer to Button component
- **Design System Demo Page:**
  - Created ds-demo.html + src/ds-demo/ (app, sidebar, component-page, token-page, registry)
  - 18 demo entries: 12 components + 5 token pages (Colors, Typography, Spacing, Shadows, Radius)
  - Vite multi-page config, dark/light toggle, flat sidebar
  - Accessible at http://localhost:1420/ds-demo.html

### Session c7163d3f

- **Settings Dialog Redesign (full brainstorm → plan → implementation):**
  - Brainstormed with user: sidebar nav (grouped), 800→900px dialog, card group style
  - Drew 2 Pencil mockup screens: Settings General + Settings Agents
  - Wrote design spec: `docs/superpowers/specs/2026-04-06-settings-dialog-design.md`
  - Wrote implementation plan: `docs/superpowers/plans/2026-04-06-settings-dialog.md`
  - Executed plan via subagent-driven development (10 tasks):
    - Created shared components: `setting-card.tsx`, `setting-row.tsx`
    - Created `settings-dialog.tsx` with grouped sidebar nav (App/Server/Info) + content routing
    - Refactored 5 sub-components (general, appearance, server, about, agents) to card group style
    - Wired up in `app.tsx` — settings now Dialog overlay, no longer replaces chat view
    - Deleted old `settings-panel.tsx`
  - Fixed `sm:max-w-lg` override from base DialogContent class
  - User polish: sidebar bg, content width, nav item sizing
- **UI Polish (user changes):**
  - Chat view, composer, review panel, sidebar — significant refactors
  - CLAUDE.md + DESIGN.md updates (design system compliance rules)
  - Minor component cleanup: add-workspace, plugins, button, dialog
- **Build:** all passes
- **Color token collision fix:**
  - Renamed all `--text-*` color tokens in theme.css → `--color-text-*` (102 definitions)
  - `--text-base` was both a color (#6f6f6f) and font-size (1rem) — now separated
  - Updated references in index.css, components.css, onboarding files
  - Font-size tokens (`--text-sm`, `--text-base: 1rem`, etc.) untouched

## 2026-04-04

### Session 2ec35511

- **shadcn/ui Migration (full plan execution):**
  - Added token alias layer (sidebar tokens) to theme.css + Tailwind colors
  - Installed 19 shadcn components via CLI (button, badge, input, dialog, tabs, command, sidebar, sheet, sonner, etc.)
  - Fixed all lucide-react imports → @phosphor-icons/react across 8 generated files
  - Fixed sonner.tsx: removed next-themes dependency, adapted for Tauri
  - Migrated 15 app components to use shadcn primitives:
    - welcome.tsx: Button
    - add-workspace/*: Dialog, Tabs, Input, Select, Button, Badge
    - plugins-modal/installed/marketplace: Dialog, Tabs, Switch, Badge, Button, Input
    - sidebar + sidebar-rail: Button
    - command-palette: Input, Button
    - composer: Button
    - chat-view: Button
    - agent-selector: DropdownMenu (replaced createPortal)
    - config-selector: DropdownMenu (replaced createPortal)
    - review-panel: Button
  - Added vite.config.ts aliases for shadcn component resolution
- **App Icon Update:**
  - Generated all platform icons from new OpenACP SVG logo (resvg renderer)
  - macOS (.icns), Windows (.ico), Android (mipmap-*), iOS (AppIcon-*)
- **Docs Update:**
  - CLAUDE.md: React 19, shadcn/ui, git workflow section, design reference
  - DESIGN.md: full rewrite with current architecture
  - Updated ket-phien skill: branch prefix hiru/ (slash), rebase not merge, PR to fork's develop
- **Build:** all passes, no errors

## 2026-04-02

### Session ddb353be

- Ve 11 Pencil mockup screens trong `docs/design/pencil/openacp.pen`:
  - 3 screens Installing flow (In Progress, Success, Error)
  - 3 screens App states (Welcome, Empty State, Chat Active)
  - 5 screens Onboarding wizard (Splash, Install, Setup Step 1 & 2, Update Toast)
- Restyle 4 onboarding components tu dark theme sang design system tokens:
  - `splash-screen.tsx`, `install-screen.tsx`, `setup-wizard.tsx`, `update-toast.tsx`
  - Dung custom typography: `text-14-medium`, `text-12-regular`, `text-20-medium`
  - Dung Tailwind color tokens: `bg-text-strong`, `text-text-weak`, `border-border-base`
- Fix bugs: agent list parsing (Tauri pre-parsed object), CSS variables sai ten, missing tailwind import
- Them app CSS variables vao Pencil file (match `--background-base`, `--text-strong`, etc.)
- Replace toan bo 11 screens tu shadcn variables sang app variables
- Merge develop, resolve conflicts, commit + push
- Tao PR #1 (fork) → squash merge vao develop → upstream PR #6 auto-update
- Doc CONTRIBUTING-GUIDE.md, cap nhat CLAUDE.md voi git workflow conventions
- Tao PR #2: docs update CLAUDE.md
