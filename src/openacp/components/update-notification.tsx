import React from "react"
import { X, ArrowUp } from "@phosphor-icons/react"
import { Button } from "./ui/button"

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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[360px] rounded-lg border border-border-weak bg-card shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-accent shrink-0">
          <ArrowUp size={16} className="text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          {error ? (
            <>
              <div className="text-sm font-medium text-foreground">Update failed</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{error}</div>
            </>
          ) : downloading ? (
            <>
              <div className="text-sm font-medium text-foreground">Downloading v{version}...</div>
              <div className="text-xs text-muted-foreground mt-0.5">{progress}%</div>
            </>
          ) : (
            <>
              <div className="text-sm font-medium text-foreground">OpenACP v{version}</div>
              <div className="text-xs text-muted-foreground mt-0.5">A new version is available</div>
            </>
          )}
        </div>

        {!downloading && !error && (
          <Button variant="outline" size="sm" className="shrink-0 h-7 text-xs" onClick={onUpdate}>
            Update
          </Button>
        )}

        {error && (
          <Button variant="outline" size="sm" className="shrink-0 h-7 text-xs" onClick={onUpdate}>
            Retry
          </Button>
        )}

        {!downloading && (
          <button
            onClick={onDismiss}
            className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {downloading && (
        <div className="h-1 bg-secondary">
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%`, background: "var(--surface-success-strong)" }}
          />
        </div>
      )}
    </div>
  )
}
