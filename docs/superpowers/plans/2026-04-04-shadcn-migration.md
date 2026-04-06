# shadcn/ui Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate OpenACP Desktop from custom UI primitives to shadcn/ui components with a token-first incremental approach.

**Architecture:** Phase 1 adds a CSS alias layer mapping shadcn token names to existing design tokens (zero breaking changes). Phase 2 installs shadcn components via CLI and replaces custom code screen-by-screen. Phase 3 cleans up old code and aliases.

**Tech Stack:** React 19, Tailwind CSS 4, shadcn/ui (new-york style), Radix UI, Phosphor Icons, Vite, Tauri 2

---

## File Structure

### New files (created by shadcn CLI or manually)

| File | Responsibility |
|------|---------------|
| `src/openacp/components/ui/button.tsx` | shadcn Button (replaces raw `<button>` usage) |
| `src/openacp/components/ui/badge.tsx` | shadcn Badge |
| `src/openacp/components/ui/input.tsx` | shadcn Input |
| `src/openacp/components/ui/textarea.tsx` | shadcn Textarea |
| `src/openacp/components/ui/switch.tsx` | shadcn Switch (replaces manual toggle) |
| `src/openacp/components/ui/checkbox.tsx` | shadcn Checkbox |
| `src/openacp/components/ui/tooltip.tsx` | shadcn Tooltip |
| `src/openacp/components/ui/progress.tsx` | shadcn Progress |
| `src/openacp/components/ui/dialog.tsx` | shadcn Dialog (replaces manual portal modals) |
| `src/openacp/components/ui/dropdown-menu.tsx` | shadcn Dropdown Menu |
| `src/openacp/components/ui/select.tsx` | shadcn Select |
| `src/openacp/components/ui/tabs.tsx` | shadcn Tabs |
| `src/openacp/components/ui/command.tsx` | shadcn Command (replaces command-palette.tsx) |
| `src/openacp/components/ui/sidebar.tsx` | shadcn Sidebar |
| `src/openacp/components/ui/sheet.tsx` | shadcn Sheet |
| `src/openacp/components/ui/sonner.tsx` | shadcn Sonner (toast) |

### Modified files

| File | Change |
|------|--------|
| `src/openacp/styles/theme.css` | Add shadcn token alias block |
| `src/openacp/styles/tailwind/index.css` | Register shadcn tokens in `@theme` block |
| `src/openacp/components/sidebar.tsx` | Replace with shadcn Sidebar usage |
| `src/openacp/components/sidebar-rail.tsx` | Integrate with shadcn Sidebar |
| `src/openacp/components/command-palette.tsx` | Replace with shadcn Command |
| `src/openacp/components/plugins-modal.tsx` | Use shadcn Dialog + Tabs |
| `src/openacp/components/plugins-installed.tsx` | Use shadcn Switch, Badge |
| `src/openacp/components/plugins-marketplace.tsx` | Use shadcn Badge, Button |
| `src/openacp/components/add-workspace/*.tsx` | Use shadcn Dialog, Input, Tabs, Button |
| `src/openacp/components/agent-selector.tsx` | Use shadcn Select or Dropdown Menu |
| `src/openacp/components/config-selector.tsx` | Use shadcn Select or Dropdown Menu |
| `src/openacp/components/composer.tsx` | Use shadcn Button, Tooltip |
| `src/openacp/components/welcome.tsx` | Use shadcn Button |
| `src/openacp/components/chat/chat-view.tsx` | Use shadcn Button, Tooltip |
| `src/openacp/components/review-panel.tsx` | Use shadcn Tabs, Button |
| `CLAUDE.md` | Update framework info (React, shadcn) |

---

## Task 1: Add Token Alias Layer

**Files:**
- Modify: `src/openacp/styles/theme.css:96-130` (after `:root` light theme block)
- Modify: `src/openacp/styles/tailwind/index.css:9-40` (inside `@theme` block)

- [ ] **Step 1: Add shadcn token aliases to theme.css**

At the end of `src/openacp/styles/theme.css`, before the dark theme block, add a new section:

