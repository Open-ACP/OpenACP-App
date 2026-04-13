import React from "react"
import { X, ArrowLineDown } from "@phosphor-icons/react"
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
    <div className="pointer-events-auto w-[360px] rounded-lg border border-border bg-card shadow-lg relative overflow-hidden">
      <div className="flex gap-3 px-4 pt-3.5 pb-3">
        <div className="shrink-0 mt-0.5 text-muted-foreground">
          <ArrowLineDown size={20} weight="duotone" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between">
            <p className="text-base font-medium text-foreground">Update available</p>
            {!downloading && (
              <button
                onClick={onDismiss}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground -mt-0.5 -mr-0.5 p-0.5"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
            {error
              ? error
              : downloading
                ? `Downloading v${version}... ${progress}%`
                : `A new version of OpenACP (${version}) is now available to install.`}
          </p>
        </div>
      </div>

      {!downloading && (
        <div className="flex items-center gap-2 px-4 pb-3.5 pl-[44px]">
          <Button variant="default" size="sm" onClick={onUpdate}>
            {error ? "Retry" : "Install and restart"}
          </Button>
          <Button variant="outline" size="sm" onClick={onDismiss}>
            Not yet
          </Button>
        </div>
      )}

      {downloading && (
        <div className="h-0.5 bg-secondary">
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%`, background: 'var(--color-success)' }}
          />
        </div>
      )}
    </div>
  )
}
