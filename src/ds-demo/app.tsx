import React, { useState, useEffect } from "react"
import { Sidebar } from "./components/sidebar"
import { ComponentPage } from "./components/component-page"
import { TokenPage } from "./components/token-page"
import { registry, type DemoEntry } from "./registry"

export function DemoApp() {
  const [activeId, setActiveId] = useState(registry[0].id)
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("ds-demo-theme") as "light" | "dark") || "dark"
  })

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("ds-demo-theme", theme)
  }, [theme])

  const active = registry.find((e) => e.id === activeId) || registry[0]

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      <Sidebar
        entries={registry}
        activeId={activeId}
        onSelect={setActiveId}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      />
      <main className="flex-1 overflow-y-auto p-8">
        {active.type === "token" ? (
          <TokenPage entry={active} />
        ) : (
          <ComponentPage entry={active} />
        )}
      </main>
    </div>
  )
}
