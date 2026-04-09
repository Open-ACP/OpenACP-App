# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenACP Desktop is a native desktop app for managing AI coding agents across multiple workspaces. Built with **Tauri 2** (Rust backend) and **React 19** (TypeScript frontend). Each workspace connects to a locally-running OpenACP server instance via REST + SSE.

## Commands

```bash
pnpm install              # Install dependencies
pnpm dev                  # Vite dev server (http://localhost:1420)
pnpm tauri dev            # Full Tauri dev app (frontend + Rust backend)
pnpm build                # TypeScript check + Vite production build
pnpm tauri build          # Build native desktop binaries
```

No test framework is configured yet.

## Architecture

### Module System

The repo uses a custom Vite resolver (`openacpResolver` in `vite.config.ts`) to simulate monorepo imports:

- `@openacp/ui/*` → `src/ui/src/components/*.tsx` or `src/ui/src/*`
- `@openacp/ui/theme` → `src/ui/src/theme/index.ts`
- `@openacp/ui/styles` → `src/ui/src/styles/index.css`
- `@openacp/util/*` → `src/util/src/*.ts`
- `@openacp/sdk/*` → `src/openacp-sdk/*`
- `@openacp/app` → `src/app/index.ts`
- `@/*` → `src/*` (tsconfig paths)

### Core Logic (`src/openacp/`)

The active application layer, organized as:

- **`api/client.ts`** — REST client for OpenACP server (health, agents, sessions, messages). All calls authenticated with Bearer token from `.openacp/api-secret`.
- **`api/sse.ts`** — Server-Sent Events manager for real-time updates (agent events, session CRUD). Per-workspace EventSource connections.
- **`context/workspace.tsx`** — Workspace context holding directory path, server info, and API client.
- **`context/sessions.tsx`** — Session CRUD with real-time SSE integration.
- **`context/chat.tsx`** — Chat state: messages, streaming, SSE connection. Accumulates streamed text from agent events.
- **`types.ts`** — Core types: `Session`, `Message`, `Agent`, `ServerInfo`.
- **`app.tsx`** — Root component (workspace management). **`main.tsx`** — Entry point.

### Design System (`src/openacp/components/ui/`)

**shadcn/ui** components (new-york style) built on **Radix UI** primitives. Components installed via `npx shadcn add`. Styling uses CSS layers (theme → base → components → utilities) with **Tailwind CSS 4**.

The legacy `src/ui/` library (Kobalte-based) is being phased out. New components should use shadcn/ui primitives from `src/openacp/components/ui/`.

**Styles** — flat 4-file layout in `src/openacp/styles/`:
- `index.css` — Entry point: Tailwind imports + `@theme` config + color registrations (no separate `tailwind/` dir)
- `theme.css` — Design tokens: colors, shadows, shadcn aliases (light/dark/dim themes)
- `components.css` — Component styles: markdown, `.oac-*` app styles
- `utilities.css` — Text presets, no-scrollbar, animations

### Design Reference

See `docs/design/DESIGN.md` for the full design system overview (tokens, components, Tailwind integration). Key files:

- **Pencil file**: `docs/design/pencil/openacp.pen` — 18 screens, 87 shadcn components. Read via Pencil MCP tools to match layout 1:1 when building FE.
- **Design tokens**: `src/openacp/styles/theme.css` — Semantic tokens + shadcn aliases (light/dark/dim).
- **Tailwind @theme**: `src/openacp/styles/index.css` — All tokens registered as Tailwind utilities in `@theme` blocks.
- **Demo page**: `/ds-demo.html` — Live showcase at `http://localhost:1420/ds-demo.html`. Reference this when building or reviewing UI.

**IMPORTANT — Design System Compliance:**
- When building new UI, brainstorming UI changes, or fixing UI issues, **always reference and follow the design system** (`docs/design/DESIGN.md` + demo page + Pencil file).
- **Never hardcode CSS values** — always use Tailwind utility classes and design tokens. No inline `color:`, `font-size:`, `padding:` with raw px/rem values.
- **Use component variants** (`variant`, `size` props) — don't override colors with custom `className` unless strictly needed for layout (`absolute`, `w-full`, etc.).
- **Icons**: Use `@phosphor-icons/react` — never inline SVG for standard icons.

