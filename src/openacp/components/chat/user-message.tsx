import React, { memo, useMemo, useState } from "react";
import { File as FileIcon, CopySimple, Check } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import type { Message, TextBlock, TextPart } from "../../types";
import { isImageMime } from "../../lib/file-utils";

function formatTime(timestamp: number): string {
  return new Date(timestamp)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={handleCopy}
      title={copied ? "Copied" : "Copy"}
    >
      {copied ? <Check /> : <CopySimple />}
    </Button>
  );
}

function getUserText(msg: Message): string {
  if (msg.blocks?.length > 0) {
    return msg.blocks
      .filter((b): b is TextBlock => b.type === "text")
      .map((b) => b.content)
      .join("\n");
  }
  return msg.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.content)
    .join("\n");
}

function adapterLabel(id: string): string {
  const map: Record<string, string> = {
    telegram: "Telegram",
    discord: "Discord",
    slack: "Slack",
  };
  return map[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export const UserMessage = memo(function UserMessage({
  message,
}: {
  message: Message;
}) {
  const timeStr = useMemo(
    () => formatTime(message.createdAt),
    [message.createdAt],
  );
  const text = useMemo(() => getUserText(message), [message]);

  return (
    <div
      data-component="oac-user-message"
      className="group flex flex-col items-end max-w-[85%] ml-auto w-fit"
    >
      <div className="rounded-xl bg-bg-weak border border-border-weakest py-2 px-3">
        {message.sourceAdapterId ? (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-2xs font-normal text-fg-weaker select-none">
              via {adapterLabel(message.sourceAdapterId)}
            </span>
          </div>
        ) : null}
        {message.attachments?.length ? (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {message.attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-1.5 h-7 pl-1.5 pr-2 rounded-md border border-border-weak bg-bg-weak"
              >
                {isImageMime(att.mimeType) && att.dataUrl ? (
                  <img
                    src={att.dataUrl}
                    alt=""
                    className="size-4 rounded-sm object-cover flex-shrink-0"
                  />
                ) : (
                  <FileIcon className="size-3.5 text-fg-weakest flex-shrink-0" />
                )}
                <span className="text-xs text-fg-weak truncate max-w-50 leading-none">
                  {att.fileName}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="text-sm font-normal text-fg-base whitespace-pre-wrap break-words leading-relaxed">
          {text}
        </div>
      </div>
      <div className="flex items-center gap-1 mt-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <span className="text-2xs font-normal text-fg-weaker select-none">
          {timeStr}
        </span>
        <CopyButton text={text} />
      </div>
    </div>
  );
});
