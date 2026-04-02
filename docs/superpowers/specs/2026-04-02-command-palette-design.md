# Command Palette — Design Spec

**Date:** 2026-04-02  
**Status:** Approved  
**Scope:** Replace SlashCommandPopover with unified Command Palette

---

## Overview

Single command palette component serving as the central action hub for the desktop app. Replaces the existing `SlashCommandPopover` with a unified, searchable, grouped action menu.

## Entry Points

| Trigger | Behavior |
|---------|----------|
| `Cmd+/` | Open palette (empty search) |
| Type `/` in composer input | Open palette, pre-filter Commands group |
| Click ⌘ button in composer | Toggle palette open/close |

## Component Architecture

**One component:** `CommandPalette` replaces both `SlashCommandPopover` and current `CommandPalette`.

```
CommandPalette
├── SearchInput (autofocus, filter all items)
├── GroupedList
│   ├── Context group (client-side actions)
│   ├── Session group (client + API)
│   ├── Configuration group (API, sub-pickers)
│   └── Commands group (dynamic from server)
└── SubPicker (inline replacement for multi-step actions)
```

**Files:**
- `src/openacp/components/command-palette.tsx` — rewrite existing file
- `src/openacp/components/composer.tsx` — update triggers, remove SlashCommandPopover import
- Delete: `src/openacp/components/slash-commands.tsx`

## Action Groups

### Context (client-side)

| Action | Type | Behavior |
|--------|------|----------|
| Attach file... | immediate | Open file picker (placeholder) |
| Mention file... | immediate | Open file search (placeholder) |
| Clear conversation | immediate | Clear messages in current session |

### Session (client + API)

| Action | Type | Behavior |
|--------|------|----------|
| New session | immediate | `POST /sessions`, switch to it |
| Cancel prompt | immediate | Execute `/cancel` via API |
| Close session | immediate | `DELETE /sessions/:id` |
| Fork session | immediate | Execute `/fork` (if agent supports) |

### Configuration (API, sub-picker)

| Action | Type | Behavior |
|--------|------|----------|
| Mode | sub-picker | Fetch config options → show choices → apply |
| Model | sub-picker | Fetch config options → show choices → apply |
| Thinking | toggle | Toggle thinking config option |
| Bypass Permissions | toggle | Toggle `clientOverrides.bypassPermissions` |

### Commands (dynamic from server)

| Source | Fetch | Filter |
|--------|-------|--------|
| `GET /api/v1/commands` | On palette open | Remove platform-specific (telegram, discord, tts, tunnel, usage, summary, archive) |

Each server command: execute via `POST /api/v1/commands/execute` with `{ command: "/<name> <args>", sessionId }`.

## Interaction Flow

### Simple actions (cancel, clear, toggles)
1. User clicks item
2. Execute action immediately
3. Close palette
4. Show toast if needed (error/success)

### Multi-step actions (mode, model)
1. User clicks "Mode"
2. Palette transitions to sub-picker view
3. Fetch config options from `GET /sessions/:id/config`
4. Show choices with current value marked
5. User clicks choice → `PUT /sessions/:id/config/:configId`
6. Close palette

### Slash command trigger
1. User types `/` in composer input
2. Palette opens with Commands group pre-filtered
3. Continue typing filters further (e.g., `/mo` shows `/mode`, `/model`)
4. Click item → execute, don't fill input
5. Escape → close palette, clear `/` from input

### Keyboard
- `Cmd+/` → open/close palette
- `Escape` → close palette (or back from sub-picker to main list)
- `Arrow Up/Down` → navigate items
- `Enter` → select highlighted item

## Data Flow

```
Palette opens
├── Static items: Context + Session groups (hardcoded)
├── Config items: fetch GET /sessions/:id/config → Configuration group
└── Server commands: fetch GET /api/v1/commands → Commands group

User selects action
├── immediate → execute, close, optional toast
├── sub-picker → fetch options, show picker, execute on select
└── toggle → flip value via API, close
```

## API Integration

| Endpoint | Usage |
|----------|-------|
| `GET /api/v1/commands` | Fetch registered commands on palette open |
| `POST /api/v1/commands/execute` | Execute server command |
| `GET /api/v1/sessions/:id/config` | Fetch config options for sub-pickers |
| `PUT /api/v1/sessions/:id/config/:cfgId` | Set config option |
| `PUT /api/v1/sessions/:id/config/overrides` | Set bypass permissions |
| `POST /api/v1/sessions` | Create new session |
| `DELETE /api/v1/sessions/:id` | Close/cancel session |

## Platform-specific command filter

Remove from Commands group if command name matches:
```
tunnel, tunnels, usage, summary, archive, clear, 
tts, text_to_speech, enable_bypass, disable_bypass,
resume, integrate
```

These are Telegram/Discord-specific or have dedicated UI in the app.

## Edge Cases

- **No active session:** Disable session-dependent actions (cancel, close, fork, config). Keep "New session" enabled.
- **Agent doesn't support fork:** Hide "Fork session" (check `agentCapabilities.sessionCapabilities.fork`).
- **Server unreachable:** Show static items only, server commands show "Server unavailable" message.
- **Config fetch fails:** Show "Configuration unavailable" in sub-picker.
- **Command execute fails:** Show error toast, don't close palette.

## Visual Design

- Same popover position as current (above composer input)
- Search input at top with "Filter actions..." placeholder
- Group headers: 11px, `--text-weaker` color
- Items: 13px label, 12px description, hover highlight
- Sub-picker: same container, back arrow + group title at top
- Toggle items: show on/off state inline (right side)
- Current config value: show right-aligned in muted text