```css
/* ── shadcn/ui token aliases ──────────────────────────────────────────────── */
/* Maps shadcn token names to existing design tokens.                         */
/* This enables shadcn components to work with our existing color system.     */
/* Remove this section after full migration (Phase 3).                        */

:root,
[data-theme="light"] {
  --background: var(--background-base);
  --foreground: var(--text-strong);
  --muted: var(--surface-raised-base);
  --muted-foreground: var(--text-base);
  --card: var(--background-strong);
  --card-foreground: var(--text-strong);
  --popover: var(--surface-raised-stronger);
  --popover-foreground: var(--text-strong);
  --primary: var(--text-strong);
  --primary-foreground: var(--background-strong);
  --secondary: var(--surface-raised-base);
  --secondary-foreground: var(--text-strong);
  --accent: var(--surface-raised-base);
  --accent-foreground: var(--text-strong);
  --destructive: var(--surface-critical-strong);
  --destructive-foreground: var(--background-strong);
  --border: var(--border-base);
  --input: var(--border-base);
  --ring: var(--border-interactive-base);
  --radius: var(--radius-md);

  --sidebar-background: var(--background-base);
  --sidebar-foreground: var(--text-strong);
  --sidebar-primary: var(--text-strong);
  --sidebar-primary-foreground: var(--background-strong);
  --sidebar-accent: var(--surface-raised-base);
  --sidebar-accent-foreground: var(--text-strong);
  --sidebar-border: var(--border-weak-base);
  --sidebar-ring: var(--border-interactive-base);
}

[data-theme="dark"] {
  --background: var(--background-base);
  --foreground: var(--text-strong);
  --muted: var(--surface-raised-base);
  --muted-foreground: var(--text-base);
  --card: var(--background-strong);
  --card-foreground: var(--text-strong);
  --popover: var(--surface-raised-stronger);
  --popover-foreground: var(--text-strong);
  --primary: var(--text-strong);
  --primary-foreground: var(--background-strong);
  --secondary: var(--surface-raised-base);
  --secondary-foreground: var(--text-strong);
  --accent: var(--surface-raised-base);
  --accent-foreground: var(--text-strong);
  --destructive: var(--surface-critical-strong);
  --destructive-foreground: var(--background-strong);
  --border: var(--border-base);
  --input: var(--border-base);
  --ring: var(--border-interactive-base);
  --radius: var(--radius-md);

  --sidebar-background: var(--background-base);
  --sidebar-foreground: var(--text-strong);
  --sidebar-primary: var(--text-strong);
  --sidebar-primary-foreground: var(--background-strong);
  --sidebar-accent: var(--surface-raised-base);
  --sidebar-accent-foreground: var(--text-strong);
  --sidebar-border: var(--border-weak-base);
  --sidebar-ring: var(--border-interactive-base);
}
```

- [ ] **Step 2: Register shadcn color tokens in Tailwind theme**

In `src/openacp/styles/tailwind/index.css`, add these inside the `@theme` block so Tailwind generates utility classes like `bg-background`, `text-foreground`, etc.:

```css
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar-background: var(--sidebar-background);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors. Existing components unchanged.

- [ ] **Step 4: Visual check**

Run: `pnpm dev`
Verify: Open http://localhost:1420, confirm all existing screens render identically.

- [ ] **Step 5: Commit**

```bash
git add src/openacp/styles/theme.css src/openacp/styles/tailwind/index.css
git commit -m "feat: add shadcn token alias layer mapping to existing design tokens"
```

---

## Task 2: Install Phase 2a Foundation Primitives

**Files:**
- Create: `src/openacp/components/ui/button.tsx` (via CLI)
- Create: `src/openacp/components/ui/badge.tsx` (via CLI)
- Create: `src/openacp/components/ui/input.tsx` (via CLI)
- Create: `src/openacp/components/ui/textarea.tsx` (via CLI)
- Create: `src/openacp/components/ui/switch.tsx` (via CLI)
- Create: `src/openacp/components/ui/checkbox.tsx` (via CLI)
- Create: `src/openacp/components/ui/tooltip.tsx` (via CLI)
- Create: `src/openacp/components/ui/progress.tsx` (via CLI)

- [ ] **Step 1: Install shadcn foundation components**

```bash
npx shadcn@latest add button badge input textarea switch checkbox tooltip progress
```

This installs Radix UI deps automatically and generates component files at `src/openacp/components/ui/`.

- [ ] **Step 2: Verify generated files exist**

```bash
ls src/openacp/components/ui/button.tsx src/openacp/components/ui/badge.tsx src/openacp/components/ui/input.tsx src/openacp/components/ui/switch.tsx src/openacp/components/ui/tooltip.tsx src/openacp/components/ui/progress.tsx
```

- [ ] **Step 3: Verify build**

```bash
pnpm build
```

Expected: Build succeeds. New components are tree-shaken (not imported yet).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: install shadcn foundation primitives (button, badge, input, textarea, switch, checkbox, tooltip, progress)"
```

