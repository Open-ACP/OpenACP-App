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
