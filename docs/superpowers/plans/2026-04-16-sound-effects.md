# Sound Effects Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sound effect system to OpenACP-App that plays audio cues for 4 window events (agent response, permission request, message failed, mention), with 5 built-in sounds + user-imported custom audio (MP3/WAV/OGG), configurable per-event with enable toggle + sound selection + global volume + preview.

**Architecture:** Three-layer design — (1) `sound-registry.ts` manages the library (built-in + imported, file ops via Tauri FS plugin); (2) `sound-player.ts` handles playback with per-event cooldown, volume, and preload cache; (3) `use-sound-effects.ts` hook listens to existing `window` events (parallel to `use-system-notifications.ts`) and drives the player. Settings live under a new `sounds` top-level key in `AppSettings`, independent from `NotificationSettings`. UI is a new "Sounds" page in the settings dialog.

**Tech Stack:** Tauri 2, React 19, TypeScript, `radix-ui` (Slider, Select primitives), Phosphor Icons, Tailwind CSS 4, shadcn-style component patterns, `@tauri-apps/plugin-fs` (NEW dep), `@tauri-apps/plugin-store`, HTMLAudioElement.

**Spec reference:** `docs/superpowers/specs/2026-04-16-sound-effects-design.md`

**Branch:** `feat/sound-effects` (already checked out)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src-tauri/Cargo.toml` | Add `tauri-plugin-fs = "2"` dependency |
| Modify | `src-tauri/src/lib.rs` | Register `.plugin(tauri_plugin_fs::init())` |
| Modify | `src-tauri/capabilities/default.json` | Add `fs:default` + scoped write to `$APPDATA/sounds/**` |
| Modify | `package.json` | Add `@tauri-apps/plugin-fs: ~2` |
| Modify | `src/openacp/lib/settings-store.ts` | Add `SoundSettings` types, defaults, getAllSettings case |
| Create | `src/assets/sounds/staplebops-01.aac` | Built-in: agent default |
| Create | `src/assets/sounds/yup-03.aac` | Built-in: permission default |
| Create | `src/assets/sounds/nope-01.aac` | Built-in: error default |
| Create | `src/assets/sounds/bip-bop-02.aac` | Built-in: mention default |
| Create | `src/assets/sounds/alert-01.aac` | Built-in: alternate |
| Create | `CREDITS.md` | MIT attribution for opencode sounds |
| Create | `src/openacp/lib/sound-registry.ts` | Sound catalog + file ops |
| Create | `src/openacp/lib/sound-player.ts` | Playback with cooldown + preload + volume |
| Create | `src/openacp/hooks/use-sound-effects.ts` | Window event → `playEventSound` |
| Modify | `src/openacp/app.tsx:397` | Mount `useSoundEffects()` after `useSystemNotifications` |
| Create | `src/openacp/components/ui/slider.tsx` | Radix Slider wrapper |
| Create | `src/openacp/components/settings/settings-sounds.tsx` | Settings page UI (General + Library + Events) |
| Modify | `src/openacp/components/settings/settings-dialog.tsx` | Add "sounds" nav entry + page render |

---

### Task 1: Add Tauri FS plugin (Rust + JS + capabilities)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `package.json`

- [ ] **Step 1: Add Rust dependency**

In `src-tauri/Cargo.toml`, add after `tauri-plugin-updater = "2"` (line ~27):

```toml
tauri-plugin-fs = "2"
```

- [ ] **Step 2: Register plugin in `lib.rs`**

In `src-tauri/src/lib.rs`, add after `.plugin(tauri_plugin_updater::Builder::new().build())` (line ~70):

```rust
.plugin(tauri_plugin_fs::init())
```

- [ ] **Step 3: Add capabilities**

In `src-tauri/capabilities/default.json`, add these permissions **inside** the `permissions` array (after `"updater:default"`):

```json
"fs:default",
{
  "identifier": "fs:allow-mkdir",
  "allow": [{ "path": "$APPDATA/sounds" }, { "path": "$APPDATA/sounds/**" }]
},
{
  "identifier": "fs:allow-write-file",
  "allow": [{ "path": "$APPDATA/sounds/**" }]
},
{
  "identifier": "fs:allow-read-file",
  "allow": [{ "path": "$APPDATA/sounds/**" }]
},
{
  "identifier": "fs:allow-remove",
  "allow": [{ "path": "$APPDATA/sounds/**" }]
},
{
  "identifier": "fs:allow-exists",
  "allow": [{ "path": "$APPDATA/sounds" }, { "path": "$APPDATA/sounds/**" }]
}
```

- [ ] **Step 4: Add JS dependency**

In `package.json`, add to `dependencies` (alphabetical order near other `@tauri-apps/plugin-*`):

```json
"@tauri-apps/plugin-fs": "~2",
```

- [ ] **Step 5: Install + verify build**

Run:
```bash
pnpm install
pnpm tauri build --debug --no-bundle 2>&1 | tail -30
```

Expected: No compilation errors. (Debug build to save time; don't need to bundle.)

If Rust build is slow, you may substitute with `cd src-tauri && cargo check 2>&1 | tail -20` to verify Rust-only.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json package.json pnpm-lock.yaml
git commit -m "feat(sound-effects): add tauri-plugin-fs for imported sound storage"
```

---

### Task 2: Copy built-in sounds + CREDITS.md

**Files:**
- Create: `src/assets/sounds/*.aac` (5 files)
- Create: `CREDITS.md`

- [ ] **Step 1: Copy 5 AAC files from opencode**

```bash
mkdir -p src/assets/sounds
cp _ignore/opencode/packages/ui/src/assets/audio/staplebops-01.aac src/assets/sounds/
cp _ignore/opencode/packages/ui/src/assets/audio/yup-03.aac src/assets/sounds/
cp _ignore/opencode/packages/ui/src/assets/audio/nope-01.aac src/assets/sounds/
cp _ignore/opencode/packages/ui/src/assets/audio/bip-bop-02.aac src/assets/sounds/
cp _ignore/opencode/packages/ui/src/assets/audio/alert-01.aac src/assets/sounds/
ls -la src/assets/sounds/
```

Expected: 5 `.aac` files listed.

- [ ] **Step 2: Create CREDITS.md**

Write `CREDITS.md` at project root:

```markdown
# Credits

## Sound Effects

Notification sounds adapted from [opencode](https://github.com/sst/opencode) (MIT License).

Source path at time of adaptation: `packages/ui/src/assets/audio/*.aac`

Files used:
- `staplebops-01.aac` — agent response default
- `yup-03.aac` — permission request default
- `nope-01.aac` — message failed default
- `bip-bop-02.aac` — mention notification default
- `alert-01.aac` — alternate option

### opencode License (MIT)

```
MIT License

Copyright (c) opencode contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
```

- [ ] **Step 3: Commit**

```bash
git add src/assets/sounds/ CREDITS.md
git commit -m "feat(sound-effects): add 5 built-in sounds (adapted from opencode, MIT)"
```

---

### Task 3: Add SoundSettings types + defaults to settings-store.ts

**Files:**
- Modify: `src/openacp/lib/settings-store.ts`

- [ ] **Step 1: Add types + defaults + getAllSettings case**

Edit `src/openacp/lib/settings-store.ts`. After the `NotificationSettings` interface (~line 14), add:

```typescript
export type SoundEventKey =
  | "agentResponse"
  | "permissionRequest"
  | "messageFailed"
  | "mentionNotification"

export type ImportedFormat = "mp3" | "wav" | "ogg"

export interface ImportedSound {
  /** UUID — sole component of stored filename (prevents path traversal) */
  id: string
  /** User-visible name (default: original filename without ext, sanitized) */
  name: string
  /** Lowercase; file stored as "<id>.<ext>" in appDataDir/sounds/ */
  ext: ImportedFormat
  /** Epoch ms */
  importedAt: number
}

