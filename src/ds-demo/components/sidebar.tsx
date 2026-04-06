import React from "react"
import { Moon, Sun } from "@phosphor-icons/react"
import type { DemoEntry } from "../registry"

const GROUP_ORDER = ["General", "Overlay", "Navigation", "Data Display", "Tokens"]

export function Sidebar(props: {
  entries: DemoEntry[]
  activeId: string
  onSelect: (id: string) => void
  theme: "light" | "dark"
  onToggleTheme: () => void
}) {
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: props.entries.filter((e) => e.group === group),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="w-[240px] shrink-0 border-r border-border-weak bg-card flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-weak">
        <span className="text-md-medium text-foreground">Design System</span>
        <button
          onClick={props.onToggleTheme}
          className="size-7 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground"
        >
          {props.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {groups.map(({ group, items }) => (
          <div key={group} className="mb-2">
            <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {group}
            </div>
            {items.map((entry) => (
              <button
                key={entry.id}
                className={`w-full text-left px-4 py-1.5 text-sm-regular transition-colors ${
                  entry.id === props.activeId
                    ? "bg-accent text-foreground"
                    : "text-foreground-weak hover:bg-accent/50 hover:text-foreground"
                }`}
                onClick={() => props.onSelect(entry.id)}
              >
                {entry.name}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </div>
  )
}
