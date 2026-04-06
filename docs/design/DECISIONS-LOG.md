# Decisions Log

Key technical and design decisions with rationale.

## 2026-04-06

- **Settings as Dialog overlay, not page replacement** — Previously settings swapped out the entire chat view. Now it's a Dialog overlay so chat stays visible behind. Consistent with Add Workspace and Plugins modals.
- **Grouped sidebar nav for settings** — Organized 5 settings tabs into 3 groups (App, Server, Info) with section labels. Reference: OpenCode Desktop settings UI.
- **Card group pattern for settings rows** — Setting rows grouped in `bg-muted/50 rounded-lg` cards with dividers. Shared `SettingCard` + `SettingRow` components replace per-file local `SettingRow` duplicates.
- **Rename `--text-*` color tokens to `--color-text-*`** — `--text-base` was defined as both a color (#6f6f6f in theme.css) and a font-size (1rem in index.css). CSS cascade order made the value unpredictable. Renamed all color tokens to `--color-text-*` prefix; font-size tokens keep `--text-*` to match Tailwind convention.
- **sm:max-w-[900px] override needed for Dialog** — Base `DialogContent` has `sm:max-w-lg` (512px). Custom className via `cn()` doesn't override responsive variants — must explicitly add `sm:max-w-[900px]`.
- **Font-size scaling on body, not html root** — `[data-font-size]` was applied to `document.documentElement`, changing root font-size and breaking all rem calculations in Tailwind. Fix: apply on `body` so Radix portals inherit, while `html` root stays 16px for correct rem.
- **Semantic text utility naming** — Renamed text-12/14/16/20 to text-sm/md/lg/xl. Follows Tailwind naming convention, self-documenting, decoupled from pixel values.
- **Font-size in rem, not em** — Defined text scale in rem (base 1rem=16px). Consistent with Tailwind, no cascade surprises from em inheritance.
- **Removed --color-text-base registration** — Collided with Tailwind `text-base` font-size utility. In Tailwind v4, `text-base` resolved as color instead of font-size when `--color-text-base` existed in @theme.
- **Alias-First color migration (Approach B)** — Invert alias direction so shadcn tokens are source of truth. Legacy tokens become backward-compat aliases. Zero visual change, incremental migration, each phase independently deployable.
- **Semantic naming over numeric** — Rejected `border-1/2/3` in favor of `border`, `border-weak`, `border-weaker`. Follows shadcn convention, self-documenting, avoids collision with Tailwind spacing utilities.
- **Extension tokens** — Added `--border-weak`, `--foreground-weak`, `--foreground-weaker` to cover granularity shadcn lacks. Follows shadcn naming pattern.
- **Keep specialized tokens as-is** — syntax-*, markdown-*, surface-diff-*, avatar-* tokens not migrated. No shadcn equivalent exists, and they're only used in CSS files (not component classes).
- **IconKitchen for app icons** — Better than manual sips/sharp generation. Proper adaptive icons, circular masks, all platforms covered.

## 2026-04-04

- **Token-First Migration (Approach A)** — CSS alias layer mapping shadcn names to existing tokens, zero breaking changes. Allows gradual migration.
- **Keep Phosphor icons** — already configured in components.json, no need to switch to Lucide
- **Practical sidebar/command-palette migration** — kept custom layouts, only replaced raw button/input primitives. Forcing shadcn Sidebar/Command structure would've been too risky.
- **DropdownMenu for agent/config selectors** — full rewrite from createPortal + manual positioning. Clean win — removes outside-click handlers, manual position calc.
- **Branch convention updated to `hiru/` (slash)** — was `hiru-` (dash), now consistent with CONTRIBUTING-GUIDE
- **Rebase not merge** for sync — cleaner git history, consistent with team convention
- **App icon via resvg** — qlmanage and Swift NSImage couldn't render SVG viewBox correctly. resvg (Rust-based) produces pixel-perfect results.

## 2026-04-02

- **Tangerine Orbit color palette** cho Pencil design — phu hop voi `--primary: #FF8400` cua project
- **Geist + Geist Mono** fonts — match voi design system hien tai (`--font-secondary: Geist`)
- **Design tokens thay vi hardcode** — dung `$--foreground`, `$--primary`, `$--color-success` de dam bao consistency
- **Reuse components co san** (Progress, Alert, Button) thay vi tao moi — giu design system nhat quan
- **Branch convention `hiru-`** (dash) thay vi `hiru/` (slash) — khop voi branch `hiru-uiux` hien tai
- **Docs trong `docs/design/`** voi UPPERCASE filenames — tach biet voi code docs, de nhan biet
- **WORKFLOW-LOG.md va DECISIONS-LOG.md gitignored** — personal logs, ko commit len repo
- **Luon bao cao truoc khi commit/push/PR** — user muon full control over repo changes
