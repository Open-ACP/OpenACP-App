import React, { useCallback, useEffect, useRef, useState } from "react"
import { Play, Trash, Upload } from "@phosphor-icons/react"
import { toast } from "sonner"
import { getSetting, setSetting, type SoundSettings, type SoundEventKey } from "../../lib/settings-store"
import {
  BUILTIN_DEFAULTS,
  MAX_LIBRARY_SIZE,
  SoundImportError,
  deleteImportedSoundFile,
  getAllSounds,
  importSound,
  type Sound,
} from "../../lib/sound-registry"
import { invalidateSoundCache, previewSound } from "../../lib/sound-player"
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
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

    // Reset any events using this sound to their defaults
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

      {/* ── Sound Library ──────────────────────────────────────── */}
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
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={settings.library.length >= MAX_LIBRARY_SIZE}
            >
              <Upload size={14} />
              Import…
            </button>
          </div>
        </div>
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