---

## Task 3: Install Phase 2b Components with Dependencies

**Files:**
- Create: `src/openacp/components/ui/dialog.tsx` (via CLI)
- Create: `src/openacp/components/ui/dropdown-menu.tsx` (via CLI)
- Create: `src/openacp/components/ui/select.tsx` (via CLI)
- Create: `src/openacp/components/ui/tabs.tsx` (via CLI)

- [ ] **Step 1: Install**

```bash
npx shadcn@latest add dialog dropdown-menu select tabs
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: install shadcn dialog, dropdown-menu, select, tabs"
```

---

## Task 4: Install Phase 2c Tier 2 Composites

**Files:**
- Create: `src/openacp/components/ui/command.tsx` (via CLI)
- Create: `src/openacp/components/ui/sidebar.tsx` (via CLI)
- Create: `src/openacp/components/ui/sheet.tsx` (via CLI)
- Create: `src/openacp/components/ui/sonner.tsx` (via CLI)

- [ ] **Step 1: Install**

```bash
npx shadcn@latest add command sidebar sheet sonner
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: install shadcn command, sidebar, sheet, sonner composites"
```

---

## Task 5: Migrate Onboarding Screens (Button + Badge)

**Files:**
- Modify: `src/openacp/main.tsx` (onboarding screens)
- Modify: `src/openacp/components/welcome.tsx`
- Reference: Pencil screens `Onboarding — Splash`, `Onboarding — Install`, `Onboarding — Setup Step 1`, `Onboarding — Setup Step 2`

- [ ] **Step 1: Read Pencil screens for reference**

Use `mcp__pencil__get_screenshot` for nodes `0LD6Q`, `xRjcY`, `m1B1M`, `m7RvG` to see target layout.

- [ ] **Step 2: Replace raw buttons with shadcn Button**

Find all `<button className="...">` in onboarding-related components. Replace with:

```tsx
import { Button } from "./ui/button"

// Before:
<button className="bg-text-strong text-background-strong rounded-md px-4 py-2">Continue</button>

// After:
<Button>Continue</Button>
<Button variant="outline">Back</Button>
<Button variant="ghost">Browse</Button>
```

- [ ] **Step 3: Replace raw badge spans with shadcn Badge**

```tsx
import { Badge } from "./ui/badge"

// Before:
<span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Installed</span>

// After:
<Badge variant="secondary">Installed</Badge>
```

- [ ] **Step 4: Verify build + visual check**

```bash
pnpm build && pnpm dev
```

Check onboarding screens render correctly.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: migrate onboarding screens to shadcn Button + Badge"
```

---

## Task 6: Migrate Add Workspace Modal (Input + Dialog)

**Files:**
- Modify: `src/openacp/components/add-workspace/index.tsx`
- Modify: `src/openacp/components/add-workspace/local-tab.tsx`
- Modify: `src/openacp/components/add-workspace/remote-tab.tsx`
- Reference: Pencil screens `App — Add Workspace (Local)`, `App — Add Workspace (Remote)`

- [ ] **Step 1: Replace manual portal modal with shadcn Dialog**

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"

// Before: createPortal(<div className="fixed inset-0 ...">, document.body)
// After:
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>Add Workspace</DialogTitle>
    </DialogHeader>
    <Tabs defaultValue="local">
      <TabsList>
        <TabsTrigger value="local">Local</TabsTrigger>
        <TabsTrigger value="remote">Remote</TabsTrigger>
      </TabsList>
      <TabsContent value="local"><LocalTab /></TabsContent>
      <TabsContent value="remote"><RemoteTab /></TabsContent>
    </Tabs>
  </DialogContent>
</Dialog>
```