export interface SoundEventSettings {
  enabled: boolean
  /** "builtin:<name>" or "imported:<uuid>" */
  soundId: string
}

export interface SoundSettings {
  /** Master toggle — disables all sound effects when false */
  enabled: boolean
  /** 0..1 — global volume multiplier (clamped) */
  volume: number
  /** Imported sound metadata — files live in appDataDir/sounds/ (max 50 entries) */
  library: ImportedSound[]
  /** Per-event config */
  events: Record<SoundEventKey, SoundEventSettings>
}
```

Then modify `AppSettings` (~line 16) to add `sounds: SoundSettings`:

```typescript
export interface AppSettings {
  theme: "dark" | "light" | "system"
  fontSize: "small" | "medium" | "large"
  language: string
  devMode: boolean
  browserPanel: boolean
  browserLastMode: "docked" | "floating" | "pip"
  browserSearchEngine: "google" | "duckduckgo" | "bing"
  toolAutoExpand: Record<string, boolean>
  messageMode: "queue" | "instant"
  notifications: NotificationSettings
  sounds: SoundSettings   // NEW
}
```

Modify the `defaults` const (~line 29) to add `sounds`:

```typescript
const defaults: AppSettings = {
  // ...existing defaults unchanged...
  notifications: {
    enabled: true,
    agentResponse: true,
    permissionRequest: true,
    messageFailed: true,
  },
  sounds: {
    enabled: true,
    volume: 0.6,
    library: [],
    events: {
      agentResponse:       { enabled: true, soundId: "builtin:staplebops-01" },
      permissionRequest:   { enabled: true, soundId: "builtin:yup-03" },
      messageFailed:       { enabled: true, soundId: "builtin:nope-01" },
      mentionNotification: { enabled: true, soundId: "builtin:bip-bop-02" },
    },
  },
}
```

Modify `getAllSettings` (~line 74) to read + return `sounds`. **Preserve all existing reads** — add only the `sounds` read and include it in the return object:

```typescript
export async function getAllSettings(): Promise<AppSettings> {
  const s = await getStore()
  const theme = ((await s.get("theme")) as AppSettings["theme"]) ?? defaults.theme
  const fontSize = ((await s.get("fontSize")) as AppSettings["fontSize"]) ?? defaults.fontSize
  const language = ((await s.get("language")) as AppSettings["language"]) ?? defaults.language
  const devMode = ((await s.get("devMode")) as AppSettings["devMode"]) ?? defaults.devMode
  const browserPanel = ((await s.get("browserPanel")) as AppSettings["browserPanel"]) ?? defaults.browserPanel
  const browserLastMode =
    ((await s.get("browserLastMode")) as AppSettings["browserLastMode"]) ?? defaults.browserLastMode
  const browserSearchEngine =
    ((await s.get("browserSearchEngine")) as AppSettings["browserSearchEngine"]) ?? defaults.browserSearchEngine
  const toolAutoExpand =
    ((await s.get("toolAutoExpand")) as AppSettings["toolAutoExpand"]) ?? defaults.toolAutoExpand
  const messageMode =
    ((await s.get("messageMode")) as AppSettings["messageMode"]) ?? defaults.messageMode
  const notifications =
    ((await s.get("notifications")) as AppSettings["notifications"]) ?? defaults.notifications
  const sounds =
    ((await s.get("sounds")) as AppSettings["sounds"]) ?? defaults.sounds  // NEW
  return {
    theme, fontSize, language, devMode, browserPanel, browserLastMode,
    browserSearchEngine, toolAutoExpand, messageMode, notifications,
    sounds,  // NEW
  }
}
```

- [ ] **Step 2: Verify TypeScript**

Run:
```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: No errors (or no errors related to settings-store).

