# Settings Dialog Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Settings panel from a full-page replacement into a Dialog overlay with sidebar navigation and card-grouped content.

**Architecture:** Create shared `SettingCard` and `SettingRow` components, then a new `SettingsDialog` that wraps a sidebar nav + content area in a shadcn Dialog. Refactor each settings sub-component to use the new card group style. Finally, update `app.tsx` to swap `SettingsPanel` for `SettingsDialog` and delete the old file.

**Tech Stack:** React 19, TypeScript, shadcn/ui Dialog (Radix), Tailwind CSS 4, Phosphor Icons

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/openacp/components/settings/setting-card.tsx` | Card group wrapper with muted bg + rounded corners |
| Create | `src/openacp/components/settings/setting-row.tsx` | Shared row: label + description + control slot + divider |
| Create | `src/openacp/components/settings/settings-dialog.tsx` | Dialog root: sidebar nav (grouped) + content routing |
| Refactor | `src/openacp/components/settings/settings-general.tsx` | Use SettingCard + SettingRow, remove local SettingRow |
| Refactor | `src/openacp/components/settings/settings-appearance.tsx` | Use SettingCard + SettingRow, remove local SettingRow |
| Refactor | `src/openacp/components/settings/settings-server.tsx` | Use SettingCard + SettingRow, remove local SettingRow |
| Refactor | `src/openacp/components/settings/settings-about.tsx` | Use SettingCard + SettingRow, remove local SettingRow |
| Refactor | `src/openacp/components/settings/settings-agents.tsx` | Minimal — remove header section, content area handles title |
| Modify | `src/openacp/app.tsx` | Swap SettingsPanel → SettingsDialog, change from conditional render to Dialog open/onOpenChange |
| Delete | `src/openacp/components/settings/settings-panel.tsx` | Old full-page container |

---

### Task 1: Create `SettingCard` component

**Files:**
- Create: `src/openacp/components/settings/setting-card.tsx`

- [ ] **Step 1: Create the SettingCard component**

```tsx
// src/openacp/components/settings/setting-card.tsx
import React from "react"

