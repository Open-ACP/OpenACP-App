# Project Status

## Current State
- Branch: `hiru/uiux`
- Last updated: 2026-04-05

## In Progress
- Visual QA — app icon shows correct in file but macOS Dock caches old icon (needs reboot)
- Phase 3 cleanup — remove unused custom component code after full visual verification

## Completed
- Setup moi truong dev (Node.js, pnpm, Rust, Tauri)
- Build va chay full Tauri app
- 18 Pencil mockup screens with shadcn component refs
- shadcn/ui migration: 19 components installed, 15 app components migrated
- Token alias layer (sidebar tokens) in theme.css + Tailwind colors
- All lucide-react imports replaced with @phosphor-icons/react
- Agent/config selectors: createPortal → shadcn DropdownMenu
- Plugins modal + add-workspace modal: manual portal → shadcn Dialog
- App icons regenerated from new OpenACP SVG logo (all platforms)
- CLAUDE.md updated: React 19, shadcn/ui, git workflow, design reference
- DESIGN.md full rewrite with current architecture
- ket-phien skill updated: branch hiru/ (slash), rebase, PR to fork develop

## Blockers
- macOS Dock icon cache — needs reboot to show new icon
- No test framework yet (Vitest + React Testing Library)
