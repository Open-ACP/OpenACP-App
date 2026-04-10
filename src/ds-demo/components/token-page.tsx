import React from "react"
import type { DemoEntry } from "../registry"

export function TokenPage({ entry }: { entry: DemoEntry }) {
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-medium text-foreground mb-1">{entry.name}</h1>
      <p className="text-base font-normal text-muted-foreground mb-6">{entry.description}</p>

      <div className="rounded-lg border border-border-weak p-6 bg-card">
        {entry.render()}
      </div>
    </div>
  )
}
