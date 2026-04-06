import React, { useState, useRef, useEffect } from "react"

export function CommandBlock({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { return () => { if (timerRef.current) clearTimeout(timerRef.current) } }, [])

  async function copy() {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm-regular text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 bg-card rounded px-3 py-2">
        <code className="text-sm-regular text-foreground flex-1 font-mono">{command}</code>
        <button className="text-sm-regular text-muted-foreground hover:text-foreground-weak transition-colors shrink-0" onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
      </div>
    </div>
  )
}
