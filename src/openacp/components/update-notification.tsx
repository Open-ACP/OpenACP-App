import React from "react"

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
    <div className="fixed top-4 right-4 z-[9999] w-80 rounded-lg border border-border-base bg-surface-raised-base shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2">
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          {error ? (
            <>
              <div className="text-13-medium text-text-strong">Update failed</div>
              <div className="text-12-regular text-text-weak mt-0.5 truncate">{error}</div>
            </>
          ) : downloading ? (
            <>
              <div className="text-13-medium text-text-strong">Downloading update...</div>
              <div className="text-12-regular text-text-weak mt-0.5">v{version} — {progress}%</div>
            </>
          ) : (
            <>
              <div className="text-13-medium text-text-strong">Update available</div>
              <div className="text-12-regular text-text-weak mt-0.5">v{version} is ready to install</div>
            </>
          )}
        </div>

        {!downloading && (
          <button
            onClick={onDismiss}
            className="shrink-0 p-1 rounded hover:bg-surface-raised-hover text-text-weaker hover:text-text-weak transition-colors"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {downloading && (
        <div className="h-1 bg-surface-raised-hover">
          <div
            className="h-full bg-accent-base transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {!downloading && !error && (
        <div className="flex items-center gap-2 px-3 pb-3">
          <button
            onClick={onUpdate}
            className="px-3 py-1.5 rounded-md text-12-medium bg-accent-base text-white hover:bg-accent-hover transition-colors"
          >
            Update now
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-md text-12-medium text-text-weak hover:text-text-base hover:bg-surface-raised-hover transition-colors"
          >
            Later
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 pb-3">
          <button
            onClick={onUpdate}
            className="px-3 py-1.5 rounded-md text-12-medium bg-accent-base text-white hover:bg-accent-hover transition-colors"
          >
            Retry
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-md text-12-medium text-text-weak hover:text-text-base hover:bg-surface-raised-hover transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
