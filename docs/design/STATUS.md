# Project Status

## Current State
- Branch: `hiru/uiux`
- Last updated: 2026-04-06

## In Progress
- Settings dialog visual polish (text wrapping in card rows still needs tuning)
- Audit + restructure styles/ directory (currently messy: duplicate files, unclear boundaries)
- ds-demo page polish (typography page color fix verified, more component demos)

## Completed
- Settings dialog redesign: full-page panel → Dialog overlay with grouped sidebar nav + card groups
- Color token collision fix: `--text-*` color tokens renamed to `--color-text-*` (avoid font-size collision)
- Setup moi truong dev (Node.js, pnpm, Rust, Tauri)
- Build va chay full Tauri app
- 18 Pencil mockup screens with shadcn component refs
- shadcn/ui migration: 19 components installed, 15 app components migrated
- Token alias layer (sidebar tokens) in theme.css + Tailwind colors
- All lucide-react imports replaced with @phosphor-icons/react
- Agent/config selectors: createPortal → shadcn DropdownMenu
- Plugins modal + add-workspace modal: manual portal → shadcn Dialog
- App icons regenerated from IconKitchen (all platforms, RGBA, round masks)
- CLAUDE.md updated: React 19, shadcn/ui, git workflow, design reference
- DESIGN.md full rewrite with current architecture
- PR #3 review fixes: dead deps, unused components, dead CSS, icons, "use client"
- Color token migration (all 3 phases complete): shadcn tokens as source of truth, legacy aliases removed
- Typography system refactor: semantic naming (sm/md/lg/xl), rem-based scale, Tailwind @theme
- Font-size scaling fix: body instead of html root (preserve rem=16px)
- Design system demo page: ds-demo.html with 18 entries

## Blockers
- No test framework yet (Vitest + React Testing Library)
- styles/ directory needs restructuring (duplicate files, unclear boundaries between tailwind/ and root)
