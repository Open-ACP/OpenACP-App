import React from "react"
import type { DemoEntry } from "../registry"

export function ComponentPage({ entry }: { entry: DemoEntry }) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-medium text-foreground mb-1">{entry.name}</h1>
      <p className="text-base font-normal text-muted-foreground mb-6">{entry.description}</p>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-fg-weak uppercase tracking-wider mb-3">Preview</h2>
        <div className="rounded-lg border border-border-weak p-6 bg-card">
          {entry.render()}
        </div>
      </section>

      {entry.code && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-fg-weak uppercase tracking-wider mb-3">Usage</h2>
          <pre className="rounded-lg border border-border-weak bg-background p-4 text-sm font-normal text-fg-weak overflow-x-auto">
            <code>{entry.code}</code>
          </pre>
        </section>
      )}

      {entry.props && entry.props.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-fg-weak uppercase tracking-wider mb-3">Props</h2>
          <div className="rounded-lg border border-border-weak overflow-hidden">
            <table className="w-full text-sm font-normal">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left px-4 py-2 text-fg-weak font-medium">Prop</th>
                  <th className="text-left px-4 py-2 text-fg-weak font-medium">Type</th>
                  <th className="text-left px-4 py-2 text-fg-weak font-medium">Default</th>
                </tr>
              </thead>
              <tbody>
                {entry.props.map((p) => (
                  <tr key={p.name} className="border-t border-border-weak">
                    <td className="px-4 py-2 text-foreground font-mono">{p.name}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono">{p.type}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono">{p.default}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
