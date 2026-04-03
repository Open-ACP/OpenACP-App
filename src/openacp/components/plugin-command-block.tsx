import { createSignal, onCleanup } from "solid-js"

export function CommandBlock(props: { label: string; command: string }) {
  const [copied, setCopied] = createSignal(false)
  let resetTimer: ReturnType<typeof setTimeout> | null = null

  onCleanup(() => { if (resetTimer) clearTimeout(resetTimer) })

  async function copy() {
    await navigator.clipboard.writeText(props.command)
    setCopied(true)
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class="flex flex-col gap-1">
      <span class="text-12-regular text-text-weak">{props.label}</span>
      <div class="flex items-center gap-2 bg-background-stronger rounded px-3 py-2">
        <code class="text-12-regular text-text-strong flex-1 font-mono">{props.command}</code>
        <button
          class="text-12-regular text-text-weak hover:text-text-base transition-colors shrink-0"
          onClick={copy}
        >
          {copied() ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  )
}