- [ ] **Step 2: Replace raw inputs with shadcn Input**

```tsx
import { Input } from "./ui/input"

// Before:
<input className="w-full border rounded-md px-3 py-2 text-sm" placeholder="..." />

// After:
<Input placeholder="~/openacp-workspace" />
```

- [ ] **Step 3: Verify build + visual check**

```bash
pnpm build && pnpm dev
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: migrate Add Workspace modal to shadcn Dialog, Tabs, Input"
```

---

## Task 7: Migrate Plugins Modal (Tabs + Switch + Badge)

**Files:**
- Modify: `src/openacp/components/plugins-modal.tsx`
- Modify: `src/openacp/components/plugins-installed.tsx`
- Modify: `src/openacp/components/plugins-marketplace.tsx`
- Reference: Pencil screens `App — Plugins (Installed)`, `App — Plugins (Marketplace)`

- [ ] **Step 1: Replace modal wrapper with shadcn Dialog**

Same pattern as Task 6 — wrap with `<Dialog>` + `<DialogContent>`.

- [ ] **Step 2: Replace tab bar with shadcn Tabs**

```tsx
<Tabs defaultValue="installed">
  <TabsList>
    <TabsTrigger value="installed">Installed</TabsTrigger>
    <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
  </TabsList>
  <TabsContent value="installed"><PluginsInstalled /></TabsContent>
  <TabsContent value="marketplace"><PluginsMarketplace /></TabsContent>
</Tabs>
```

- [ ] **Step 3: Replace manual toggle with shadcn Switch**

```tsx
import { Switch } from "./ui/switch"

// Before: manual div+span toggle with onClick
// After:
<Switch checked={plugin.enabled} onCheckedChange={(v) => togglePlugin(plugin.id, v)} />
```

- [ ] **Step 4: Replace status badges with shadcn Badge**

```tsx
<Badge variant="default">Running</Badge>
<Badge variant="secondary">Built-in</Badge>
<Badge variant="destructive">Failed</Badge>
<Badge variant="outline">Community</Badge>
```

- [ ] **Step 5: Verify build + visual check**

```bash
pnpm build && pnpm dev
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: migrate Plugins modal to shadcn Dialog, Tabs, Switch, Badge"
```

---

## Task 8: Migrate Sidebar (shadcn Sidebar component)

**Files:**
- Modify: `src/openacp/components/sidebar.tsx`
- Modify: `src/openacp/components/sidebar-rail.tsx`
- Reference: Pencil screens `App — Welcome`, `App — Empty State`, `App — Server Not Found`

- [ ] **Step 1: Read current sidebar structure**

Read `src/openacp/components/sidebar.tsx` and `sidebar-rail.tsx` to understand current layout.

- [ ] **Step 2: Refactor to shadcn Sidebar**

```tsx
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider,
  SidebarRail, SidebarTrigger
} from "./ui/sidebar"

// Wrap app layout with SidebarProvider
// Replace custom sidebar with shadcn Sidebar structure
// Replace custom rail with SidebarRail
```

- [ ] **Step 3: Verify all screens using sidebar render correctly**

```bash
pnpm build && pnpm dev
```

Check: Welcome, Empty State, Chat Active, Chat+Review, Command Palette, Server Not Found.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: migrate sidebar to shadcn Sidebar component"
```

---

## Task 9: Migrate Command Palette (shadcn Command)

**Files:**
- Modify: `src/openacp/components/command-palette.tsx`
- Reference: Pencil screen `App — Command Palette`

- [ ] **Step 1: Replace custom palette with shadcn Command**

```tsx
import {
  CommandDialog, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList, CommandSeparator
} from "./ui/command"

