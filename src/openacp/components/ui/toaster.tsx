import React, { useState, useEffect } from "react"
import { subscribeToasts, dismissToast, type ToastEntry } from "../../lib/toast"

const variantStyles: Record<string, string> = {
  default: "bg-popover border-border-weak text-foreground",
  success: "bg-popover border-border-weak text-foreground",
  error: "bg-popover border-border-weak text-foreground",
}

const dotColor: Record<string, string> = {
  success: "var(--surface-success-strong)",
  error: "var(--surface-critical-strong)",
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastEntry[]>([])

  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-lg text-sm animate-in slide-in-from-bottom-2 fade-in duration-200 ${variantStyles[t.variant] || variantStyles.default}`}
          onClick={() => dismissToast(t.id)}
          role="status"
        >
          {dotColor[t.variant] && (
            <div className="size-2 rounded-full shrink-0" style={{ background: dotColor[t.variant] }} />
          )}
          <span>{t.description}</span>
        </div>
      ))}
    </div>
  )
}
