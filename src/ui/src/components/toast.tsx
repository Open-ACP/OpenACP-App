/**
 * Minimal React-compatible toast replacement.
 * The old implementation used @kobalte/core/toast (SolidJS).
 * This is a simple console-based stub until a proper React toast library is integrated.
 */

export type ToastVariant = "default" | "success" | "error" | "loading"

export interface ToastOptions {
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
  persistent?: boolean
}

export function showToast(options: ToastOptions | string) {
  const opts = typeof options === "string" ? { description: options } : options
  const level = opts.variant === "error" ? "error" : opts.variant === "success" ? "info" : "log"
  const msg = [opts.title, opts.description].filter(Boolean).join(": ")
  console[level]("[toast]", msg)
}

/**
 * Placeholder Toast component namespace for backward compatibility.
 */
export const Toast = {
  Region: () => null,
}