- [ ] **Step 3: Commit**

```bash
git add src/openacp/lib/settings-store.ts
git commit -m "feat(sound-effects): add SoundSettings types and defaults"
```

---

### Task 4: Create sound-registry.ts (list + resolve; no import/delete yet)

**Files:**
- Create: `src/openacp/lib/sound-registry.ts`

- [ ] **Step 1: Write the registry module**

Create `src/openacp/lib/sound-registry.ts`:

```typescript
import { convertFileSrc } from "@tauri-apps/api/core"
import { appDataDir } from "@tauri-apps/api/path"
import type { ImportedSound, SoundEventKey } from "./settings-store"

export interface Sound {
  /** "builtin:<name>" or "imported:<uuid>" */
  id: string
  /** User-visible name */
  name: string
  source: "builtin" | "imported"
}

/** Default soundId per event — used as fallback when user's choice is missing */
export const BUILTIN_DEFAULTS: Record<SoundEventKey, string> = {
  agentResponse:       "builtin:staplebops-01",
  permissionRequest:   "builtin:yup-03",
  messageFailed:       "builtin:nope-01",
  mentionNotification: "builtin:bip-bop-02",
}

/** Built-in assets — Vite glob, lazy by default */
const BUILTIN_LOADERS = import.meta.glob("../../assets/sounds/*.aac", {
  import: "default",
}) as Record<string, () => Promise<string>>

/** Extract "<name>" from "../../assets/sounds/<name>.aac" */
function builtinNameFromPath(path: string): string {
  const match = path.match(/\/([^/]+)\.aac$/)
  return match ? match[1] : path
}

/** List all available built-in sound names */
function listBuiltinNames(): string[] {
  return Object.keys(BUILTIN_LOADERS).map(builtinNameFromPath).sort()
}

/** Return a unified catalog of all sounds (built-in + imported) */
export async function getAllSounds(library: ImportedSound[]): Promise<Sound[]> {
  const builtins: Sound[] = listBuiltinNames().map((name) => ({
    id: `builtin:${name}`,
    name,
    source: "builtin",
  }))
  const imported: Sound[] = library.map((s) => ({
    id: `imported:${s.id}`,
    name: s.name,
    source: "imported",
  }))
  return [...builtins, ...imported]
}

/** Resolve a soundId to a playable URL. Returns null if unresolvable. */
export async function getSoundSrc(
  soundId: string,
  library: ImportedSound[],
): Promise<string | null> {
  if (soundId.startsWith("builtin:")) {
    const name = soundId.slice("builtin:".length)
    const entry = Object.entries(BUILTIN_LOADERS).find(
      ([p]) => builtinNameFromPath(p) === name,
    )
    if (!entry) return null
    try {
      return await entry[1]()
    } catch (err) {
      console.warn("[sound-registry] built-in load failed:", name, err)
      return null
    }
  }
  if (soundId.startsWith("imported:")) {
    const id = soundId.slice("imported:".length)
    const meta = library.find((s) => s.id === id)
    if (!meta) return null
    try {
      const base = await appDataDir()
      // Path join with '/' — Tauri normalizes on all platforms
      const absolutePath = `${base}/sounds/${meta.id}.${meta.ext}`
      return convertFileSrc(absolutePath)
    } catch (err) {
      console.warn("[sound-registry] imported resolve failed:", id, err)
      return null
    }
  }
  return null
}
```

- [ ] **Step 2: Verify TypeScript**

Run:
```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/lib/sound-registry.ts
git commit -m "feat(sound-effects): add sound-registry (list + resolve)"
```

---

### Task 5: Create sound-player.ts

**Files:**
- Create: `src/openacp/lib/sound-player.ts`

- [ ] **Step 1: Write the player module**

Create `src/openacp/lib/sound-player.ts`:

