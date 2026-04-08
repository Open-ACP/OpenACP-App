import React, { useEffect, useState } from "react"
import { getSetting, setSetting } from "../../lib/settings-store"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  zh: "Chinese (Simplified)",
  zht: "Chinese (Traditional)",
  ko: "Korean",
  de: "German",
  es: "Spanish",
  fr: "French",
  da: "Danish",
  ja: "Japanese",
  pl: "Polish",
  ru: "Russian",
  ar: "Arabic",
  no: "Norwegian",
  br: "Portuguese (Brazil)",
  bs: "Bosnian",
}

export function SettingsGeneral({ workspacePath }: { workspacePath: string }) {
  const [language, setLanguage] = useState("en")
  const [devMode, setDevMode] = useState(false)

  useEffect(() => {
    void getSetting("language").then(setLanguage)
    void getSetting("devMode").then(setDevMode)
  }, [])

  async function handleLanguageChange(value: string) {
    setLanguage(value)
    await setSetting("language", value)
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="General">
        <SettingRow label="Language" description="Choose the display language for the app">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground-weak focus:outline-none focus:ring-1 focus:ring-border-selected min-w-[160px]"
            value={language}
            onChange={(e) => void handleLanguageChange(e.target.value)}
          >
            {Object.entries(LOCALE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Workspace folder" description="Current workspace data location">
          <code className="text-sm text-foreground-weak font-mono bg-secondary px-2 py-1 rounded-md max-w-[200px] truncate block">
            {workspacePath || "No workspace selected"}
          </code>
        </SettingRow>
      </SettingCard>

      <SettingCard title="Developer">
        <SettingRow label="Developer mode" description="Enable right-click inspect element and DevTools access">
          <button
            type="button"
            role="switch"
            aria-checked={devMode}
            onClick={async () => {
              const next = !devMode
              setDevMode(next)
              await setSetting("devMode", next)
              // Notify app to apply devMode
              window.dispatchEvent(new CustomEvent("devmode-changed", { detail: next }))
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${devMode ? "bg-primary" : "bg-secondary"}`}
          >
            <span className={`pointer-events-none inline-block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${devMode ? "translate-x-4" : "translate-x-0"}`} />
          </button>
        </SettingRow>
      </SettingCard>
    </div>
  )
}
