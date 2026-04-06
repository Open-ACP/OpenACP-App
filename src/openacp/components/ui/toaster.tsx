import { Toaster as Sonner } from "sonner"

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        className: "!bg-popover !text-foreground !border-border-weak !shadow-lg",
      }}
    />
  )
}
