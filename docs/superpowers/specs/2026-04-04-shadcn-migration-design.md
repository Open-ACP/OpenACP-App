# shadcn/ui Migration Design Spec

**Date:** 2026-04-04
**Author:** Claude + anh Hiru
**Status:** Approved

## Goal

Migrate OpenACP Desktop's custom UI components to shadcn/ui to:
1. Sync Pencil design file (shadcn tokens) with code 1:1
2. Improve accessibility via Radix UI primitives
3. Reduce maintenance burden — community components over custom builds

## Current State

- **Framework:** React 19.1.0 + Tauri 2 + Vite
- **Styling:** Tailwind CSS 4 + custom semantic design tokens
- **Components:** 33 custom-built, no headless library (manual portal, keyboard, focus handling)
- **Icons:** @phosphor-icons/react (keeping)
- **shadcn config:** `components.json` already configured (new-york style, phosphor icons, correct paths)
- **Design reference:** `docs/design/pencil/openacp.pen` — 18 screens, 87 shadcn components, full token system

## Approach: Token-First Incremental Migration (Approach A)

Three phases, each producing small self-contained PRs. App never breaks between PRs.

### Phase 1: Token Alias Layer

Add shadcn token aliases in `src/openacp/styles/theme.css` that point to existing token values:

```css
:root, [data-theme="light"] {
  --background: var(--background-base);
  --foreground: var(--text-strong);
  --muted: var(--surface-raised-base);
  --muted-foreground: var(--text-base);
  --card: var(--background-strong);
  --card-foreground: var(--text-strong);
  --popover: var(--background-strong);
  --popover-foreground: var(--text-strong);
  --primary: var(--text-strong);
  --primary-foreground: var(--background-strong);
  --secondary: var(--surface-raised-base);
  --secondary-foreground: var(--text-strong);
  --accent: var(--surface-raised-base);
  --accent-foreground: var(--text-strong);
  --destructive: var(--surface-critical-strong);
  --border: var(--border-base);
  --input: var(--border-base);
  --ring: var(--border-interactive-base);
  --radius: var(--radius-md);
  --sidebar-background: var(--background-base);
  --sidebar-foreground: var(--text-strong);
  --sidebar-border: var(--border-weak-base);
  --sidebar-accent: var(--surface-raised-base);
  --sidebar-accent-foreground: var(--text-strong);
  --sidebar-ring: var(--border-interactive-base);
}

[data-theme="dark"] {
  /* Same aliases — dark values resolve automatically via existing dark token definitions */
}
```

Dark mode works automatically because existing tokens already have `[data-theme="dark"]` variants. Aliases are just pointers.

**Deliverable:** PR 1

### Phase 2: Install shadcn Components + Replace Per Screen

#### Phase 2a — Foundation primitives (no inter-deps)

```
npx shadcn add button badge input textarea switch checkbox tooltip progress
```

#### Phase 2b — Components with dependencies

```
npx shadcn add dialog dropdown-menu select tabs
```

#### Phase 2c — Tier 2 composites

```
npx shadcn add command sidebar sheet sonner
```

### Phase 3: Cleanup

- Remove unused custom component code
- Remove token alias layer (replace `var(--text-strong)` references directly with `var(--foreground)` across codebase)
- Update CLAUDE.md (React, shadcn/ui, correct conventions)

## Screen Migration Order

Each PR replaces components in 1-3 screens, is self-contained, and does not break the app.

| PR | shadcn Components | Screens | Complexity |
|----|------------------|---------|------------|
| 1 | Token alias layer | N/A (foundation) | Low |
| 2 | Button, Badge | Onboarding: Splash, Install, Setup 1 & 2 | Low |
| 3 | Progress, Button | Installing: In Progress, Success, Failed | Low |
| 4 | Input, Dialog | Add Workspace modal (Local, Remote) | Medium |
| 5 | Tabs, Switch, Badge | Plugins modal (Installed, Marketplace) | Medium |
| 6 | Sidebar | Welcome, Empty State, Server Not Found | Medium |
| 7 | Command | Command Palette | Medium |
| 8 | (primitives only) | Chat Active, Chat + Review Panel | High |
| 9 | Cleanup | Remove old code, aliases, update CLAUDE.md | Low |

## Component Classification

### Replace with shadcn (Tier 1 + 2)

Button, Input, Textarea, Select, Switch, Checkbox, Tabs, Badge, Dialog, Tooltip, Dropdown Menu, Command, Sidebar, Sheet, Toast/Sonner, Progress, Accordion

### Keep custom (Tier 3)

| Component | Reason |
|-----------|--------|
| `ui/markdown.tsx` | Custom parser chain (marked + shiki + KaTeX + morphdom) |
| `review-panel.tsx` | Custom diff viewer with @pierre/diffs |
| `chat/blocks/*` | Domain-specific: thinking, tool use, plan, error blocks |
| `composer.tsx` | Complex: drag-drop, file attachments, keyboard shortcuts, DockTray |
| `chat/timeline-step.tsx` | Custom timeline visualization |
| `ui/resize-handle.tsx` | Custom drag resize behavior |
| `chat/message-turn.tsx` | Domain-specific message grouping |
| `chat/user-message.tsx` | Domain-specific styling |

These components will USE shadcn primitives internally (e.g., Composer uses shadcn Button, Input) but remain custom components.

## Icon Strategy

**Keep Phosphor Icons.** `components.json` already configured with `"iconLibrary": "phosphor"`. shadcn CLI generates components with Phosphor imports. No migration needed.

## Design Reference

Pencil file `docs/design/pencil/openacp.pen` contains 18 screens organized in 4 flows:
- Row 1: Onboarding (4 screens) + Installing (3 screens)
- Row 2: Main App (6 screens)
- Row 3: Modals & Overlays (5 screens)

All screens use shadcn design tokens and component refs. During migration, read Pencil screens via MCP tools to match layout/spacing 1:1.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Token alias mismatch (shadcn expects HSL, current uses hex/rgba) | Verify each alias renders correctly. Adjust values if shadcn components look wrong. |
| Radix UI bundle size increase | Monitor with `vite-bundle-visualizer`. Radix is tree-shakeable. |
| Breaking existing screens during migration | Each PR is self-contained. Old and new components coexist. |
| Phosphor icon names differ from Lucide defaults | shadcn CLI handles this via components.json config. Manual check any generated code. |

## Success Criteria

- [ ] All 18 Pencil screens match code 1:1
- [ ] All shadcn Tier 1+2 components installed and used
- [ ] Keyboard navigation + ARIA attributes on all interactive elements
- [ ] Dark mode works correctly across all screens
- [ ] No custom UI primitive code remaining (only Tier 3 domain components)
- [ ] CLAUDE.md updated with correct framework + component info
