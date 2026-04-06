# Settings Dialog Redesign

## Summary

Convert the Settings panel from a full-page replacement into a Dialog overlay with sidebar navigation, matching the pattern used by Add Workspace and Plugins modals. Reference: OpenCode Desktop settings UI.

## Current State

- `settings-panel.tsx` renders as a full-page panel that replaces the chat view
- 5 sub-components: `settings-general`, `settings-agents`, `settings-appearance`, `settings-server`, `settings-about`
- Left sidebar nav (200px) with flat list of 5 items + right content area (max-width 560px)
- Triggered from SidebarRail gear icon and Composer "Install agent..." button

## Target State

### Dialog Container

- **Component**: shadcn `<Dialog>` with custom content layout
- **Size**: 800x560px, centered overlay with backdrop blur
- **Style**: `bg-card`, `rounded-xl`, shadow, `overflow-hidden`
- **Close**: X button top-right corner, Escape key, backdrop click

### Internal Layout — 2 Columns

```
┌──────────┬──────────────────────────────┐
│ Sidebar  │  Content Area               │
│ 200px    │  flex-1, scrollable          │
│ border-r │  max-w-[480px] centered      │
│          │  px-8 py-6                   │
└──────────┴──────────────────────────────┘
```

### Sidebar Navigation

Grouped sections with Phosphor icons:

```
App
  GearSix        General
  Palette        Appearance

Server
  Robot          Agents
  Desktop        Server

Info
  Info           About
```

**Group labels**: `text-[11px] uppercase tracking-wider text-muted-foreground`, `mb-1 mt-4` (first group no top margin)

**Nav items**:
- Active: `bg-sidebar-accent text-sidebar-accent-foreground rounded-md`
- Default: `text-sidebar-foreground`, hover subtle bg
- Icon (20px) + label, `gap-2`, `px-2 py-1.5`

**Version**: displayed at bottom of sidebar (`text-xs text-muted-foreground`)

### Content Area — Card Groups

Each settings page renders one or more card groups:

**Card group wrapper** (`setting-card`):
- `bg-muted/50 rounded-lg overflow-hidden`
- Contains setting rows separated by dividers

**Setting row** (`setting-row`):
- Flex row, `justify-between items-center`
- Left: label (`text-sm font-medium`) + description (`text-sm text-muted-foreground`)
- Right: control (Select, Switch, ButtonGroup, text display)
- Padding: `px-4 py-3`
- Divider: `border-b border-border-weak last:border-0` inside card

### Content Panels

**General**:
- Card "General": Language (Select), Workspace path (read-only)

**Appearance**:
- Card "Theme": Color scheme (ButtonGroup: Light/Dark/System)
- Card "Typography": Font size (ButtonGroup: Small/Medium/Large)

**Agents**:
- List-based layout (not card groups) — search bar + installed/available agents + install logs
- Minimal structural change from current implementation

**Server**:
- Card "Connection": Status (Badge: Connected/Disconnected), Server URL (read-only)

**About**:
- Card "Application": Version (text), Links (GitHub, Docs), Check for updates (Button)

## File Changes

### Delete
- `settings-panel.tsx` — old full-page container

### Create
- `settings-dialog.tsx` — Dialog root with sidebar nav + content routing
- `setting-card.tsx` — Card group wrapper component
- `setting-row.tsx` — Row component (label + description + control + divider)

### Refactor
- `settings-general.tsx` — adapt to card group style using `SettingCard` + `SettingRow`
- `settings-appearance.tsx` — adapt to card group style
- `settings-agents.tsx` — minimal change, wrap in content area
- `settings-server.tsx` — adapt to card group style
- `settings-about.tsx` — adapt to card group style

### Update References
- `app.tsx` — replace `<SettingsPanel>` with `<SettingsDialog>`, adapt state to `open/onOpenChange`
- `sidebar-rail.tsx` — keep trigger, update callback signature
- `composer.tsx` — keep custom event, no change needed

### No Changes
- `ui/dialog.tsx` — reuse as-is
- Context/providers — no impact
- Any other components

## Trigger Points

1. **SidebarRail gear icon** → opens dialog at General tab
2. **Composer "Install agent..." button** → dispatches `open-settings` custom event, opens at Agents tab
3. **State**: `open: boolean` + `page: SettingsPage` managed in `app.tsx`, passed as Dialog `open/onOpenChange` props

## Design Tokens

Uses existing design system tokens:
- Colors: `--card`, `--muted`, `--muted-foreground`, `--foreground`, `--border`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-foreground`
- Typography: Inter font, standard text sizes
- Spacing: Tailwind utilities
- Icons: Phosphor icons (`@phosphor-icons/react`)
