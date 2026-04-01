# OpenACP Desktop

Desktop application for [OpenACP](https://github.com/lngdao/OpenACP) — manage AI coding agents across multiple workspaces.

## Features

- **Multi-workspace** — connect to multiple OpenACP server instances, each running in its own project folder
- **Chat** — send prompts and receive streaming responses via SSE
- **Model & Mode selection** — switch between agents (Claude, Codex), models (Opus, Sonnet, Haiku), and modes (Default, Plan, Accept Edits)
- **Session management** — create, switch, and archive sessions per workspace

## Prerequisites

- [OpenACP](https://github.com/lngdao/OpenACP) server running in your workspace (`openacp start`)
- Node.js 22+
- pnpm 9+
- Rust (for Tauri)

## Development

```bash
pnpm install
pnpm tauri dev
```

## Build

```bash
pnpm tauri build
```

## Release

```bash
./scripts/release.sh        # Tag and push (triggers CI/CD)
./scripts/release.sh --dry  # Preview version
```

Versioning follows date-based format: `YYYY.MMDD.N`

## Architecture

```
src/openacp/          — Application logic
  api/                — REST client + SSE manager
  context/            — SolidJS contexts (workspace, sessions, chat)
  components/         — UI components (sidebar, composer, chat view)
src/ui/               — @openacp/ui design system
src-tauri/            — Tauri backend (Rust)
```

Each workspace connects to its own OpenACP server via `.openacp/api.port` and `.openacp/api-secret` files in the project directory.

## License

MIT
