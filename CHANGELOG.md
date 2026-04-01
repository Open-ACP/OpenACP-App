# Changelog

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