```typescript
import { getSetting } from "./settings-store"
import type { SoundEventKey } from "./settings-store"
import { BUILTIN_DEFAULTS, getSoundSrc } from "./sound-registry"

const COOLDOWN_MS = 500
const lastPlayedAt: Partial<Record<SoundEventKey, number>> = {}

/** Cache of resolved soundId → src — warmed by preloadDefaultSounds */
const srcCache: Map<string, string> = new Map()

/** Live audio elements — tracked so stopAllSounds can pause them */
const activeAudios: Set<HTMLAudioElement> = new Set()

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

async function resolveAndCache(
  soundId: string,
  library: Parameters<typeof getSoundSrc>[1],
): Promise<string | null> {
  const cached = srcCache.get(soundId)
  if (cached) return cached
  const src = await getSoundSrc(soundId, library)
  if (src) srcCache.set(soundId, src)
  return src
}

async function playSrc(src: string, volume: number): Promise<void> {
  const audio = new Audio(src)
  audio.volume = clamp01(volume)
  activeAudios.add(audio)
  const cleanup = () => {
    activeAudios.delete(audio)
    audio.removeEventListener("ended", cleanup)
    audio.removeEventListener("error", cleanup)
  }
  audio.addEventListener("ended", cleanup)
  audio.addEventListener("error", cleanup)
  try {
    await audio.play()
  } catch (err) {
    cleanup()
    console.warn("[sound-player] play failed:", err)
  }
}

/** Preload the 4 default built-in sounds' URLs to eliminate first-play latency */
export async function preloadDefaultSounds(): Promise<void> {
  const sounds = await getSetting("sounds")
  const library = sounds?.library ?? []
  const ids = Object.values(BUILTIN_DEFAULTS)
  await Promise.all(ids.map((id) => resolveAndCache(id, library)))
}

/** Play the sound associated with an event — honors enable toggles + cooldown */
export async function playEventSound(eventKey: SoundEventKey): Promise<void> {
  const sounds = await getSetting("sounds")
  if (!sounds?.enabled) return
  const ev = sounds.events?.[eventKey]
  if (!ev?.enabled) return

  const now = Date.now()
  const last = lastPlayedAt[eventKey] ?? 0
  if (now - last < COOLDOWN_MS) return
  lastPlayedAt[eventKey] = now

  const library = sounds.library ?? []
  let src = await resolveAndCache(ev.soundId, library)
  if (!src) {
    // Fallback: user's pick is missing — use the built-in default for this event
    src = await resolveAndCache(BUILTIN_DEFAULTS[eventKey], library)
  }
  if (!src) return
  await playSrc(src, sounds.volume)
}

/** Preview a specific sound — bypasses master/event toggles and cooldown */
export async function previewSound(soundId: string): Promise<void> {
  const sounds = await getSetting("sounds")
  const library = sounds?.library ?? []
  const src = await resolveAndCache(soundId, library)
  if (!src) return
  await playSrc(src, sounds?.volume ?? 0.6)
}

/** Stop all currently-playing audios (used when disabling/unmounting) */
export function stopAllSounds(): void {
  for (const a of activeAudios) {
    try {
      a.pause()
      a.currentTime = 0
    } catch {}
  }
  activeAudios.clear()
}

/** Evict a cached src — call after delete/import to pick up changes */
export function invalidateSoundCache(soundId?: string): void {
  if (soundId) srcCache.delete(soundId)
  else srcCache.clear()
}
```

- [ ] **Step 2: Verify TypeScript**

Run:
```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/lib/sound-player.ts
git commit -m "feat(sound-effects): add sound-player with cooldown, preload, and cache"
```

---

### Task 6: Create use-sound-effects hook + mount in app.tsx

**Files:**
- Create: `src/openacp/hooks/use-sound-effects.ts`
- Modify: `src/openacp/app.tsx:397` (after `useSystemNotifications` call)

- [ ] **Step 1: Create hook**

Create `src/openacp/hooks/use-sound-effects.ts`:

```typescript
import { useEffect } from "react"
import { playEventSound, preloadDefaultSounds } from "../lib/sound-player"

/**
 * Plays sound effects for background events.
 * Mirrors the event dispatch contract of `use-system-notifications.ts` —
 * both hooks listen to the same window events but handle different channels
 * (this one: audio; the other: visual toast + OS notification).
 */
export function useSoundEffects(): void {
  // Preload defaults once on mount to eliminate first-play latency.
  useEffect(() => {
    void preloadDefaultSounds()
  }, [])

  useEffect(() => {
    function handleAgentEvent(e: Event) {
      const { event } = (e as CustomEvent).detail ?? {}
      // "usage" fires once at end-of-turn — same marker used by notifications hook
      if (event?.type === "usage") void playEventSound("agentResponse")
    }
    function handlePermissionRequest() {
      void playEventSound("permissionRequest")
    }
    function handleMessageFailed() {
      void playEventSound("messageFailed")
    }
    function handleMention() {
      void playEventSound("mentionNotification")
    }

    window.addEventListener("agent-event", handleAgentEvent)
    window.addEventListener("permission-request", handlePermissionRequest)
    window.addEventListener("message-failed", handleMessageFailed)
    window.addEventListener("mention-notification", handleMention)

    return () => {
      window.removeEventListener("agent-event", handleAgentEvent)
      window.removeEventListener("permission-request", handlePermissionRequest)
      window.removeEventListener("message-failed", handleMessageFailed)
      window.removeEventListener("mention-notification", handleMention)
    }
  }, [])
}
```

- [ ] **Step 2: Mount the hook in app.tsx**