### Platform Layer (`src/platform/`)

Tauri-specific integrations: command bindings, updater, zoom controls, app menu, i18n locale files.

### Rust Backend (`src-tauri/`)

Minimal Rust layer. Key command: `get_workspace_server_info` (reads `.openacp/api.port` + `.openacp/api-secret` from workspace directory).

### Component Hierarchy

```
PlatformProvider > AppBaseProviders > AppInterface > OpenACPApp
  ├── SidebarRail          (workspace switcher)
  └── WorkspaceProvider > SessionsProvider > ChatProvider
        ├── SidebarPanel   (session list, resizable)
        ├── ChatView       (message display)
        └── Composer       (input with DockPrompt)
```

### Legacy Code

`src/app/` and `src/openacp-sdk/` are legacy modules being phased out. New work should go in `src/openacp/`.

## Key Conventions

- **React 19** with TypeScript strict mode.
- **UI Components**: shadcn/ui (new-york style) + Radix UI primitives in `src/openacp/components/ui/`. Custom domain components in `src/openacp/components/`.
- **Icons**: `@phosphor-icons/react` (configured in `components.json`).
- **Styling**: Tailwind CSS 4 + shadcn design tokens in flat 4-file layout (`index.css`, `theme.css`, `components.css`, `utilities.css`). shadcn aliases (`--foreground`, `--border`, `--primary`) mapped to semantic tokens (`--text-strong`, `--border-base`). All color registrations in `index.css` `@theme` blocks (no `tailwind/` subdirectory).
- **State**: React Context + TanStack React Query for async data.
- **Component files**: one component per file, kebab-case filenames.
- **i18n**: translations in `src/platform/i18n/` and `src/ui/src/i18n/` (18+ languages).
- **Versioning**: date-based `YYYY.MDD.N` format (no leading zero on month, e.g. `2026.409.1`) via `scripts/release.sh`.

## Git Workflow

Two long-lived branches:

- **`main`** — stable, release-ready. Tags are cut from here.
- **`develop`** — active development. Default base for all feature work.
- **Feature branches** — always branched from `develop`.

### Branch naming

Use `<type>/<short-name>` where `<type>` matches the conventional commit type:

- `feat/<name>` — new features (e.g. `feat/onboarding-redesign`)
- `fix/<name>` — bug fixes (e.g. `fix/windows-ci-build`)
- `refactor/<name>` — refactors without behavior change
- `docs/<name>` — docs-only changes
- `chore/<name>` — tooling, deps, config

### Commit rules

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- **No `Co-Authored-By` lines**
- Keep commits focused — one logical change per commit

### Sync

Use `git rebase develop` (not merge) to keep feature branches up to date.

### Typical flow

```bash
# Start work
git checkout develop && git pull origin develop
git checkout -b <type>/<name>

# Commit + push
git add <files> && git commit -m "<type>: description"
git push origin <type>/<name>

# Create PR into develop
gh pr create --base develop --title "<type>: description" --body "..."

# Keep branch up to date
git checkout develop && git pull origin develop
git checkout <type>/<name> && git rebase develop
```

## Release Flow

Releases are cut from `main` via `scripts/release.sh`. The script is fully automated — it syncs versions, commits, tags, and pushes.

1. Merge `develop` → `main` once the release is ready.
2. On `main`, run the release script:
   ```bash
   ./scripts/release.sh           # auto-increment patch for today
   ./scripts/release.sh --dry     # preview next version + commits
   ./scripts/release.sh 2026.409.2  # explicit version
   ```
3. The script will:
   - Compute next version `YYYY.MDD.N` (auto-bumps `N` if there are existing tags for today)
   - Sync `package.json` and `src-tauri/Cargo.toml` to the new version
   - Create commit `release: YYYY.MDD.N` and tag `vYYYY.MDD.N`
   - Push commit + tag to `origin`
4. GitHub Actions (`.github/workflows/release.yml`) picks up the tag and builds Tauri binaries for macOS/Linux/Windows, then publishes a GitHub Release.

**Note**: builds are currently unsigned (signing env vars commented out in the workflow).
