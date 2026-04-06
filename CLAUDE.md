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

### Design System (`src/ui/`)

Custom `@openacp/ui` library built on **Radix UI** headless components. 50+ components with co-located CSS files. Styling uses CSS layers (theme → base → components → utilities) with **Tailwind CSS 4** and design tokens in `src/ui/src/styles/`.

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

- **React 19, not SolidJS** — uses hooks (`useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`), React context, `use-immer` for state management.
- **TypeScript strict mode** with `jsxImportSource: "react"`.
- **Component files**: one component per file, kebab-case filenames.
- **Styling**: co-located CSS files alongside components. Theme tokens as CSS custom properties (`--color-*`, `--background-*`).
- **State**: React contexts + `useImmer` stores for app state, TanStack React Query for async data.
- **i18n**: translations in `src/platform/i18n/` and `src/ui/src/i18n/` (18+ languages).
- **Versioning**: date-based `YYYY.MMDD.N` format via `scripts/release.sh`.