<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="Filter actions..." />
  <CommandList>
    <CommandGroup heading="Context">
      <CommandItem onSelect={() => attachFile()}>
        <Paperclip /> Attach file
      </CommandItem>
      <CommandItem onSelect={() => mentionFile()}>
        <At /> Mention file
      </CommandItem>
    </CommandGroup>
    <CommandSeparator />
    <CommandGroup heading="Configuration">
      <CommandItem>
        <SlidersHorizontal /> Mode
        <span className="ml-auto text-muted-foreground text-xs">Normal</span>
      </CommandItem>
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

- [ ] **Step 2: Remove old manual keyboard navigation, portal, and outside-click code**

The shadcn Command component handles all of this via cmdk + Radix Dialog.

- [ ] **Step 3: Verify build + visual check**

```bash
pnpm build && pnpm dev
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: migrate command palette to shadcn Command component"
```

---

## Task 10: Migrate Chat Screens (primitives only)

**Files:**
- Modify: `src/openacp/components/composer.tsx`
- Modify: `src/openacp/components/chat/chat-view.tsx`
- Modify: `src/openacp/components/review-panel.tsx`
- Modify: `src/openacp/components/agent-selector.tsx`
- Modify: `src/openacp/components/config-selector.tsx`
- Reference: Pencil screens `App — Chat Active`, `App — Chat + Review Panel`

- [ ] **Step 1: Replace raw buttons in Composer with shadcn Button**

```tsx
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

// Send button, attach file button, slash command button
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon"><Plus /></Button>
  </TooltipTrigger>
  <TooltipContent>Attach file</TooltipContent>
</Tooltip>
```

- [ ] **Step 2: Replace agent-selector portal dropdown with shadcn Select**

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

<Select value={current} onValueChange={onSelect}>
  <SelectTrigger className="w-auto h-auto px-2 py-1 text-xs">
    <SelectValue placeholder="Select agent" />
  </SelectTrigger>
  <SelectContent>
    {agents.map(a => <SelectItem key={a.name} value={a.name}>{a.displayName}</SelectItem>)}
  </SelectContent>
</Select>
```

- [ ] **Step 3: Replace config-selector portal dropdown similarly**

Same pattern as Step 2 for model and mode selectors.

- [ ] **Step 4: Replace review-panel tab bar with shadcn Tabs**

```tsx
<Tabs value={activeFile} onValueChange={setActiveFile}>
  <TabsList>
    {files.map(f => <TabsTrigger key={f.path} value={f.path}>{f.name}</TabsTrigger>)}
  </TabsList>
</Tabs>
```

- [ ] **Step 5: Verify build + visual check all chat screens**

```bash
pnpm build && pnpm dev
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: migrate chat screen primitives to shadcn (Button, Select, Tabs, Tooltip)"
```

---

## Task 11: Cleanup + Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`
- Delete: unused custom component code (if fully replaced)

- [ ] **Step 1: Identify dead code**

Check which custom components in `src/openacp/components/ui/` are no longer imported anywhere:

```bash
# For each old custom primitive, check if still imported
grep -r "from.*dock-surface" src/openacp/ --include="*.tsx" --include="*.ts" -l
```

Keep: `markdown.tsx`, `spinner.tsx`, `text-shimmer.tsx`, `resize-handle.tsx`, `dock-surface.tsx` (all Tier 3).

- [ ] **Step 2: Remove old manual portal/dropdown code**

In files like `agent-selector.tsx` and `config-selector.tsx`, remove old `createPortal`, `useEffect` for outside-click, and manual keyboard handlers that are now handled by Radix.

- [ ] **Step 3: Update CLAUDE.md**

Replace the SolidJS references with React:

```markdown
## Key Conventions

- **React 19** with TypeScript strict mode.
- **UI Components**: shadcn/ui (new-york style) + Radix UI primitives. Custom domain components in `src/openacp/components/`.
- **Icons**: @phosphor-icons/react
- **Styling**: Tailwind CSS 4 + shadcn design tokens (`--foreground`, `--border`, etc.) with alias layer to legacy tokens.
- **State**: React Context + TanStack React Query for async data.
```

- [ ] **Step 4: Final build + full visual QA**

```bash
pnpm build && pnpm dev
```

Walk through all 18 Pencil screens, verify each matches the design.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: cleanup old custom primitives, update CLAUDE.md for React + shadcn"
```
