import React, { useEffect, useState } from "react"
import { getSetting, setSetting, applyTheme, applyFontSize, type AppSettings } from "../../lib/settings-store"
import { useToolDisplay, TOOL_EXPAND_PRESETS, detectPreset } from "../../context/tool-display"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs"
import { Switch } from "../ui/switch"

const TOOL_KIND_LABELS: Record<string, string> = {
  read: "Read",
  search: "Search",
  edit: "Edit",
  write: "Write",
  execute: "Bash",
  agent: "Agent",
  web: "Web",
  skill: "Skill",
  other: "Other",
}

const TOOL_KINDS = Object.keys(TOOL_KIND_LABELS)

export function SettingsAppearance() {
  const [theme, setTheme] = useState<AppSettings["theme"]>("dark")
  const [fontSize, setFontSize] = useState<AppSettings["fontSize"]>("medium")
  const { toolAutoExpand, updateToolAutoExpand } = useToolDisplay()

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

  async function handlePresetChange(preset: "all" | "important" | "none") {
    await updateToolAutoExpand(TOOL_EXPAND_PRESETS[preset])
  }

  async function handleKindToggle(kind: string, value: boolean) {
    await updateToolAutoExpand({ ...toolAutoExpand, [kind]: value })
  }

  const activePreset = detectPreset(toolAutoExpand)

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

      <SettingCard title="Tool Calls">
        <SettingRow
          label="Auto-expand detail"
          description="Controls which tool calls show IN/OUT details by default"
        >
          <Tabs
            value={activePreset ?? ""}
            onValueChange={(v) => void handlePresetChange(v as "all" | "important" | "none")}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="important">Important</TabsTrigger>
              <TabsTrigger value="none">None</TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingRow>
        {TOOL_KINDS.map((kind) => (
          <SettingRow key={kind} label={TOOL_KIND_LABELS[kind]}>
            <Switch
              checked={toolAutoExpand[kind] ?? false}
              onCheckedChange={(v) => void handleKindToggle(kind, v)}
            />
          </SettingRow>
        ))}
      </SettingCard>
    </div>
  )
}
