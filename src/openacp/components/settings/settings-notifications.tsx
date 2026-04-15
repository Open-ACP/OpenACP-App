import React, { useEffect, useState } from "react"
import { getSetting, setSetting, type NotificationSettings } from "../../lib/settings-store"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"

const DEFAULTS: NotificationSettings = {
  enabled: true,
  agentResponse: true,
  permissionRequest: true,
  messageFailed: true,
}

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

export function SettingsNotifications() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS)

  useEffect(() => {
    void getSetting("notifications").then((v) => setSettings({ ...DEFAULTS, ...v }))
  }, [])

  async function update(patch: Partial<NotificationSettings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    await setSetting("notifications", next)
    window.dispatchEvent(new CustomEvent("settings-changed"))
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="System Notifications">
        <SettingRow label="Enable notifications" description="Show native OS notifications for background events">
          <Toggle checked={settings.enabled} onChange={(v) => void update({ enabled: v })} />
        </SettingRow>
      </SettingCard>

      <SettingCard title="Events">
        <SettingRow label="Agent response complete" description="Notify when the agent finishes responding while the app is in the background">
          <Toggle
            checked={settings.agentResponse}
            onChange={(v) => void update({ agentResponse: v })}
            disabled={!settings.enabled}
          />
        </SettingRow>
        <SettingRow label="Permission request" description="Notify when the agent needs approval to use a tool">
          <Toggle
            checked={settings.permissionRequest}
            onChange={(v) => void update({ permissionRequest: v })}
            disabled={!settings.enabled}
          />
        </SettingRow>
        <SettingRow label="Message failed" description="Notify when a message fails to process">
          <Toggle
            checked={settings.messageFailed}
            onChange={(v) => void update({ messageFailed: v })}
            disabled={!settings.enabled}
          />
        </SettingRow>
      </SettingCard>
    </div>
  )
}
