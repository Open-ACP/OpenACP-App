import React from "react"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"

export function SettingsServer({
  serverUrl,
  connected,
}: {
  serverUrl: string | null
  connected: boolean
}) {
  const statusColor = connected ? "bg-status-success" : "bg-status-error"
  const statusText = connected ? "Connected" : "Disconnected"

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="Connection">
        <SettingRow label="Status" description="Current server connection status">
          <div className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${statusColor}`} />
            <span className="text-sm text-foreground-weak">{statusText}</span>
          </div>
        </SettingRow>
        <SettingRow label="Server address" description="The address of the connected OpenACP server">
          <code className="text-sm text-foreground-weak font-mono bg-secondary px-2 py-1 rounded-md">
            {serverUrl ?? "N/A"}
          </code>
        </SettingRow>
      </SettingCard>
    </div>
  )
}
