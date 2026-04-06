type ToastVariant = "default" | "success" | "error"

interface ToastEntry {
  id: number
  description: string
  variant: ToastVariant
}

type Listener = (toasts: ToastEntry[]) => void

let nextId = 0
let toasts: ToastEntry[] = []
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach((fn) => fn([...toasts]))
}

export function showToast(opts: { description: string; variant?: string }) {
  const id = nextId++
  const entry: ToastEntry = {
    id,
    description: opts.description,
    variant: (opts.variant as ToastVariant) || "default",
  }
  toasts = [...toasts, entry]
  notify()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    notify()
  }, 3000)
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  notify()
}

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getToasts(): ToastEntry[] {
  return toasts
}

export type { ToastEntry, ToastVariant }
