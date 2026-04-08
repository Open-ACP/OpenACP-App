import React from "react"
import { X, ArrowUp } from "@phosphor-icons/react"

interface UpdateNotificationProps {
  version: string
  downloading: boolean
  progress: number
  error: string | null
  onUpdate: () => void
  onDismiss: () => void
}

export function UpdateNotification({
  version,
  downloading,
  progress,
  error,
  onUpdate,
  onDismiss,
}: UpdateNotificationProps) {
  return (
    <div className="pointer-events-auto flex w-[340px] items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
      <div className="shrink-0">
        <ArrowUp size={18} />
      </div>
      <div className="min-w-0 flex-1">
        {error ? (
          <>
            <p className="text-sm-medium text-text-strong">Update failed</p>
            <p className="text-sm-regular text-text-weak truncate">{error}</p>
          </>
        ) : downloading ? (
          <>
            <p className="text-sm-medium text-text-strong">Downloading v{version}...</p>
            <p className="text-sm-regular text-text-weak">{progress}%</p>
          </>
        ) : (
          <>
            <p className="text-sm-medium text-text-strong">OpenACP v{version}</p>
            <p className="text-sm-regular text-text-weak">A new version is available</p>
          </>
        )}
      </div>

      {!downloading && (
        <button
          onClick={onUpdate}
          className="text-sm-medium shrink-0 rounded-md border border-border-weak px-3 py-1 text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          {error ? "Retry" : "Update"}
        </button>
      )}

      {!downloading && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-text-weak transition-colors hover:text-text-strong"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      )}

      {downloading && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary rounded-b-lg overflow-hidden">
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%`, background: "var(--surface-success-strong)" }}
          />
        </div>
      )}
    </div>
  )
}