Edit `src/openacp/app.tsx` — add import at top (group with other hook imports):

```typescript
import { useSoundEffects } from "./hooks/use-sound-effects"
```

Then at line ~397 (immediately after the `useSystemNotifications(...)` call), add:

```typescript
useSoundEffects()
```

- [ ] **Step 3: Verify TypeScript + build**

Run:
```bash
pnpm tsc --noEmit 2>&1 | head -10
pnpm build 2>&1 | tail -5
```

Expected: No TypeScript errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/hooks/use-sound-effects.ts src/openacp/app.tsx
git commit -m "feat(sound-effects): wire up window event listeners to sound player"
```

---

### Task 7: Create Slider UI component

**Files:**
- Create: `src/openacp/components/ui/slider.tsx`

- [ ] **Step 1: Write minimal radix Slider wrapper**

Create `src/openacp/components/ui/slider.tsx`:

```tsx
import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "src/lib/utils"

function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none select-none items-center disabled:opacity-40 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-primary"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className="block size-4 rounded-full border-2 border-primary bg-background shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
```

- [ ] **Step 2: Verify TypeScript**

Run:
```bash
pnpm tsc --noEmit 2>&1 | head -10
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/ui/slider.tsx
git commit -m "feat(ui): add Slider wrapper around radix Slider primitive"
```

---

### Task 8: Create settings-sounds.tsx (General + Events sections; no Library yet)

**Files:**
- Create: `src/openacp/components/settings/settings-sounds.tsx`

- [ ] **Step 1: Write the settings page**

Create `src/openacp/components/settings/settings-sounds.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from "react"
import { SpeakerHigh, Play } from "@phosphor-icons/react"
import { getSetting, setSetting, type SoundSettings, type SoundEventKey } from "../../lib/settings-store"
import { getAllSounds, type Sound } from "../../lib/sound-registry"
import { previewSound, invalidateSoundCache } from "../../lib/sound-player"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"
import { Slider } from "../ui/slider"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../ui/select"

const DEFAULTS: SoundSettings = {
  enabled: true,
  volume: 0.6,
  library: [],
  events: {
    agentResponse:       { enabled: true, soundId: "builtin:staplebops-01" },
    permissionRequest:   { enabled: true, soundId: "builtin:yup-03" },
    messageFailed:       { enabled: true, soundId: "builtin:nope-01" },
    mentionNotification: { enabled: true, soundId: "builtin:bip-bop-02" },
  },
}

const EVENT_META: { key: SoundEventKey; label: string; description: string }[] = [
  {
    key: "agentResponse",
    label: "Agent response complete",
    description: "Play when the agent finishes responding",
  },
  {
    key: "permissionRequest",
    label: "Permission request",
    description: "Play when the agent needs approval to use a tool",
  },
  {
    key: "messageFailed",
    label: "Message failed",
    description: "Play when a message fails to process",
  },
  {
    key: "mentionNotification",
    label: "Mentioned in session",
    description: "Play when the agent mentions you in a teamwork session",
  },
]

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${checked ? "bg-primary" : "bg-secondary"}`}
    >
      <span className={`pointer-events-none inline-block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  )
}

