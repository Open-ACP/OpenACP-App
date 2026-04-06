# OpenACP Desktop

<p align="center">
  <img alt="GitHub release" src="https://img.shields.io/github/v/release/Open-ACP/OpenACP-App"/>
  <img alt="GitHub commit activity" src="https://img.shields.io/github/commit-activity/m/Open-ACP/OpenACP-App"/>
  <img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/Open-ACP/OpenACP-App"/>
  <img alt="GitHub license" src="https://img.shields.io/github/license/Open-ACP/OpenACP-App"/>
</p>

<p align="center">
  <a href="https://github.com/Open-ACP/OpenACP-App/releases">Download</a>
  &middot; <a href="https://github.com/Open-ACP/OpenACP">OpenACP Server</a>
  &middot; <a href="https://github.com/Open-ACP/OpenACP-App/issues">Bug Reports</a>
  &middot; <a href="https://github.com/Open-ACP/OpenACP-App/discussions">Discussions</a>
</p>

Desktop app for [OpenACP](https://github.com/Open-ACP/OpenACP) — a chat interface for managing AI coding agents across multiple workspaces. Built with Tauri 2 and React.

## Download

| Platform | Download |
|----------|----------|
| **macOS** (Apple Silicon) | [OpenACP.dmg](https://github.com/Open-ACP/OpenACP-App/releases/latest) |
| **macOS** (Intel) | [OpenACP.dmg](https://github.com/Open-ACP/OpenACP-App/releases/latest) |
| **Windows** | [OpenACP-Setup.exe](https://github.com/Open-ACP/OpenACP-App/releases/latest) |
| **Linux** (deb) | [openacp.deb](https://github.com/Open-ACP/OpenACP-App/releases/latest) |
| **Linux** (AppImage) | [OpenACP.AppImage](https://github.com/Open-ACP/OpenACP-App/releases/latest) |

Or build from source (see below).

## Features

- **Multi-workspace** — connect to multiple OpenACP server instances, each in its own project folder
- **Streaming chat** — real-time agent responses with tool calls, thinking blocks, and markdown rendering
- **Agent switching** — switch between Claude Code, Gemini CLI, Codex, and 28+ other agents mid-conversation
- **Permission control** — approve or deny agent actions with inline buttons
- **Session management** — create, switch, and archive sessions per workspace
- **Auto-updater** — receive update notifications and install with one click
- **Cross-platform** — native app for macOS, Windows, and Linux

## Prerequisites

- [OpenACP](https://github.com/Open-ACP/OpenACP) server running in your workspace (`openacp start`)

For building from source:
- Node.js 22+
- pnpm 9+
- Rust — install via [rustup.rs](https://rustup.rs)

## Development

```bash
git clone https://github.com/Open-ACP/OpenACP-App
cd OpenACP-App
make install
make tauri-dev
```

**Available make targets:**

| Command | Description |
|---------|-------------|
| `make install` | Install dependencies |
| `make dev` | Vite dev server (frontend only) |
| `make tauri-dev` | Full Tauri dev app (frontend + Rust) |
| `make build` | TypeScript check + Vite production build |
| `make tauri-build` | Build native desktop binaries |
| `make lint` | Type check |
| `make release` | Tag and push release (triggers CI) |
| `make release-dry` | Preview next version |
| `make clean` | Clean build artifacts |

## Architecture

```
src/openacp/              — Application logic
  api/                    — REST client + SSE manager
  context/                — React contexts (workspace, sessions, chat)
  components/             — UI components (sidebar, composer, chat view)
  hooks/                  — Custom hooks (updater, auto-scroll, pacing)
src/ui/                   — @openacp/ui design system (Radix UI + Tailwind CSS 4)
src-tauri/                — Tauri backend (Rust)
  src/core/               — Modular backend (sidecar, keychain, onboarding)
```

Each workspace connects to its own OpenACP server via `.openacp/api.port` and `.openacp/api-secret` files in the project directory.

## Release

Versioning follows date-based format: `YYYY.MDD.N` (e.g. `2026.406.1`)

```bash
make release        # Interactive: confirm → commit → tag → push → CI builds
make release-dry    # Preview next version without changes
```

CI automatically builds for all platforms and publishes to GitHub Releases.

## Contributing

1. Fork the repo
2. Create a feature branch from `develop`: `git checkout -b feat/my-feature develop`
3. Make changes in `src/openacp/`
4. Run `pnpm build` to verify
5. Open a PR to `develop`

See [issue templates](https://github.com/Open-ACP/OpenACP-App/issues/new/choose) for bug reports and feature requests.

## License

MIT
