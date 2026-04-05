import React, { useState } from "react"
import { ArrowLeft } from "@phosphor-icons/react"
import { SettingsGeneral } from "./settings-general"
import { SettingsAppearance } from "./settings-appearance"
import { SettingsServer } from "./settings-server"
import { SettingsAgents } from "./settings-agents"
import { SettingsAbout } from "./settings-about"

export type SettingsPage = "general" | "agents" | "appearance" | "server" | "about"

const NAV_ITEMS: { id: SettingsPage; label: string }[] = [
  { id: "general", label: "General" },
  { id: "agents", label: "Agents" },
  { id: "appearance", label: "Appearance" },
  { id: "server", label: "Server" },
  { id: "about", label: "About" },
]

export function SettingsPanel(props: {
  onClose: () => void
  workspacePath: string
  serverUrl: string | null
  serverConnected: boolean
  initialPage?: SettingsPage
}) {
  const [page, setPage] = useState<SettingsPage>(props.initialPage || "general")

  return (
    <div className="flex-1 flex min-h-0 h-full bg-background-stronger">
      {/* Settings sidebar nav */}
      <div className="w-[200px] shrink-0 border-r border-border-weaker-base bg-background-base flex flex-col">
        <div className="shrink-0 px-3 pt-4 pb-2 flex items-center gap-2">
          <button
            className="size-7 rounded-md flex items-center justify-center hover:bg-surface-raised-base-hover transition-colors"
            onClick={props.onClose}
            title="Back"
          >
            <ArrowLeft size={16} className="text-icon-base" />
          </button>
          <span className="text-14-medium text-text-strong">Settings</span>
        </div>

        <nav className="flex flex-col gap-0.5 px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`w-full text-left px-3 py-1.5 rounded-md text-13-regular transition-colors ${
                page === item.id
                  ? "bg-surface-raised-base text-text-strong"
                  : "text-text-base hover:bg-surface-raised-base-hover"
              }`}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[560px] mx-auto px-6 py-6">
          {page === "general" && <SettingsGeneral workspacePath={props.workspacePath} />}
          {page === "agents" && <SettingsAgents workspacePath={props.workspacePath} />}
          {page === "appearance" && <SettingsAppearance />}
          {page === "server" && (
            <SettingsServer serverUrl={props.serverUrl} connected={props.serverConnected} />
          )}
          {page === "about" && <SettingsAbout />}
        </div>
      </div>
    </div>
  )
}
