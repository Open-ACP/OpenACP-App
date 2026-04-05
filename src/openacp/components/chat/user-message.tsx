import React, { memo, useMemo, useState } from "react"
import { File as FileIcon } from "@phosphor-icons/react"
import { Button } from "../ui/button"
import type { Message, TextBlock, TextPart } from "../../types"
import { isImageMime } from "../../lib/file-utils"

function formatTime(timestamp: number): string {
  return new Date(timestamp)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase()
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <Button variant="ghost" size="icon-xs" className="oac-copy-btn" onClick={handleCopy} title={copied ? "Copied" : "Copy"}>
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" strokeLinecap="square"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z" stroke="currentColor" strokeLinecap="round"/>
        </svg>
      )}
    </Button>
  )
}

function getUserText(msg: Message): string {
  if (msg.blocks?.length > 0) {
    return msg.blocks
      .filter((b): b is TextBlock => b.type === "text")
      .map((b) => b.content)
      .join("\n")
  }
  return msg.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.content)
    .join("\n")
}

function adapterLabel(id: string): string {
  const map: Record<string, string> = { telegram: "Telegram", discord: "Discord", slack: "Slack" }
  return map[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

export const UserMessage = memo(function UserMessage({ message }: { message: Message }) {
  const timeStr = useMemo(() => formatTime(message.createdAt), [message.createdAt])
  const text = useMemo(() => getUserText(message), [message])

  return (
    <div
      data-component="oac-user-message"
      className="rounded-md border border-border shadow-sm"
      style={{ padding: "8px 12px", backgroundColor: "var(--surface-raised-stronger-non-alpha, var(--card))" }}
    >
      {message.sourceAdapterId ? (
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-2xs-regular text-muted-foreground select-none">via {adapterLabel(message.sourceAdapterId)}</span>
        </div>
      ) : null}
      {message.attachments?.length ? (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {message.attachments.map(att => (
            <div key={att.id} className="flex items-center gap-1.5 h-7 pl-1.5 pr-2 rounded-md border border-border-weak bg-muted">
              {isImageMime(att.mimeType) && att.dataUrl ? (
                <img src={att.dataUrl} alt="" className="size-4 rounded-sm object-cover flex-shrink-0" />
              ) : (
                <FileIcon size={14} className="text-foreground-weaker flex-shrink-0" />
              )}
              <span className="text-[12px] text-foreground-weak truncate max-w-[200px] leading-none">{att.fileName}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="text-md-regular text-foreground whitespace-pre-wrap break-words leading-relaxed">
        {text}
      </div>
      <div className="flex items-center gap-2 mt-1" style={{ justifyContent: "flex-end" }}>
        <span className="text-sm-regular text-muted-foreground select-none">{timeStr}</span>
        <CopyButton text={text} />
      </div>
    </div>
  )
})
