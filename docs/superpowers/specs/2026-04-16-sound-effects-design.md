# Sound Effects System — Design Spec

**Date:** 2026-04-16
**Status:** Approved
**Branch:** `feat/sound-effects`

---

## Problem

OpenACP-App has visual notifications (toast + native OS) for agent events but no audio cues. Users want to hear when:

1. Agent finishes responding (background work complete)
2. Agent requests permission approval (human-in-the-loop)
3. A message fails to process (error feedback)
4. User is mentioned by the agent in a teamwork session

The opencode project (`_ignore/opencode`) ships a sound-effects system we can learn from — per-event enable + sound selection, lazy asset loading, live preview. We want a **similar** system (not a 1:1 clone), adapted to OpenACP's architecture and with **user-imported custom sounds** as an additional capability.

## Goals & Non-goals

### Goals
- 4 event types (agent response, permission request, message failed, mention) each with independent enable toggle + sound selection.
- Curated set of built-in sounds (copied from opencode) so the app is useful out-of-the-box.
- User can import their own audio files (MP3/WAV/OGG, ≤5MB).
- Preview any sound at current volume from the settings UI.
- Global volume slider.
- Playback works regardless of window focus (the point of audio cues is *when you're elsewhere*).

### Non-goals (YAGNI)
- Per-event volume
- Audio effects (fade, loop, spatial)
- Sound packs / collections
- Cloud sync of imported sounds
- Mute keyboard shortcut
- Unit/integration test infrastructure for React components (project has none; manual verification only for v1)

## Design

### 1. Independence from NotificationSettings

Sound is **decoupled** from `NotificationSettings`. Visual notifications and audio cues are separate channels — a user may want one without the other (e.g., mute OS notifications but keep audio, or vice versa). This adds a new top-level key `sounds` in `AppSettings`, parallel to `notifications`.

This differs from the current `NotificationSettings` which has 3 events; sound has 4 (adds `mentionNotification`). Mention is already handled by `use-system-notifications.ts` but without a dedicated toggle — sound gives it first-class treatment.

### 2. Data model — `SoundSettings`

Added to `src/openacp/lib/settings-store.ts`:

```typescript
export type SoundEventKey =
  | "agentResponse"
  | "permissionRequest"
  | "messageFailed"
  | "mentionNotification"

export type ImportedFormat = "mp3" | "wav" | "ogg"

export interface ImportedSound {
  id: string              // uuid v4 — sole component of stored filename
  name: string            // user-visible (default: filename without extension, sanitized)
  ext: ImportedFormat     // lowercase; derives filename "<id>.<ext>" in appDataDir/sounds/
  importedAt: number      // epoch ms
}

export interface SoundEventSettings {
  enabled: boolean
  soundId: string         // "builtin:<name>" | "imported:<uuid>"
}

export interface SoundSettings {
  enabled: boolean                       // master toggle
  volume: number                         // 0..1, clamped
  library: ImportedSound[]               // imported sound metadata (max 50 entries)
  events: Record<SoundEventKey, SoundEventSettings>
}
```

Added to `AppSettings`:
```typescript
sounds: SoundSettings
```

**Defaults:**
```typescript
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
}
```

### 3. Sound ID format

- **`builtin:<name>`** — references a bundled asset in `src/assets/sounds/<name>.aac`
- **`imported:<uuid>`** — references an entry in `sounds.library` (file lives in `appDataDir/sounds/<uuid>.<ext>`)

Single string format simplifies event→sound mapping, dropdown values, and settings migration.

### 4. File layout

```
src/openacp/lib/
  sound-registry.ts       # list/resolve/import/delete sounds
  sound-player.ts         # playback with cooldown + volume

src/openacp/hooks/
  use-sound-effects.ts    # window event listeners → playEventSound

src/openacp/components/settings/
  settings-sounds.tsx     # Settings page UI

src/assets/sounds/        # Built-in AAC files (5, copied from opencode)
  staplebops-01.aac       # agent default
  yup-03.aac              # permission default
  nope-01.aac             # message-failed default
  bip-bop-02.aac          # mention default
  alert-01.aac            # alt built-in
```

### 5. Module contracts

#### `sound-registry.ts`

```typescript
export interface Sound {
  id: string                          // "builtin:<name>" | "imported:<uuid>"
  name: string                        // user-visible
  source: "builtin" | "imported"
}

export const BUILTIN_DEFAULTS: Record<SoundEventKey, string>
  // { agentResponse: "builtin:staplebops-01", ... }

export async function getAllSounds(library: ImportedSound[]): Promise<Sound[]>
export async function getSoundSrc(id: string, library: ImportedSound[]): Promise<string | null>
export async function importSound(file: File): Promise<ImportedSound>
export async function deleteImportedSound(id: string, library: ImportedSound[]): Promise<void>
```

**Implementation notes:**
- Built-in assets loaded via Vite: `const BUILTIN = import.meta.glob("../../assets/sounds/*.aac", { eager: false, import: "default" })`. Lazy + cached by Vite.
- Imported file resolution: `convertFileSrc` from `@tauri-apps/api/core` on `${appDataDir}/sounds/<id>.<ext>`.
- **Filename sanitization contract:** the stored filename is `${uuidv4()}.${ext}` where `ext` is the lowercased last `.`-segment of the original filename, validated against the allowlist `["mp3", "wav", "ogg"]`. The user-supplied filename is NEVER used in the stored path — only for the human-visible `name` field (stripped of extension and sanitized via `.replace(/[^\w\s\-.]/g, "").trim().slice(0, 64)`). This prevents path traversal, directory escape, and double-extension attacks (e.g., `sound.mp3.exe`).
- **Library size cap:** `importSound` rejects with "Library full (max 50 sounds)" if `library.length >= 50` before writing anything.
- `importSound` validation order: (1) library size; (2) file size ≤5MB; (3) extension in allowlist. Then: generate UUID via native `crypto.randomUUID()` (no external dep) → read bytes → write via `@tauri-apps/plugin-fs` `writeFile` with `BaseDirectory.AppData` scoped to `sounds/` subdir → return metadata.
- **Atomicity contract:** caller MUST re-read `sounds` via `getSetting('sounds')` immediately before calling `setSetting` to avoid clobbering concurrent writes (e.g., user toggling a setting mid-import). Caller adds the returned metadata to the fresh library snapshot and persists.
- `deleteImportedSound` removes the file + returns updated library (caller persists under same atomicity contract). If the file is already missing, proceed silently (delete is idempotent).
- If app-data subdir `sounds/` doesn't exist on first import, create it (`mkdir` with `recursive: true`).

#### `sound-player.ts`

```typescript
const COOLDOWN_MS = 500
const lastPlayedAt: Partial<Record<SoundEventKey, number>> = {}

export async function preloadDefaultSounds(): Promise<void>  // call once on app mount
export async function playEventSound(eventKey: SoundEventKey): Promise<void>
export async function previewSound(soundId: string): Promise<void>
export function stopAllSounds(): void
```

**`preloadDefaultSounds`:** resolves the 4 built-in default sound URLs via `getSoundSrc` and keeps a module-level cache `{ [id: string]: string }` of resolved sources. Eliminates first-play latency (50–200ms) for permission-request and other latency-sensitive events. Subsequent `playEventSound` calls hit the cache.

**`playEventSound` logic:**
1. Load `sounds` settings via `getSetting('sounds')`.
2. If `!sounds.enabled` → return.
3. If `!sounds.events[eventKey].enabled` → return.
4. Check cooldown: `now - (lastPlayedAt[eventKey] ?? 0) < 500` → return.
5. Resolve `sounds.events[eventKey].soundId` via `getSoundSrc`.
6. If `src === null` (missing imported file) → fall back to `BUILTIN_DEFAULTS[eventKey]` and resolve again.
7. `const audio = new Audio(src); audio.volume = clamp01(sounds.volume); await audio.play()`.
8. `lastPlayedAt[eventKey] = Date.now()`.
9. Catch `play()` errors → `console.warn` only (avoid toast spam).

Keep a small `activeAudios: Set<HTMLAudioElement>` so `stopAllSounds()` can iterate and `.pause()` them. Remove on `ended` event.

**`previewSound`:** bypasses master-enable, per-event-enable, cooldown. Uses current volume. Used by preview buttons in settings UI.

#### `use-sound-effects.ts`

```typescript
export function useSoundEffects(): void
```

Mounted once at app root (same place `useSystemNotifications` is used — `src/openacp/main.tsx` or its child). On mount, calls `preloadDefaultSounds()` then registers `window` event listeners.

**Trigger mapping** — mirrors `use-system-notifications.ts` (the canonical event dispatcher; see `src/openacp/hooks/use-system-notifications.ts:87-162`):

| Window event | Trigger condition | Calls |
|---|---|---|
| `agent-event` | `detail.event.type === 'usage'` (end-of-turn marker, fires once per turn) | `playEventSound('agentResponse')` |
| `permission-request` | any | `playEventSound('permissionRequest')` |
| `message-failed` | any | `playEventSound('messageFailed')` |
| `mention-notification` | any | `playEventSound('mentionNotification')` |

**Cleanup:** all listeners removed in the effect's return function (React unmount hygiene).

The player reads fresh settings via `getSetting('sounds')` on each call, so no cache invalidation needed on `settings-changed`.

### 6. Settings UI — `settings-sounds.tsx`

Mounted as a new page in the settings dialog. Sidebar nav entry in `settings-dialog.tsx`:

```typescript
// Add to SettingsPage union
| "sounds"

// Add to NAV_GROUPS[0].items (App group, after Notifications)
{ id: "sounds", label: "Sounds", icon: SpeakerHigh }  // from @phosphor-icons/react
```

Render `<SettingsSounds />` when `page === "sounds"`.

Page structure (using existing `SettingCard` + `SettingRow` components):

**Card 1: General**
- Row: "Enable sounds" — master toggle (`sounds.enabled`).
- Row: "Volume" — slider 0–1 (shadcn Slider if present; else a minimal custom slider using existing tokens). Disabled when `!sounds.enabled`.

**Card 2: Sound Library**
- List each Sound (built-in + imported), two visual groups with labels "Built-in" / "Imported".
- Each row: name + source badge + preview button (speaker icon) + delete button (imported only).
- "Import audio…" button at bottom → hidden `<input type="file" accept=".mp3,.wav,.ogg">` → on change, validate + call `importSound` + update settings.
- Validation errors shown inline near the import button (e.g., "File too large (max 5MB)", "Format not supported").

**Card 3: Events**
- 4 rows (one per event key):
  - Label + description (same copy as `settings-notifications.tsx`, plus mention)
  - Enable toggle (`sounds.events[key].enabled`)
  - Sound dropdown (groups: Built-in / Imported) selecting `soundId`
  - Preview button (plays selected sound via `previewSound`)
- All event controls disabled when `!sounds.enabled`.

Settings changes:
1. `setSetting('sounds', next)` (Tauri store autosaves).
2. `window.dispatchEvent(new CustomEvent('settings-changed'))` — same pattern as `settings-notifications.tsx`.

### 7. Data flows

**Event → Sound playback:**
```
SSE / workspace code dispatches window event (e.g., agent-event)
  → use-sound-effects.ts listener
  → playEventSound(eventKey)
    → getSetting('sounds')
    → check master + event enable + cooldown
    → getSoundSrc(soundId, library)
    → new Audio(src); audio.volume = volume; audio.play()
    → cooldown timestamp updated
```

**Import flow:**
```
User clicks "Import audio…" in settings-sounds.tsx
  → <input type=file accept=".mp3,.wav,.ogg"> dialog
  → ext = file.name.split(".").pop()?.toLowerCase()
  → validate current.library.length < 50    (library cap)
  → validate file.size ≤ 5 * 1024 * 1024    (≤5MB)
  → validate ext ∈ {"mp3", "wav", "ogg"}   (strict allowlist; lowercase only)
  → id = crypto.randomUUID()
  → name = sanitize(stripExt(file.name))    (strip dangerous chars, cap 64)
  → arrayBuffer = await file.arrayBuffer()
  → ensure appDataDir/sounds/ exists (mkdir recursive)
  → writeFile("sounds/<id>.<ext>", bytes, { baseDir: AppData })
  → meta = { id, name, ext, importedAt: Date.now() }
  → fresh = await getSetting('sounds')        (atomicity: re-read before write)
  → setSetting('sounds', { ...fresh, library: [...fresh.library, meta] })
  → dispatch 'settings-changed'
  → UI re-reads settings → new sound appears in library + dropdowns
```

**Delete flow:**
```
User clicks delete in Library row → confirm dialog (irreversible)
  → removeFile("sounds/<id>.<ext>", { baseDir: AppData })   (idempotent — ignore not-found)
  → fresh = await getSetting('sounds')
  → library' = fresh.library.filter(s => s.id !== id)
  → revertedEvents: SoundEventKey[] = []
  → for each event where events[key].soundId === `imported:${id}`:
      events'[key] = { ...events[key], soundId: BUILTIN_DEFAULTS[key] }
      revertedEvents.push(key)
  → setSetting('sounds', { ...fresh, library: library', events: events' })
  → dispatch 'settings-changed'
  → if revertedEvents.length > 0:
      toast(`Reverted ${revertedEvents.length} event(s) to default sound`)
```

### 8. Error handling

All errors surface user-visible output per project rule (no silent `catch {}` per `CLAUDE.md`).

| Case | Behavior |
|---|---|
| Import: library size ≥50 | Inline error: "Library full (max 50 sounds) — delete unused sounds first" |
| Import: file >5MB | Inline error: "File too large (max 5MB)" |
| Import: unsupported format | Inline error: "Use MP3, WAV, or OGG" |
| Import: appDataDir write fails | Sonner toast: "Failed to save imported sound" + console error |
| Playback: `soundId` resolves to `null` (file missing) | Fallback to `BUILTIN_DEFAULTS[eventKey]`; on next settings-sounds render, dropdown shows "(missing — using default)" for that soundId and user can re-select |
| Playback: `audio.play()` rejects (autoplay policy, codec, etc.) | `console.warn(err)` only — no toast (avoid spam during rapid events) |
| Delete: remove file fails | Sonner toast: "Failed to delete sound"; library entry still removed (user intent honored; orphaned file is harmless) |

### 9. Concurrency / playback semantics

- **Per-event cooldown 500ms:** if same event fires twice in <500ms, second is skipped.
- **Cross-event overlap:** different events can play simultaneously (e.g., permission + agent-done). Audio mixing is handled by the OS/browser.
- **Focus-agnostic:** unlike visual notifications (suppressed when focused), sound plays regardless of focus. Rationale: sound cues are primarily for when the user is *elsewhere*; suppressing them defeats the purpose. If noisy in foreground, user can toggle `enabled` or individual events.
- **Preloading scope:** only the 4 built-in default sounds are preloaded at app mount via `preloadDefaultSounds()` — eliminates first-play latency for the common case. Imported sounds and non-default built-ins remain lazy-loaded; first-play latency (~50–200ms) is acceptable since those are triggered by user preview, not time-sensitive events.

### 10. Assets & licensing

Copy **5 AAC files** from `_ignore/opencode/packages/ui/src/assets/audio/` to `src/assets/sounds/`:

| Filename | Role |
|---|---|
| `staplebops-01.aac` | agent default |
| `yup-03.aac` | permission default |
| `nope-01.aac` | message-failed default |
| `bip-bop-02.aac` | mention default |
| `alert-01.aac` | alternate option |

Format kept as AAC — Tauri's webview (Chromium-based) plays AAC natively on macOS/Windows/Linux. No transcoding needed.

Opencode is MIT-licensed. Add attribution:

- Create `CREDITS.md` at project root (if absent):
  ```
  ## Sound Effects
  Notification sounds adapted from opencode (MIT License)
  Source: https://github.com/sst/opencode
  Path at time of adaptation: packages/ui/src/assets/audio/*.aac
  ```
- Include the `LICENSE` text of opencode as an appendix (or link to the SPDX identifier) so MIT obligations are met.

### 11. Build sequence

To be detailed in writing-plans, but the commit-level order:

1. Add `SoundSettings` types, defaults, and `AppSettings.sounds` field to `settings-store.ts`. Include `sounds` in `getAllSettings()`.
2. Copy 5 AAC sounds from `_ignore/opencode` to `src/assets/sounds/`. Add `CREDITS.md` attribution.
3. Implement `sound-registry.ts` — `getAllSounds`, `getSoundSrc`, `BUILTIN_DEFAULTS` (skip import/delete for now).
4. Implement `sound-player.ts` — `playEventSound`, `previewSound`, `stopAllSounds`.
5. Implement `use-sound-effects.ts` and mount at app root.
6. **Verify:** trigger each event → correct default sound plays at 0.6 volume.
7. Implement `settings-sounds.tsx` — General + Events cards (no Library UI yet).
8. Add `sounds` nav entry to `settings-dialog.tsx`.
9. **Verify:** toggle master, change volume, switch sound per event, preview per event.
10. Implement `importSound` + `deleteImportedSound` in `sound-registry.ts`.
11. Add Library card (listing + preview + import + delete) to `settings-sounds.tsx`.
12. **Verify end-to-end on macOS (primary dev platform):** import valid file, import oversized (error), import unsupported format (error), import at library cap (error), delete imported while in-use (fallback toast fires), missing-file fallback (manually remove file from disk, trigger event).
13. **Cross-platform AAC verification:** smoke-test built-in sound playback on Windows and Linux builds (at minimum: open app, trigger one event per platform, confirm sound plays). If Linux webview rejects AAC, convert built-ins to MP3 in a follow-up commit (format change only, no code change).
14. Light pass on dark/light theme — all controls use design tokens, no hardcoded colors. Verify in both modes.

## Testing

No React/TS unit test infrastructure in this project — verification is manual, per step in the build sequence above. Each "Verify" checkpoint must pass before proceeding. Dark + light modes verified before commit per `CLAUDE.md`.

## Open questions

None — design approved in brainstorm session 2026-04-16.

## Risks

- **AAC playback on Linux webview (WebKitGTK):** Linux Tauri uses WebKitGTK, which may lack AAC codec support in some distros. Mitigation: cross-platform verification step in build sequence (Step 13); fallback plan is to convert built-ins to MP3 (LAME-encoded) if Linux playback fails. No code change required — same filename, same registry.
- **Autoplay policy rejection:** shouldn't apply in Tauri webview (non-cross-origin, user-initiated), but caught with `console.warn` fallback. Not user-facing.
- **Library growth:** bounded by `max 50 sounds × 5MB = 250MB` worst case in appDataDir. Acceptable. Users get "Library full" error before going further.
- **Concurrent `import.meta.glob` resolution:** built-in sounds are lazy-loaded promises; no race since we `await getSoundSrc` in the player and `preloadDefaultSounds()` warms the cache at mount.
- **Settings atomicity:** documented contract requires import/delete handlers to re-read settings before write. If contract is violated, concurrent toggle-during-import could lose the import. Low likelihood (user can't toggle settings while the file picker is modal), but called out explicitly.
