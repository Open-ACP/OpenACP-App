import React, { useEffect, useState } from "react"
import { getSetting, setSetting, applyTheme, applyFontSize, type AppSettings } from "../../lib/settings-store"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs"

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
          <Tabs value={theme} onValueChange={(v) => void handleThemeChange(v as AppSettings["theme"])}>
            <TabsList>
              <TabsTrigger value="light">Light</TabsTrigger>
              <TabsTrigger value="dark">Dark</TabsTrigger>
              <TabsTrigger value="system">System</TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingRow>
      </SettingCard>
      <SettingCard title="Typography">
        <SettingRow label="Font size" description="Adjust the interface font size">
          <Tabs value={fontSize} onValueChange={(v) => void handleFontSizeChange(v as AppSettings["fontSize"])}>
            <TabsList>
              <TabsTrigger value="small">Small</TabsTrigger>
              <TabsTrigger value="medium">Medium</TabsTrigger>
              <TabsTrigger value="large">Large</TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingRow>
      </SettingCard>
    </div>
  )
}