export function SettingCard({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      {title && (
        <h3 className="text-lg-medium text-foreground">{title}</h3>
      )}
      <div className="rounded-lg bg-muted/50 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Volumes/NNTH-DATA/Workspace/Works/OpenACP-App && pnpm build 2>&1 | tail -5`
Expected: No errors related to `setting-card.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/settings/setting-card.tsx
git commit -m "feat: add SettingCard component for settings dialog"
```

---

### Task 2: Create `SettingRow` component

**Files:**
- Create: `src/openacp/components/settings/setting-row.tsx`

- [ ] **Step 1: Create the shared SettingRow component**

```tsx
// src/openacp/components/settings/setting-row.tsx
import React from "react"

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border-weak/50 last:border-b-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Volumes/NNTH-DATA/Workspace/Works/OpenACP-App && pnpm build 2>&1 | tail -5`
Expected: No errors related to `setting-row.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/settings/setting-row.tsx
git commit -m "feat: add SettingRow component for settings dialog"
```

---

### Task 3: Create `SettingsDialog` — sidebar nav + content routing

**Files:**
- Create: `src/openacp/components/settings/settings-dialog.tsx`

- [ ] **Step 1: Create the SettingsDialog component**

```tsx
// src/openacp/components/settings/settings-dialog.tsx
import React, { useState } from "react"
import {
  GearSix,
  Palette,
  Robot,
  Desktop,
  Info,
} from "@phosphor-icons/react"
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog"
import { VisuallyHidden } from "radix-ui"
import { SettingsGeneral } from "./settings-general"
import { SettingsAppearance } from "./settings-appearance"
import { SettingsAgents } from "./settings-agents"
import { SettingsServer } from "./settings-server"
import { SettingsAbout } from "./settings-about"

export type SettingsPage = "general" | "appearance" | "agents" | "server" | "about"

const APP_VERSION = __APP_VERSION__
declare const __APP_VERSION__: string

interface NavGroup {
  label: string
  items: { id: SettingsPage; label: string; icon: React.ElementType }[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "App",
    items: [
      { id: "general", label: "General", icon: GearSix },
      { id: "appearance", label: "Appearance", icon: Palette },
    ],
  },
  {
    label: "Server",
    items: [
      { id: "agents", label: "Agents", icon: Robot },
      { id: "server", label: "Server", icon: Desktop },
    ],
  },
  {
    label: "Info",
    items: [
      { id: "about", label: "About", icon: Info },
    ],
  },
]

export function SettingsDialog({
  open,
  onOpenChange,
  workspacePath,
  serverUrl,
  serverConnected,
  initialPage = "general",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspacePath: string
  serverUrl: string | null
  serverConnected: boolean
  initialPage?: SettingsPage
}) {
  const [page, setPage] = useState<SettingsPage>(initialPage)

  // Sync initialPage when dialog opens with a different page
  React.useEffect(() => {
    if (open) setPage(initialPage)
  }, [open, initialPage])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[800px] max-w-[800px] h-[560px] p-0 gap-0 overflow-hidden flex flex-row bg-card"
      >
        <VisuallyHidden.Root>
          <DialogTitle>Settings</DialogTitle>
        </VisuallyHidden.Root>

        {/* Sidebar */}
        <div className="w-[200px] shrink-0 border-r border-border-weak/50 flex flex-col px-3 py-4">
          <nav className="flex flex-col gap-1 flex-1">
            {NAV_GROUPS.map((group, gi) => (
              <div key={group.label} className={gi > 0 ? "mt-4" : ""}>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1 block">
                  {group.label}
                </span>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = page === item.id
                  return (
                    <button
                      key={item.id}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                      }`}
                      onClick={() => setPage(item.id)}
                    >
                      <Icon size={18} weight={isActive ? "fill" : "regular"} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
          <span className="text-xs text-muted-foreground px-2">{APP_VERSION}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-[480px] mx-auto px-8 py-6">
            {page === "general" && <SettingsGeneral workspacePath={workspacePath} />}
            {page === "appearance" && <SettingsAppearance />}
            {page === "agents" && <SettingsAgents workspacePath={workspacePath} />}
            {page === "server" && (
              <SettingsServer serverUrl={serverUrl} connected={serverConnected} />
            )}
            {page === "about" && <SettingsAbout />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Volumes/NNTH-DATA/Workspace/Works/OpenACP-App && pnpm build 2>&1 | tail -10`
Expected: No errors related to `settings-dialog.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/settings/settings-dialog.tsx
git commit -m "feat: add SettingsDialog with sidebar nav and content routing"
```

---

### Task 4: Refactor `settings-general.tsx` to use SettingCard + SettingRow

**Files:**
- Modify: `src/openacp/components/settings/settings-general.tsx`

- [ ] **Step 1: Rewrite settings-general.tsx**

Replace the entire file content with:

```tsx
import React, { useEffect, useState } from "react"
import { getSetting, setSetting } from "../../lib/settings-store"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  zh: "Chinese (Simplified)",
  zht: "Chinese (Traditional)",
  ko: "Korean",
  de: "German",
  es: "Spanish",
  fr: "French",
  da: "Danish",
  ja: "Japanese",
  pl: "Polish",
  ru: "Russian",
  ar: "Arabic",
  no: "Norwegian",
  br: "Portuguese (Brazil)",
  bs: "Bosnian",
}

export function SettingsGeneral({ workspacePath }: { workspacePath: string }) {
  const [language, setLanguage] = useState("en")

  useEffect(() => {
    void getSetting("language").then(setLanguage)
  }, [])

  async function handleLanguageChange(value: string) {
    setLanguage(value)
    await setSetting("language", value)
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="General">
        <SettingRow label="Language" description="Choose the display language for the app">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground-weak focus:outline-none focus:ring-1 focus:ring-border-selected min-w-[160px]"
            value={language}
            onChange={(e) => void handleLanguageChange(e.target.value)}
          >
            {Object.entries(LOCALE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Workspace folder" description="Current workspace data location">
          <code className="text-sm text-foreground-weak font-mono bg-secondary px-2 py-1 rounded-md max-w-[200px] truncate block">
            {workspacePath || "No workspace selected"}
          </code>
        </SettingRow>
      </SettingCard>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Volumes/NNTH-DATA/Workspace/Works/OpenACP-App && pnpm build 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/settings/settings-general.tsx
git commit -m "refactor: settings-general to use SettingCard + SettingRow"
```

---

### Task 5: Refactor `settings-appearance.tsx` to use SettingCard + SettingRow

**Files:**
- Modify: `src/openacp/components/settings/settings-appearance.tsx`

- [ ] **Step 1: Rewrite settings-appearance.tsx**

Replace the entire file content with:

```tsx
import React, { useEffect, useState } from "react"
import { getSetting, setSetting, applyTheme, applyFontSize, type AppSettings } from "../../lib/settings-store"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center gap-0 rounded-md border border-border overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`px-3 py-1 text-sm font-medium transition-colors border-r border-border last:border-r-0 ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground-weak bg-background"
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsAppearance() {
  const [theme, setTheme] = useState<AppSettings["theme"]>("dark")
  const [fontSize, setFontSize] = useState<AppSettings["fontSize"]>("medium")

  useEffect(() => {
    void getSetting("theme").then(setTheme)
    void getSetting("fontSize").then(setFontSize)
  }, [])

  async function handleThemeChange(value: AppSettings["theme"]) {
    setTheme(value)
    await setSetting("theme", value)
    applyTheme(value)
  }

  async function handleFontSizeChange(value: AppSettings["fontSize"]) {
    setFontSize(value)
    await setSetting("fontSize", value)
    applyFontSize(value)
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="Theme">
        <SettingRow label="Color scheme" description="Choose light, dark, or system theme">
          <ToggleGroup
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
            value={theme}
            onChange={(v) => void handleThemeChange(v)}
          />
        </SettingRow>
      </SettingCard>
      <SettingCard title="Typography">
        <SettingRow label="Font size" description="Adjust the interface font size">
          <ToggleGroup
            options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
            value={fontSize}
            onChange={(v) => void handleFontSizeChange(v)}
          />
        </SettingRow>
      </SettingCard>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Volumes/NNTH-DATA/Workspace/Works/OpenACP-App && pnpm build 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/settings/settings-appearance.tsx
git commit -m "refactor: settings-appearance to use SettingCard + SettingRow"
```

---

### Task 6: Refactor `settings-server.tsx` to use SettingCard + SettingRow

**Files:**
- Modify: `src/openacp/components/settings/settings-server.tsx`

- [ ] **Step 1: Rewrite settings-server.tsx**

Replace the entire file content with:

```tsx
import React from "react"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"

export function SettingsServer({
  serverUrl,
  connected,
}: {
  serverUrl: string | null
  connected: boolean
}) {
  const statusColor = connected ? "bg-status-success" : "bg-status-error"
  const statusText = connected ? "Connected" : "Disconnected"

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="Connection">
        <SettingRow label="Status" description="Current server connection status">
          <div className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${statusColor}`} />
            <span className="text-sm text-foreground-weak">{statusText}</span>
          </div>
        </SettingRow>
        <SettingRow label="Server address" description="The address of the connected OpenACP server">
          <code className="text-sm text-foreground-weak font-mono bg-secondary px-2 py-1 rounded-md">
            {serverUrl ?? "N/A"}
          </code>
        </SettingRow>
      </SettingCard>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Volumes/NNTH-DATA/Workspace/Works/OpenACP-App && pnpm build 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/settings/settings-server.tsx
git commit -m "refactor: settings-server to use SettingCard + SettingRow"
```

---

### Task 7: Refactor `settings-about.tsx` to use SettingCard + SettingRow

**Files:**
- Modify: `src/openacp/components/settings/settings-about.tsx`

- [ ] **Step 1: Rewrite settings-about.tsx**

Replace the entire file content with:

```tsx
import React, { useState } from "react"
import { Button } from "../ui/button"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"

const APP_VERSION = __APP_VERSION__
const GITHUB_URL = "https://github.com/Open-ACP/OpenACP-App"
const DOCS_URL = "https://github.com/Open-ACP/OpenACP-App#readme"

declare const __APP_VERSION__: string

export function SettingsAbout() {
  const [checking, setChecking] = useState(false)

  async function handleCheckForUpdates() {
    setChecking(true)
    try {
      const { check } = await import("@tauri-apps/plugin-updater")
      const update = await check()
      if (update) {
        window.alert(`Update available: ${update.version}`)
      } else {
        window.alert("You are on the latest version.")
      }
    } catch {
      window.alert("Failed to check for updates.")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="Application">
        <SettingRow label="Version" description="Current application version">
          <span className="text-sm text-foreground-weak font-mono">{APP_VERSION}</span>
        </SettingRow>
        <SettingRow label="GitHub" description="View the source code and report issues">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-foreground-weak hover:text-foreground underline underline-offset-2"
          >
            Repository
          </a>
        </SettingRow>
        <SettingRow label="Documentation" description="Read the official documentation">
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-foreground-weak hover:text-foreground underline underline-offset-2"
          >
            Docs
          </a>
        </SettingRow>
        <SettingRow label="Updates" description="Check if a newer version is available">
          <Button
            variant="outline"
            size="sm"
            disabled={checking}
            onClick={() => void handleCheckForUpdates()}
          >
            {checking ? "Checking..." : "Check for updates"}
          </Button>
        </SettingRow>
      </SettingCard>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Volumes/NNTH-DATA/Workspace/Works/OpenACP-App && pnpm build 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/settings/settings-about.tsx
git commit -m "refactor: settings-about to use SettingCard + SettingRow"
```

---

### Task 8: Refactor `settings-agents.tsx` — remove header, minimal changes

**Files:**
- Modify: `src/openacp/components/settings/settings-agents.tsx`

- [ ] **Step 1: Remove header section and outer wrapper**

The `SettingsDialog` already renders the page title from the sidebar, so the agents page doesn't need its own `<h2>` header. Remove the header `<div>` block (lines 91-95 in current file). Change the outer wrapper from:

```tsx
<div data-component="oac-settings" className="flex flex-col gap-6">
  <div>
    <h2 className="text-lg-medium text-foreground mb-1">Agents</h2>
    <p className="text-sm-regular text-muted-foreground">Manage AI coding agents</p>
  </div>
  ...
</div>
```

To:

```tsx
<div className="flex flex-col gap-4">
  ...
</div>
```

Keep ALL other code (search, agent list, install/uninstall logic, AgentRow) exactly the same.

- [ ] **Step 2: Verify build**

Run: `cd /Volumes/NNTH-DATA/Workspace/Works/OpenACP-App && pnpm build 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/settings/settings-agents.tsx
git commit -m "refactor: settings-agents remove header for dialog integration"
```

---

### Task 9: Wire up SettingsDialog in `app.tsx` and delete old panel

**Files:**
- Modify: `src/openacp/app.tsx`
- Delete: `src/openacp/components/settings/settings-panel.tsx`

- [ ] **Step 1: Update imports in app.tsx**

Replace:

```tsx
import {
  SettingsPanel,
  type SettingsPage,
} from "./components/settings/settings-panel";
```

With:

```tsx
import {
  SettingsDialog,
  type SettingsPage,
} from "./components/settings/settings-dialog";
```

- [ ] **Step 2: Remove settings conditional render from WorkspaceProvider block**

In `app.tsx` around lines 455-469, replace:

```tsx
            {showSettings ? (
              <SettingsPanel
                onClose={() => setShowSettings(false)}
                workspacePath={activeWorkspace?.directory ?? ""}
                serverUrl={server?.url ?? null}
                serverConnected={isConnected}
                initialPage={settingsPage}
              />
            ) : (
              <SessionsProvider>
                <PermissionsProvider>
                  <ChatWithPermissions />
                </PermissionsProvider>
              </SessionsProvider>
            )}
```

With (settings no longer replaces chat — it's always chat, dialog overlays):

```tsx
            <SessionsProvider>
              <PermissionsProvider>
                <ChatWithPermissions />
              </PermissionsProvider>
            </SessionsProvider>
```

- [ ] **Step 3: Add SettingsDialog as overlay alongside AddWorkspaceModal**

After the `{showAddWorkspace && <AddWorkspaceModal ... />}` block (around line 516), add the SettingsDialog:

```tsx
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        workspacePath={activeWorkspace?.directory ?? ""}
        serverUrl={server?.url ?? null}
        serverConnected={!!server}
        initialPage={settingsPage}
      />
```

- [ ] **Step 4: Delete old settings-panel.tsx**

```bash
rm src/openacp/components/settings/settings-panel.tsx
```

- [ ] **Step 5: Verify full build**

Run: `cd /Volumes/NNTH-DATA/Workspace/Works/OpenACP-App && pnpm build 2>&1 | tail -10`
Expected: PASS with no errors

- [ ] **Step 6: Commit**

```bash
git add src/openacp/app.tsx
git add src/openacp/components/settings/settings-panel.tsx
git commit -m "feat: wire SettingsDialog in app.tsx, remove old settings-panel"
```

---

### Task 10: Visual verification and cleanup

- [ ] **Step 1: Start dev server and visually verify**

Run: `cd /Volumes/NNTH-DATA/Workspace/Works/OpenACP-App && pnpm dev`

Verify:
1. Click gear icon in SidebarRail → Settings dialog opens at General tab
2. Sidebar groups show: App (General, Appearance), Server (Agents, Server), Info (About)
3. Active nav item has accent background
4. General tab shows card groups with Language select + Workspace path
5. Appearance tab shows Theme + Typography cards with toggle groups
6. Agents tab shows search + agent list
7. Server tab shows status badge + server URL
8. About tab shows version + links + update button
9. Version number shows at bottom of sidebar
10. ESC key closes dialog
11. Backdrop click closes dialog
12. Dialog doesn't replace chat — chat stays behind the overlay

- [ ] **Step 2: Verify Composer "Install agent..." still works**

In a chat session, confirm that the "Install agent..." button dispatches the `open-settings` event and opens Settings dialog at the Agents tab.

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "fix: settings dialog cleanup after visual review"
```
