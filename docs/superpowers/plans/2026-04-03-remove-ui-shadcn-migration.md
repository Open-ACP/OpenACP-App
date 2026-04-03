# Remove src/ui + shadcn Migration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy SolidJS `src/ui/` design system, switch CSS entry point to `src/openacp/styles/`, add shadcn/ui foundation, and refactor all custom UI components to shadcn patterns.

**Architecture:** The app already uses React everywhere except `src/platform/loading.tsx`. CSS/theme files already exist as copies in `src/openacp/styles/`. The migration swaps the CSS entry point, migrates loading.tsx to React, installs shadcn foundation (components.json + globals.css integration), refactors 5 custom components to use `cn()`/cva patterns, then deletes `src/ui/`.

**Tech Stack:** React 19, Tailwind CSS 4, shadcn/ui, clsx + tailwind-merge (already installed), class-variance-authority (already installed), @phosphor-icons/react (already installed).

---

## Chunk 1: CSS Entry Point + shadcn Foundation

### Task 1: Switch CSS entry point from src/ui to src/openacp/styles

**Files:**
- Modify: `src/openacp/main.tsx:6`

- [ ] **Step 1: Update CSS import path**

In `src/openacp/main.tsx`, change line 6:
```tsx
// FROM:
import "../ui/src/styles/tailwind/index.css"
// TO:
import "./styles/tailwind/index.css"
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -20`
Expected: Build succeeds. The `src/openacp/styles/tailwind/index.css` already exists with identical content (only difference is the `source()` path which is already adjusted).

- [ ] **Step 3: Commit**

```bash
git add src/openacp/main.tsx
git commit -m "refactor: switch CSS entry point from src/ui to src/openacp/styles"
```

### Task 2: Add shadcn components.json

**Files:**
- Create: `components.json`

- [ ] **Step 1: Create components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/openacp/styles/tailwind/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "phosphor",
  "aliases": {
    "components": "src/openacp/components",
    "utils": "src/lib/utils",
    "ui": "src/openacp/components/ui",
    "lib": "src/lib",
    "hooks": "src/openacp/hooks"
  }
}
```

Note: `cn()` utility already exists at `src/lib/utils.ts`. No need to create it.

- [ ] **Step 2: Verify shadcn CLI recognizes config**

Run: `npx shadcn@latest init --dry-run 2>&1 | head -20` (or just check that the file is valid JSON)

- [ ] **Step 3: Commit**

```bash
git add components.json
git commit -m "chore: add shadcn components.json configuration"
```

### Task 3: Add shadcn theme variables to globals.css

**Files:**
- Modify: `src/openacp/styles/theme.css`

The existing theme.css already has all the semantic CSS variables. We need to ADD shadcn-convention aliases that map to the existing design tokens. This allows shadcn components to work while keeping existing Tailwind classes functional.

- [ ] **Step 1: Add shadcn variable aliases at the end of `:root` in theme.css**

Append these inside the existing `:root` block at the end of the light theme section (before any `@media (prefers-color-scheme: dark)` block):

```css
  /* ── shadcn/ui theme aliases ──────────────────────────────────────────── */
  --background: var(--background-base);
  --foreground: var(--text-strong);
  --card: var(--background-stronger);
  --card-foreground: var(--text-strong);
  --popover: var(--background-stronger);
  --popover-foreground: var(--text-strong);
  --primary: var(--button-primary-base);
  --primary-foreground: var(--text-invert-strong);
  --secondary: var(--surface-raised-base);
  --secondary-foreground: var(--text-strong);
  --muted: var(--surface-weak);
  --muted-foreground: var(--text-weak);
  --accent: var(--surface-raised-base-hover);
  --accent-foreground: var(--text-strong);
  --destructive: var(--surface-critical-strong);
  --destructive-foreground: var(--text-invert-strong);
  --border: var(--border-base);
  --input: var(--border-base);
  --ring: var(--border-selected);
  --radius: 0.5rem;
