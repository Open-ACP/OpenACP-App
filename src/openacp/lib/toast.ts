/**
 * Minimal toast notification utility.
 * TODO: Replace with a proper toast system (e.g. react-hot-toast or sonner).
 */
interface ToastOptions {
  description: string
  variant?: "error" | "success" | "info"
}

export function showToast(options: ToastOptions) {
  if (options.variant === "error") {
    console.error("[toast]", options.description)
  } else {
    console.log("[toast]", options.description)
  }
}
