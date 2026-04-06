import { toast } from "sonner"

export function showToast(opts: { description: string; variant?: string }) {
  switch (opts.variant) {
    case "success":
      toast.success(opts.description)
      break
    case "error":
      toast.error(opts.description)
      break
    default:
      toast(opts.description)
  }
}