export function SettingsSounds() {
  const [settings, setSettings] = useState<SoundSettings>(DEFAULTS)
  const [catalog, setCatalog] = useState<Sound[]>([])

  const refreshCatalog = useCallback(async (library: SoundSettings["library"]) => {
    const all = await getAllSounds(library)
    setCatalog(all)
  }, [])

  useEffect(() => {
    void (async () => {
      const s = await getSetting("sounds")
      const merged = { ...DEFAULTS, ...s, events: { ...DEFAULTS.events, ...(s?.events ?? {}) } }
      setSettings(merged)
      await refreshCatalog(merged.library)
    })()
  }, [refreshCatalog])

  async function update(patch: Partial<SoundSettings>) {
    const fresh = (await getSetting("sounds")) ?? DEFAULTS
    const next: SoundSettings = { ...fresh, ...patch, events: patch.events ?? fresh.events }
    setSettings(next)
    await setSetting("sounds", next)
    window.dispatchEvent(new CustomEvent("settings-changed"))
  }

  async function updateEvent(key: SoundEventKey, patch: Partial<SoundSettings["events"][SoundEventKey]>) {
    const fresh = (await getSetting("sounds")) ?? DEFAULTS
    const events = { ...fresh.events, [key]: { ...fresh.events[key], ...patch } }
    const next: SoundSettings = { ...fresh, events }
    setSettings(next)
    await setSetting("sounds", next)
    window.dispatchEvent(new CustomEvent("settings-changed"))
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── General ────────────────────────────────────────────── */}
      <SettingCard title="General">
        <SettingRow label="Enable sounds" description="Play audio cues for background events">
          <Toggle checked={settings.enabled} onChange={(v) => void update({ enabled: v })} />
        </SettingRow>
        <SettingRow label="Volume" description="Applies to all sound effects">
          <div className="flex items-center gap-3 w-48">
            <Slider
              value={[Math.round(settings.volume * 100)]}
              min={0}
              max={100}
              step={1}
              onValueChange={(vals) => void update({ volume: (vals[0] ?? 0) / 100 })}
              disabled={!settings.enabled}
              aria-label="Sound volume"
            />
            <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{Math.round(settings.volume * 100)}%</span>
          </div>
        </SettingRow>
      </SettingCard>

      {/* ── Events ─────────────────────────────────────────────── */}
      <SettingCard title="Events">
        {EVENT_META.map((meta) => {
          const ev = settings.events[meta.key]
          return (
            <SettingRow key={meta.key} label={meta.label} description={meta.description}>
              <div className="flex items-center gap-2">
                <Select
                  value={ev.soundId}
                  onValueChange={(soundId) => void updateEvent(meta.key, { soundId })}
                  disabled={!settings.enabled || !ev.enabled}
                >
                  <SelectTrigger className="w-44" aria-label={`${meta.label} sound`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Built-in</SelectLabel>
                      {catalog.filter((s) => s.source === "builtin").map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    {catalog.some((s) => s.source === "imported") && (
                      <SelectGroup>
                        <SelectLabel>Imported</SelectLabel>
                        {catalog.filter((s) => s.source === "imported").map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  className="size-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => void previewSound(ev.soundId)}
                  disabled={!settings.enabled || !ev.enabled}
                  aria-label={`Preview ${meta.label} sound`}
                  title="Preview"
                >
                  <Play size={16} weight="fill" />
                </button>
                <Toggle
                  checked={ev.enabled}
                  onChange={(v) => void updateEvent(meta.key, { enabled: v })}
                  disabled={!settings.enabled}
                />
              </div>
            </SettingRow>
          )
        })}
      </SettingCard>
    </div>
  )
}

// Keep the unused-import check silent (SpeakerHigh used in nav, Play used above)
export const _iconRefs = { SpeakerHigh }
```

- [ ] **Step 2: Remove the dummy export**

After writing, delete the `export const _iconRefs` line — it's only needed if there's a linter complaint. If `SpeakerHigh` import isn't used inside this file, remove it too (the icon is used in `settings-dialog.tsx`, not here). Trim:

```typescript
import { Play } from "@phosphor-icons/react"
```

(Drop `SpeakerHigh` import and the `_iconRefs` line.)

- [ ] **Step 3: Verify TypeScript**

Run:
```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/components/settings/settings-sounds.tsx
git commit -m "feat(sound-effects): add Settings Sounds page (General + Events)"
```

---

### Task 9: Add "Sounds" nav entry to settings-dialog.tsx

**Files:**
- Modify: `src/openacp/components/settings/settings-dialog.tsx`

- [ ] **Step 1: Add import**

In `src/openacp/components/settings/settings-dialog.tsx`, add `SpeakerHigh` to the Phosphor import (~line 2) and `SettingsSounds` to the settings imports (~line 10):

```typescript
import { GearSix, Palette, Robot, Desktop, Info, Bell, SpeakerHigh } from "@phosphor-icons/react";
// ...
import { SettingsSounds } from "./settings-sounds";
```

- [ ] **Step 2: Add "sounds" to SettingsPage union**

In the `SettingsPage` type (~line 12):

```typescript
export type SettingsPage =
  | "general"
  | "appearance"
  | "notifications"
  | "sounds"    // NEW
  | "agents"
  | "server"
  | "about";
```

- [ ] **Step 3: Add nav entry**

In the `NAV_GROUPS` "App" group (~line 31), add after `notifications`:

```typescript
{ id: "notifications", label: "Notifications", icon: Bell },
{ id: "sounds", label: "Sounds", icon: SpeakerHigh },
```

- [ ] **Step 4: Render the page**

Find the content rendering switch (search for `{page === "notifications" && <SettingsNotifications`). Add:

```tsx
{page === "sounds" && <SettingsSounds />}
```

- [ ] **Step 5: Verify build**

Run:
```bash
pnpm build 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/openacp/components/settings/settings-dialog.tsx
git commit -m "feat(sound-effects): add Sounds page to settings dialog nav"
```

---

### Task 10: Implement importSound + deleteImportedSound in registry

**Files:**
- Modify: `src/openacp/lib/sound-registry.ts`

- [ ] **Step 1: Add FS operations + import/delete functions**

**Hoist the new imports to the top of `src/openacp/lib/sound-registry.ts`** (with the existing imports — do NOT leave them at the bottom):

```typescript
import { BaseDirectory, exists, mkdir, writeFile, remove } from "@tauri-apps/plugin-fs"
import type { ImportedFormat } from "./settings-store"
```

Then append the rest of the module (constants, error class, helpers, functions) to the end of the file:

const ALLOWED_EXTS: ImportedFormat[] = ["mp3", "wav", "ogg"]
const MAX_SIZE_BYTES = 5 * 1024 * 1024
export const MAX_LIBRARY_SIZE = 50

export class SoundImportError extends Error {
  constructor(public code: "library-full" | "too-large" | "unsupported-format" | "write-failed", message: string) {
    super(message)
    this.name = "SoundImportError"
  }
}

function sanitizeDisplayName(raw: string): string {
  // Strip extension, keep only word chars + space + dash + dot; cap 64 chars
  const withoutExt = raw.replace(/\.[^./\\]+$/, "")
  return withoutExt.replace(/[^\w\s\-.]/g, "").trim().slice(0, 64) || "Sound"
}

function extOf(filename: string): string | null {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : null
}

async function ensureSoundsDir(): Promise<void> {
  const present = await exists("sounds", { baseDir: BaseDirectory.AppData })
  if (!present) {
    await mkdir("sounds", { baseDir: BaseDirectory.AppData, recursive: true })
  }
}

/**
 * Import a user-selected audio file.
 *
 * Validates size + format + library cap. Writes to appDataDir/sounds/<uuid>.<ext>.
 * Returns metadata — caller MUST re-read `sounds` settings via `getSetting('sounds')`
 * immediately before persisting the new library to avoid clobbering concurrent writes.
 *
 * The `currentLibrary` argument is for the library-size precheck only (may be
 * stale). The authoritative atomicity step lives in the caller (see
 * `settings-sounds.tsx` `handleImport`), which re-reads settings AFTER this
 * function returns and BEFORE `setSetting`.
 */
export async function importSound(
  file: File,
  currentLibrary: ImportedSound[],
): Promise<ImportedSound> {
  if (currentLibrary.length >= MAX_LIBRARY_SIZE) {
    throw new SoundImportError(
      "library-full",
      `Library full (max ${MAX_LIBRARY_SIZE} sounds) — delete unused sounds first`,
    )
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new SoundImportError("too-large", "File too large (max 5MB)")
  }
  const ext = extOf(file.name)
  if (!ext || !ALLOWED_EXTS.includes(ext as ImportedFormat)) {
    throw new SoundImportError("unsupported-format", "Use MP3, WAV, or OGG")
  }

  const id = crypto.randomUUID()
  const bytes = new Uint8Array(await file.arrayBuffer())

  try {
    await ensureSoundsDir()
    await writeFile(`sounds/${id}.${ext}`, bytes, { baseDir: BaseDirectory.AppData })
  } catch (err) {
    console.error("[sound-registry] write failed:", err)
    throw new SoundImportError("write-failed", "Failed to save imported sound")
  }

  return {
    id,
    name: sanitizeDisplayName(file.name),
    ext: ext as ImportedFormat,
    importedAt: Date.now(),
  }
}

/**
 * Delete an imported sound's file from disk. Idempotent — missing file is OK.
 */
export async function deleteImportedSoundFile(id: string, ext: ImportedFormat): Promise<void> {
  try {
    const present = await exists(`sounds/${id}.${ext}`, { baseDir: BaseDirectory.AppData })
    if (present) {
      await remove(`sounds/${id}.${ext}`, { baseDir: BaseDirectory.AppData })
    }
  } catch (err) {
    // Orphaned file is harmless — surface in logs but don't throw; caller may still want to drop the library entry
    console.warn("[sound-registry] remove failed (entry will still be dropped):", err)
  }
}
```

- [ ] **Step 2: Verify TypeScript**

Run:
```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/lib/sound-registry.ts
git commit -m "feat(sound-effects): add importSound and deleteImportedSoundFile"
```

---

### Task 11: Add Library section to settings-sounds.tsx (import + list + delete)

**Files:**
- Modify: `src/openacp/components/settings/settings-sounds.tsx`

- [ ] **Step 1: Extend imports**

At top of the file, extend the registry import and add `importSound`, `deleteImportedSoundFile`, `MAX_LIBRARY_SIZE`, `SoundImportError`:

```typescript
import {
  getAllSounds,
  importSound,
  deleteImportedSoundFile,
  MAX_LIBRARY_SIZE,
  SoundImportError,
  BUILTIN_DEFAULTS,
  type Sound,
} from "../../lib/sound-registry"
import { Trash, Upload } from "@phosphor-icons/react"
import { toast } from "sonner"
```

Also import `previewSound` and `invalidateSoundCache` (already present from Task 8).

- [ ] **Step 2: Add Library state + handlers**

Inside `SettingsSounds` component, add local state:

```typescript
const [importError, setImportError] = useState<string | null>(null)
const fileInputRef = React.useRef<HTMLInputElement | null>(null)
```

Add handler functions inside the component:

```typescript
async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
  setImportError(null)
  const file = e.target.files?.[0]
  e.target.value = "" // reset input so same file can be re-imported after error
  if (!file) return
  const fresh = (await getSetting("sounds")) ?? DEFAULTS
  try {
    const meta = await importSound(file, fresh.library)
    const next: SoundSettings = { ...fresh, library: [...fresh.library, meta] }
    setSettings(next)
    await setSetting("sounds", next)
    window.dispatchEvent(new CustomEvent("settings-changed"))
    await refreshCatalog(next.library)
    toast.success(`Imported "${meta.name}"`)
  } catch (err) {
    if (err instanceof SoundImportError) {
      setImportError(err.message)
      if (err.code === "write-failed") toast.error(err.message)
    } else {
      console.error(err)
      setImportError("Unexpected error during import")
      toast.error("Import failed")
    }
  }
}

async function handleDelete(soundId: string) {
  // soundId is "imported:<uuid>"
  const uuid = soundId.slice("imported:".length)
  const fresh = (await getSetting("sounds")) ?? DEFAULTS
  const meta = fresh.library.find((s) => s.id === uuid)
  if (!meta) return
  const ok = window.confirm(`Delete "${meta.name}"? This cannot be undone.`)
  if (!ok) return

  await deleteImportedSoundFile(meta.id, meta.ext)
  invalidateSoundCache(soundId)

  // Reset any events that were using this sound to their defaults
  const revertedEvents: SoundEventKey[] = []
  const events = { ...fresh.events }
  for (const key of Object.keys(events) as SoundEventKey[]) {
    if (events[key].soundId === soundId) {
      events[key] = { ...events[key], soundId: BUILTIN_DEFAULTS[key] }
      revertedEvents.push(key)
    }
  }
  const next: SoundSettings = {
    ...fresh,
    library: fresh.library.filter((s) => s.id !== uuid),
    events,
  }
  setSettings(next)
  await setSetting("sounds", next)
  window.dispatchEvent(new CustomEvent("settings-changed"))
  await refreshCatalog(next.library)

  if (revertedEvents.length > 0) {
    toast(`Reverted ${revertedEvents.length} event${revertedEvents.length > 1 ? "s" : ""} to default sound`)
  }
}
```

- [ ] **Step 3: Add Library card to the JSX (between General and Events)**

```tsx
<SettingCard title="Sound Library">
  <div className="flex flex-col">
    {catalog.map((s) => (
      <div
        key={s.id}
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border-weak last:border-b-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-foreground truncate">{s.name}</span>
          <span className="text-2xs uppercase tracking-wider text-muted-foreground">
            {s.source}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            onClick={() => void previewSound(s.id)}
            disabled={!settings.enabled}
            aria-label={`Preview ${s.name}`}
            title="Preview"
          >
            <Play size={14} weight="fill" />
          </button>
          {s.source === "imported" && (
            <button
              type="button"
              className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void handleDelete(s.id)}
              aria-label={`Delete ${s.name}`}
              title="Delete"
            >
              <Trash size={14} />
            </button>
          )}
        </div>
      </div>
    ))}
  </div>
  <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border-weak">
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-sm font-medium text-foreground">Import audio</span>
      <span className="text-sm text-muted-foreground">
        MP3, WAV, OGG — max 5MB, up to {MAX_LIBRARY_SIZE} sounds
      </span>
      {importError && (
        <span className="text-sm text-destructive mt-1">{importError}</span>
      )}
    </div>
    <div className="shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
        className="hidden"
        onChange={(e) => void handleImport(e)}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-40"
        disabled={settings.library.length >= MAX_LIBRARY_SIZE}
      >
        <Upload size={14} />
        Import…
      </button>
    </div>
  </div>
</SettingCard>
```

- [ ] **Step 4: Verify build**

Run:
```bash
pnpm build 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/openacp/components/settings/settings-sounds.tsx
git commit -m "feat(sound-effects): add Sound Library UI (import + list + delete)"
```

---

### Task 12: Final manual verification + dark/light theme pass

**Files:** (no edits unless issues found)

- [ ] **Step 1: Dev-run the app**

Run:
```bash
pnpm tauri dev
```

- [ ] **Step 2: Verify each flow**

In the running app:

1. Open Settings → Sounds. Confirm the new page renders with General, Sound Library, Events cards.
2. Toggle master enable off → event toggles and sliders should disable.
3. Move volume slider. Click a Preview button in Library — confirm volume reflects slider.
4. Switch sound for one event via the dropdown. Click Preview next to dropdown — correct sound plays.
5. Click Import — pick an MP3 < 5MB. Confirm it appears in Library, selectable in dropdowns.
6. Try importing a .txt file. Confirm error "Use MP3, WAV, or OGG".
7. Try importing a file > 5MB. Confirm error "File too large (max 5MB)".
8. Delete an imported sound that an event was using. Confirm toast "Reverted N event(s)" fires and event falls back to default.
9. Trigger real events:
   - Send a prompt in a session, wait for response — agent sound plays when complete.
   - Request a tool that needs permission approval — permission sound plays.
   - Cause a message failure (disconnect SSE briefly if possible) — failure sound plays.
   - Mention: harder to trigger manually; skip or test with a crafted event.
10. Switch theme to Light (Settings → Appearance). Return to Sounds. Verify no hardcoded colors bleed through — all rows/cards/buttons look correct in both themes.

- [ ] **Step 3: If issues found, fix inline**

For each issue, make the smallest possible fix and commit separately with a descriptive message.

- [ ] **Step 4: Cross-platform smoke (if available)**

If a Linux/Windows build environment is on hand, repeat step 2.1 and 2.9 on each platform to confirm AAC playback works. If Linux WebKitGTK rejects AAC (silent failure, no playback), open a follow-up issue to convert built-ins to MP3. Not a blocker for macOS-only releases.

- [ ] **Step 5: Push (only after user verification)**

Per project rules (`feedback_no_push_before_verify.md`), do NOT push without explicit user confirmation. Report completion and wait for the user to test locally before pushing.

---

## Completion criteria

All tasks' commits present on `feat/sound-effects` branch. Manual verification of Task 12 passes on macOS at minimum. No hardcoded colors, emoji, `font-weight > 500`, or `font-size < 11px` in new UI. No silent `catch {}` blocks. All imports from `@phosphor-icons/react` for icons. Typescript compiles cleanly. App builds without errors.

After user confirms local verification, hand off for push + PR.