```

- [ ] **Step 2: Add same aliases inside the dark theme `@media` block**

Find the `@media (prefers-color-scheme: dark)` section in theme.css and add the same aliases. The variables they reference will already have dark values defined in that block.

```css
  /* ── shadcn/ui theme aliases ──────────────────────────────────────────── */
  --background: var(--background-base);
  --foreground: var(--text-strong);
  --card: var(--background-stronger);
  --card-foreground: var(--text-strong);
  --popover: var(--background-stronger);
  --popover-foreground: var(--text-strong);
  --primary: var(--button-primary-base);
  --primary-foreground: var(--text-invert-strong);
  --secondary: var(--surface-raised-base);
  --secondary-foreground: var(--text-strong);
  --muted: var(--surface-weak);
  --muted-foreground: var(--text-weak);
  --accent: var(--surface-raised-base-hover);
  --accent-foreground: var(--text-strong);
  --destructive: var(--surface-critical-strong);
  --destructive-foreground: var(--text-invert-strong);
  --border: var(--border-base);
  --input: var(--border-base);
  --ring: var(--border-selected);
  --radius: 0.5rem;
```

- [ ] **Step 3: Register shadcn colors in Tailwind theme**

In `src/openacp/styles/tailwind/colors.css`, add shadcn color mappings so Tailwind generates utility classes like `bg-background`, `text-foreground`, etc:

```css
@theme {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}
```

- [ ] **Step 4: Verify build**

Run: `npx vite build 2>&1 | tail -20`
Expected: Build succeeds. Existing classes still work, new shadcn classes available.

- [ ] **Step 5: Commit**

```bash
git add src/openacp/styles/theme.css src/openacp/styles/tailwind/colors.css
git commit -m "feat: add shadcn theme variable aliases mapped to existing design tokens"
```

---

## Chunk 2: Refactor Custom UI Components

### Task 4: Refactor Spinner component

**Files:**
- Modify: `src/openacp/components/ui/spinner.tsx`

- [ ] **Step 1: Add cn import and refactor**

```tsx
import React from "react"
import { cn } from "@/lib/utils"

const outerIndices = new Set([1, 2, 4, 7, 8, 11, 13, 14])
const cornerIndices = new Set([0, 3, 12, 15])
const squares = Array.from({ length: 16 }, (_, i) => ({
  row: Math.floor(i / 4),
  col: i % 4,
  isOuter: outerIndices.has(i),
  isCorner: cornerIndices.has(i),
  delay: Math.random() * 1500,
  duration: 1000 + Math.random() * 1000,
}))

interface SpinnerProps {
  className?: string
  style?: React.CSSProperties
}

