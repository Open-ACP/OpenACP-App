# Terminal Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an integrated terminal panel to OpenACP Desktop that spawns a local shell via Tauri PTY, rendered with ghostty-web, positioned as a resizable bottom panel.

**Architecture:** Abstracted `PtyBackend` interface allows swapping local Tauri PTY for server-based PTY later. Rust backend uses `portable-pty` crate to spawn shell processes, streaming I/O via Tauri events. Frontend uses `ghostty-web` WebAssembly terminal emulator in a bottom panel with resize handle and tab support.

**Tech Stack:** Rust (portable-pty, tokio), Tauri 2 commands/events, ghostty-web (WASM terminal), React 19, motion (animations), ResizeHandle component.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src-tauri/src/core/pty/mod.rs` | PTY manager: spawn, write, resize, close processes |
| `src-tauri/src/core/pty/commands.rs` | Tauri command handlers for PTY operations |
| `src/openacp/lib/pty-backend.ts` | PtyBackend interface + TauriPtyBackend implementation |
| `src/openacp/context/terminal.tsx` | Terminal state context (sessions, active tab, open/height) |
| `src/openacp/components/terminal-panel.tsx` | Bottom panel UI: tabs, resize handle, terminal renderer |
| `src/openacp/components/terminal-renderer.tsx` | ghostty-web terminal component (isolated for perf) |

### Modified Files
| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `portable-pty` dependency |
| `src-tauri/src/core/mod.rs` | Add `pub mod pty;` |
| `src-tauri/src/lib.rs` | Register PTY commands |
| `package.json` | Add `ghostty-web` dependency |
| `src/openacp/app.tsx` | Add terminal panel to layout, terminalOpen state |
| `src/openacp/components/titlebar.tsx` | Add terminal toggle button |

---

## Task 1: Rust PTY Backend

### Files
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/core/pty/mod.rs`
- Create: `src-tauri/src/core/pty/commands.rs`
- Modify: `src-tauri/src/core/mod.rs`
- Modify: `src-tauri/src/lib.rs`

### Steps
- [ ] Add `portable-pty = "0.8"` to Cargo.toml dependencies
- [ ] Create `src-tauri/src/core/pty/mod.rs` with PtyManager (HashMap of sessions, spawn/write/resize/close)
- [ ] Create `src-tauri/src/core/pty/commands.rs` with Tauri commands: `pty_create`, `pty_write`, `pty_resize`, `pty_close`
- [ ] Register `pub mod pty;` in core/mod.rs
- [ ] Register commands in lib.rs invoke_handler
- [ ] Verify `cargo check` passes

## Task 2: Frontend PtyBackend Interface

### Files
- Create: `src/openacp/lib/pty-backend.ts`

### Steps
- [ ] Define `PtyBackend` interface (create, write, resize, close, onData)
- [ ] Implement `TauriPtyBackend` using Tauri invoke/listen
- [ ] Export factory function `createPtyBackend(type: 'tauri' | 'server')`

## Task 3: Install ghostty-web + Terminal Renderer

### Files
- Modify: `package.json`
- Create: `src/openacp/components/terminal-renderer.tsx`

### Steps
- [ ] Install ghostty-web: `pnpm add ghostty-web@github:anomalyco/ghostty-web#main`
- [ ] Create TerminalRenderer component (dynamic import ghostty-web, FitAddon, theme integration)
- [ ] Handle lifecycle: mount → open terminal → connect to PTY backend → dispose on unmount

## Task 4: Terminal Context + Panel UI

### Files
- Create: `src/openacp/context/terminal.tsx`
- Create: `src/openacp/components/terminal-panel.tsx`

### Steps
- [ ] Create TerminalProvider context (sessions list, activeId, open/close, height)
- [ ] Create TerminalPanel component (bottom panel, ResizeHandle vertical, tab bar, terminal renderer)
- [ ] Panel animations: height transition with motion, collapse on drag below threshold

## Task 5: Layout Integration

### Files
- Modify: `src/openacp/app.tsx`
- Modify: `src/openacp/components/titlebar.tsx`

### Steps
- [ ] Add Terminal icon button to titlebar (Terminal from @phosphor-icons/react)
- [ ] Add terminalOpen state to OpenACPAppInner
- [ ] Insert TerminalPanel below chat area in layout (between content and bottom edge)
- [ ] Pass terminalOpen/onToggleTerminal to Titlebar
- [ ] Visibility logic: hide terminal button for remote participants

## Task 6: Commit + Verify

- [ ] Run `pnpm build` to verify TypeScript
- [ ] Run `cargo check` to verify Rust
- [ ] Commit all changes
