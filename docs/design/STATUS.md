# Project Status

## Current State
- Branch: `hiru-uiux`
- Last updated: 2026-04-02

## In Progress
- Onboarding UI restyle — code pushed, chua verify visual cuoi cung tren app
- Pencil designs dang dung 2 bo variables (shadcn + app) — can migrate hoan toan

## Completed
- Setup moi truong dev (Node.js, pnpm, Rust, Tauri)
- Build va chay full Tauri app
- 11 Pencil mockup screens (install flow, app states, onboarding wizard)
- Restyle 4 onboarding components (splash, install, setup wizard, update toast)
- Fix agent list parsing (handle envelope + plain array formats)
- Them tailwind CSS import cho onboarding screens (`src/main.tsx`)
- Them app CSS variables vao Pencil file
- Replace Pencil screens tu shadcn vars sang app vars
- Cap nhat CLAUDE.md voi git workflow conventions (tu CONTRIBUTING-GUIDE)
- Setup memory system (git confirm, user profile, conventions)
- PR #1 merged vao fork develop
- PR #2 created: CLAUDE.md docs update
- Upstream PR #6 auto-updated

## Blockers
- Chua co push access tren Open-ACP/OpenACP-App (dang dung fork workflow)
- Chua co test framework (Vitest + @solidjs/testing-library)
- Chua co Settings dialog UI (theme switcher, font selector) — infra co san