export function Spinner({ className, style }: SpinnerProps) {
  return (
    <div
      data-component="spinner"
      className={cn("inline-grid shrink-0 grid-cols-4 grid-rows-4 gap-px", className)}
      style={{ width: "1em", height: "1em", ...style }}
    >
      {squares.map((sq, i) => (
        <span
          key={i}
          className="block rounded-[1px]"
          style={{
            gridRow: sq.row + 1,
            gridColumn: sq.col + 1,
            background: "currentColor",
            opacity: sq.isCorner ? 0 : undefined,
            animation: sq.isCorner
              ? "none"
              : `${sq.isOuter ? "pulse-opacity-dim" : "pulse-opacity"} ${sq.duration}ms ease-in-out ${sq.delay}ms infinite`,
          }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/ui/spinner.tsx
git commit -m "refactor: spinner component to shadcn pattern with cn utility"
```

### Task 5: Refactor TextShimmer component

**Files:**
- Modify: `src/openacp/components/ui/text-shimmer.tsx`

- [ ] **Step 1: Read current file and refactor to add cn import**

Read `src/openacp/components/ui/text-shimmer.tsx`. Add `import { cn } from "@/lib/utils"` and replace any string concatenation for className with `cn()`. Keep the existing logic intact — the shimmer animation depends on data-attributes and CSS in `styles.css`.

Key changes:
- Add `import { cn } from "@/lib/utils"`
- Change `className={className}` → `className={cn("inline-flex items-baseline font-[inherit]", className)}`
- Use `cn()` for any conditional class merging

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/ui/text-shimmer.tsx
git commit -m "refactor: text-shimmer component to shadcn pattern with cn utility"
```

### Task 6: Refactor ResizeHandle component

**Files:**
- Modify: `src/openacp/components/ui/resize-handle.tsx`

- [ ] **Step 1: Read current file and refactor to add cn import**

Add `import { cn } from "@/lib/utils"` and use `cn()` for className composition. The component is already clean React — just needs the shadcn `cn()` pattern.

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/ui/resize-handle.tsx
git commit -m "refactor: resize-handle component to shadcn pattern with cn utility"
```

### Task 7: Refactor DockSurface components

**Files:**
- Modify: `src/openacp/components/ui/dock-surface.tsx`

- [ ] **Step 1: Read current file and refactor with cn**

Add `import { cn } from "@/lib/utils"` and use `cn()` for className composition in `DockShell`, `DockShellForm`, and `DockTray`.

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/ui/dock-surface.tsx
git commit -m "refactor: dock-surface components to shadcn pattern with cn utility"
```

### Task 8: Refactor Markdown component

**Files:**
- Modify: `src/openacp/components/ui/markdown.tsx`

- [ ] **Step 1: Read current file and refactor with cn**

Add `import { cn } from "@/lib/utils"` and use `cn()` for the container className. The markdown component has complex rendering logic (marked, shiki, morphdom) — only change the className pattern, not the rendering.

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/ui/markdown.tsx
git commit -m "refactor: markdown component to shadcn pattern with cn utility"
```

---

## Chunk 3: Migrate loading.tsx + Delete src/ui

### Task 9: Migrate src/platform/loading.tsx from SolidJS to React

**Files:**
- Modify: `src/platform/loading.tsx`

Currently uses: `render` from `solid-js/web`, `createSignal`, `createEffect`, `createMemo`, `onMount`, `onCleanup`, `MetaProvider` from `@solidjs/meta`, and 3 components from `@openacp/ui/*` (`Font`, `Splash`, `Progress`).

- [ ] **Step 1: Rewrite loading.tsx as React**

```tsx
import React, { useState, useEffect, useMemo } from "react"
import { createRoot } from "react-dom/client"
import { Channel } from "@tauri-apps/api/core"
import { commands, events, InitStep } from "./bindings"
import { initI18n, t } from "./i18n"
import "./styles.css"

const lines = [
  t("desktop.loading.status.initial"),
  t("desktop.loading.status.migrating"),
  t("desktop.loading.status.waiting"),
]
const delays = [3000, 9000]

void initI18n()

function LoadingScreen() {
  const [step, setStep] = useState<InitStep | null>(null)
  const [line, setLine] = useState(0)
  const [percent, setPercent] = useState(0)

  const phase = step?.phase ?? null

  const value = useMemo(() => {
    if (phase === "done") return 100
    return Math.max(25, Math.min(100, percent))
  }, [phase, percent])

  const status = useMemo(() => {
    if (phase === "done") return t("desktop.loading.status.done")
    if (phase === "sqlite_waiting") return lines[line]
    return t("desktop.loading.status.initial")
  }, [phase, line])

  useEffect(() => {
    const channel = new Channel<InitStep>()
    channel.onmessage = (next) => setStep(next)
    commands.awaitInitialization(channel as any).catch(() => undefined)
  }, [])

  useEffect(() => {
    setLine(0)
    setPercent(0)

    const timers = delays.map((ms, i) => setTimeout(() => setLine(i + 1), ms))

    const listenerPromise = events.sqliteMigrationProgress.listen((e: any) => {
      if (e.payload.type === "InProgress") setPercent(Math.max(0, Math.min(100, e.payload.value)))
      if (e.payload.type === "Done") setPercent(100)
    })

    return () => {
      listenerPromise.then((cb: any) => cb())
      timers.forEach(clearTimeout)
    }
  }, [])

  useEffect(() => {
    if (phase !== "done") return
    const timer = setTimeout(() => events.loadingWindowComplete.emit(null), 1000)
    return () => clearTimeout(timer)
  }, [phase])

  return (
    <div className="w-screen h-screen bg-background-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-11">
        {/* Logo placeholder - simple text instead of Splash component */}
        <div className="w-20 h-25 opacity-15 flex items-center justify-center text-4xl text-foreground">
          ⬡
        </div>
        <div className="w-60 flex flex-col items-center gap-4" aria-live="polite">
          <span className="w-full overflow-hidden text-center text-ellipsis whitespace-nowrap text-text-strong text-sm">
            {status}
          </span>
          {/* Simple progress bar replacing @openacp/ui Progress */}
          <div className="w-20 h-1 bg-surface-weak rounded-none overflow-hidden">
            <div
              className="h-full bg-icon-warning-base rounded-none transition-[width] duration-300"
              style={{ width: `${value}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const root = document.getElementById("root")!
createRoot(root).render(<LoadingScreen />)
```

Note: `Font` component returned null (just a style injector via meta) — removed. `Splash` was a logo div — replaced with simple placeholder. `Progress` was a Kobalte progress bar — replaced with a simple div-based progress bar with the same visual styling.

- [ ] **Step 2: Ensure loading.tsx CSS imports don't pull from src/ui**

Check that `./styles.css` (the platform styles) doesn't import from `src/ui`. If it does, update the import.

- [ ] **Step 3: Verify build**

Run: `npx vite build 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add src/platform/loading.tsx
git commit -m "refactor: migrate loading screen from SolidJS to React"
```

### Task 10: Delete src/ui and clean up references

**Files:**
- Delete: `src/ui/` (entire directory)
- Modify: `vite.config.ts` (remove @openacp/ui resolver)
- Modify: `tsconfig.json` (remove @openacp/ui path mapping)

- [ ] **Step 1: Verify zero imports from src/ui remain**

Run: `grep -r "from.*@openacp/ui\|from.*src/ui\|from.*\.\./ui/" src/ --include="*.tsx" --include="*.ts" --include="*.css" | grep -v node_modules | grep -v ".css.*layer(components)"`

Expected: No matches (or only CSS imports from `src/openacp/styles/` pointing to its own files).

- [ ] **Step 2: Delete src/ui directory**

```bash
rm -rf src/ui
```

- [ ] **Step 3: Remove @openacp/ui resolver from vite.config.ts**

In `vite.config.ts`, remove the entire `@openacp/ui/*` block from the `openacpResolver` function (lines 21-48 approximately). Keep the rest of the resolver for `@openacp/app`, `@openacp/util/*`, `@openacp/sdk/*`, and ghostty stub.

- [ ] **Step 4: Remove @openacp/ui path from tsconfig.json**

In `tsconfig.json`, remove line 17:
```json
"@openacp/ui/*": ["./src/ui/src/components/*", "./src/ui/src/*"],
```

- [ ] **Step 5: Verify build**

Run: `npx vite build 2>&1 | tail -20`
Expected: Build succeeds with no references to src/ui.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove src/ui legacy design system, clean up resolver and tsconfig"
```

### Task 11: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update architecture sections**

Key changes:
- Remove `@openacp/ui/*` from Module System section
- Update Design System section: mention shadcn/ui foundation instead of Kobalte
- Remove "src/ui/ is the shared design system" from Key Conventions
- Update Component Hierarchy if needed
- Update Available UI Components section

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect shadcn migration and src/ui removal"
```

### Task 12: Final verification

- [ ] **Step 1: Full build check**

Run: `npx vite build 2>&1`
Expected: Clean build with no warnings about missing files.

- [ ] **Step 2: Grep for any remaining src/ui references**

Run: `grep -r "src/ui" . --include="*.ts" --include="*.tsx" --include="*.css" --include="*.json" --include="*.md" | grep -v node_modules | grep -v _ignore | grep -v ".git/" | grep -v "docs/superpowers/"`

Fix any remaining references found.

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "chore: clean up remaining src/ui references"
```
