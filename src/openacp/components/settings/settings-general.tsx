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
  const [browserPanel, setBrowserPanel] = useState(false)
  const [browserLastMode, setBrowserLastMode] = useState<"docked" | "floating" | "pip">("docked")
  const [browserSearchEngine, setBrowserSearchEngine] = useState<"google" | "duckduckgo" | "bing">("google")

  useEffect(() => {
    void getSetting("language").then(setLanguage)
    void getSetting("devMode").then(setDevMode)
    void getSetting("browserPanel").then(setBrowserPanel)
    void getSetting("browserLastMode").then(setBrowserLastMode)
    void getSetting("browserSearchEngine").then(setBrowserSearchEngine)
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

      <SettingCard title="Browser (Experimental)">
        <SettingRow label="In-app browser" description="Open links in a built-in browser panel instead of the system browser">
          <button
            type="button"
            role="switch"
            aria-checked={browserPanel}
            onClick={async () => {
              const next = !browserPanel
              setBrowserPanel(next)
              await setSetting("browserPanel", next)
              window.dispatchEvent(new CustomEvent("browser-panel-changed", { detail: next }))
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${browserPanel ? "bg-primary" : "bg-secondary"}`}
          >
            <span className={`pointer-events-none inline-block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${browserPanel ? "translate-x-4" : "translate-x-0"}`} />
          </button>
        </SettingRow>
        <SettingRow label="Default mode" description="Which layout the in-app browser opens in by default">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground-weak focus:outline-none focus:ring-1 focus:ring-border-selected min-w-[160px] disabled:opacity-50 disabled:cursor-not-allowed"
            value={browserLastMode}
            disabled={!browserPanel}
            onChange={async (e) => {
              const next = e.target.value as "docked" | "floating" | "pip"
              setBrowserLastMode(next)
              await setSetting("browserLastMode", next)
            }}
          >
            <option value="docked">Docked</option>
            <option value="floating">Picture in Picture</option>
            <option value="pip">Pop-out</option>
          </select>
        </SettingRow>
        <SettingRow label="Search engine" description="Default search engine for the in-app browser address bar">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground-weak focus:outline-none focus:ring-1 focus:ring-border-selected min-w-[160px] disabled:opacity-50 disabled:cursor-not-allowed"
            value={browserSearchEngine}
            disabled={!browserPanel}
            onChange={async (e) => {
              const next = e.target.value as "google" | "duckduckgo" | "bing"
              setBrowserSearchEngine(next)
              await setSetting("browserSearchEngine", next)
            }}
          >
            <option value="google">Google</option>
            <option value="duckduckgo">DuckDuckGo</option>
            <option value="bing">Bing</option>
          </select>
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
