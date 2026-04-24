# Changelog

## Unreleased

### Added
- Rich chat UI with markdown rendering (Shiki syntax highlighting, code copy buttons, KaTeX math)
- Part-based message rendering: text, thinking, tool calls with status dots
- Tool call display with BasicTool component (collapsible output, status indicators)
- Chat header with session title, context circle, and more options placeholders
- Hover metadata on messages: timestamp + copy button for user messages, copy for assistant text
- Session history persistence via new server endpoint (`GET /sessions/:id/history`)
- Client-side history cache using Tauri Store plugin (instant restore on session switch)
- History-to-message conversion (server Turn/Step format to app MessagePart format)
- Welcome screen with auto-discovered workspaces from `~/.openacp/instances.json`
- Workspace persistence (Tauri Store) with last-active restore on app launch
- Server auto-reconnect with polling when server restarts (health check + retry)
- Empty state with "New Session" button when no session selected
- Toast notifications for session creation errors (max sessions reached, etc.)
- Bypass permissions mode detection with red border on composer input
- Custom CSS for tool output, copy buttons, spinner animation
- Tauri command `discover_workspaces` for reading instance registry

### Changed
- Add Workspace → Local: "Choose a folder" result and the agent-setup step now slide in as focused overlay steps inside the same modal; the workspace list and picker are unmounted while the user configures the picked folder, preventing mid-flow misclicks. The previously-separate "Set up workspace" dialog is gone — agent selection is now a 3rd step in the same flow.
- Messages use `parts: MessagePart[]` instead of plain `content: string`
- Chat context handles text, thought, tool_call, tool_update, usage, error events as structured parts
- SSE AgentEvent types now discriminated union matching server event format
- Agent selector renamed from model-selector (file + component + labels)
- Composer layout: agent left, model center, modes right-aligned
- Config selector popover: description below label, smaller font sizes, dynamic placement
- Sidebar "New session" creates session eagerly before chat
- Session remove works even if server returns 500
- Chat view padding responsive on small screens
- Rail workspace items refined with ring indicator for active state
- MarkedProvider wraps app root for markdown rendering
- tsconfig paths added for `@openacp/ui/*` and `@openacp/util/*`

## 2026.0401.1

### Added
- New clean logic layer in `src/openacp/` replacing legacy OpenCode code
- Per-workspace server connection via `.openacp/api.port` and `api-secret`
- Session list with create, delete, and real-time updates via SSE
- Chat with SSE streaming text responses
- Model selector (agents from `/agents` API)
- Mode and model config selectors per session (`/mode`, `/model`)
- Workspace rail with multiple workspace support and folder picker
- Resizable sidebar panel matching OpenCode design system
- Slash command popover for `/mode` and `/model`
- Tauri `get_workspace_server_info` command for per-workspace server resolution
- CI/CD GitHub Actions workflow for multi-platform Tauri builds
- Date-based versioning (`YYYY.MMDD.N`) with release script

### Changed
- Entry point moved from `src/main.tsx` to `src/openacp/main.tsx`
- CSS imports directly from `src/ui/` design system
- Sidebar uses `@openacp/ui` components (Avatar, Icon, IconButton, Tooltip, etc.)
- Composer uses DockShellForm/DockTray from design system

### Removed
- Legacy OpenCode logic layer (`src/app/`, `src/openacp-sdk/`)
- Provider marketplace (connect/custom provider dialogs)
- File tree, diff viewer, review tabs
- MCP status, LSP diagnostics
- Permission management UI
- Worktree management
- Session sharing, comments system
- Debug performance overlay
