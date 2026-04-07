import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Plus,
  Command,
  X,
  File as FileIcon,
  Image as ImageIcon,
} from "@phosphor-icons/react";
import { DockShellForm, DockTray } from "./ui/dock-surface";
import { useChat } from "../context/chat";
import { useSessions } from "../context/sessions";
import { AgentSelector } from "./agent-selector";
import { BranchIndicator } from "./branch-indicator";
import { CommandPalette } from "./command-palette";
import { ConfigSelector } from "./config-selector";
import { Spinner } from "./ui/spinner";
import { showToast } from "../lib/toast";
import type { FileAttachment, UsageInfo } from "../types";
import {
  validateFileMime,
  fileToDataUrl,
  isImageMime,
  MAX_FILE_SIZE,
  MAX_ATTACHMENTS,
  ACCEPTED_FILE_TYPES,
} from "../lib/file-utils";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function ContextBadge({ usage }: { usage: UsageInfo }) {
  const used = usage.tokensUsed ?? 0
  const ctx = usage.contextSize ?? 0
  const pct = ctx > 0 ? ((used / ctx) * 100) : 0
  const color = pct > 80 ? "var(--destructive)" : pct > 50 ? "var(--warning, #e5a50a)" : "var(--muted-foreground)"

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-default mr-2">
            <span style={{ fontSize: 11, color, fontWeight: 500 }}>{pct.toFixed(1)}%</span>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <circle cx="9" cy="9" r="7" fill="none" stroke="var(--border-weak)" strokeWidth="2" />
              <circle cx="9" cy="9" r="7" fill="none" stroke={color} strokeWidth="2"
                strokeDasharray={`${(pct / 100) * 44} 44`}
                strokeLinecap="round"
                transform="rotate(-90 9 9)"
              />
            </svg>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8} className="bg-card border border-border-weak text-foreground px-3 py-2 min-w-[160px]">
          <div className="flex justify-between gap-4 mb-1">
            <span style={{ color, fontWeight: 600 }}>{pct.toFixed(1)}%</span>
            <span className="text-foreground-weak font-mono">{formatK(used)} / {formatK(ctx)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Text</span>
            <span className="text-foreground-weak font-mono">{formatK(used)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Remaining</span>
            <span className="text-foreground-weak font-mono">{formatK(Math.max(0, ctx - used))}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

let attachIdCounter = 0;
function nextAttachId() {
  return `att-${++attachIdCounter}`;
}

export function Composer() {
  const chat = useChat();
  const sessions = useSessions();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [agent, setAgent] = useState<string>();
  const [isBypass, setIsBypass] = useState(false);

  // Get latest context usage from last assistant message
  const contextUsage = useMemo(() => {
    const messages = chat.messages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.usage?.contextSize) {
        return msg.usage;
      }
    }
    return null;
  }, [chat.messages()]);

  // Sync agent from active session (e.g. on reload or session switch)
  useEffect(() => {
    const sessionId = chat.activeSession();
    if (!sessionId) return;
    const session = sessions.list().find((s) => s.id === sessionId);
    if (session?.agent && session.agent !== agent) {
      setAgent(session.agent);
    }
  }, [chat.activeSession(), sessions.list()]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteFilter, setPaletteFilter] = useState<string | undefined>();
  const [configVersion, setConfigVersion] = useState(0);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [dragging, setDragging] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const space = "52px";

  // ── Attachment helpers ──────────────────────────────────────────────────

  const addFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        if (attachments.length >= MAX_ATTACHMENTS) {
          showToast({
            title: "Attachment limit",
            description: `Maximum ${MAX_ATTACHMENTS} files`,
          });
          break;
        }
        if (file.size > MAX_FILE_SIZE) {
          showToast({
            title: "File too large",
            description: `${file.name} exceeds 10 MB limit`,
          });
          continue;
        }
        const mime = await validateFileMime(file);
        if (!mime) {
          showToast({
            title: "Unsupported file",
            description: `${file.name} is not a supported format`,
          });
          continue;
        }
        const dataUrl = await fileToDataUrl(file, mime);
        if (!dataUrl) continue;

        const att: FileAttachment = {
          id: nextAttachId(),
          fileName: file.name,
          mimeType: mime,
          dataUrl,
          size: file.size,
        };
        setAttachments((prev) => [...prev, att]);
      }
    },
    [attachments.length],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ── Drag & drop ────────────────────────────────────────────────────────

  useEffect(() => {
    function onDragEnter(e: DragEvent) {
      e.preventDefault();
      dragCounter.current++;
      if (e.dataTransfer?.types.includes("Files")) setDragging(true);
    }
    function onDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDragging(false);
      }
    }
    function onDragOver(e: DragEvent) {
      e.preventDefault();
    }
    function onDrop(e: DragEvent) {
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
      const files = e.dataTransfer?.files;
      if (files?.length) void addFiles(Array.from(files));
    }

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  // ── Clipboard paste ────────────────────────────────────────────────────

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addFiles]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setPaletteFilter(undefined);
        setPaletteOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (paletteOpen) return;
      const value = text.trim();
      if (!value && !attachments.length) return;
      setText("");
      if (editorRef.current) editorRef.current.textContent = "";
      const atts = attachments.length ? [...attachments] : undefined;
      setAttachments([]);
      setSending(true);
      try {
        await chat.sendPrompt(value || "See attached files", atts);
      } finally {
        setSending(false);
      }
    },
    [text, paletteOpen, chat, attachments],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && paletteOpen) {
        setPaletteOpen(false);
        e.preventDefault();
        return;
      }
      if (e.key === "Enter" && e.shiftKey) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (e.repeat) return;
        void handleSubmit();
      }
    },
    [paletteOpen, handleSubmit],
  );

  const handleInput = useCallback(() => {
    const value = editorRef.current?.textContent ?? "";
    setText(value);

    if (value === "/") {
      setPaletteFilter("/");
      setPaletteOpen(true);
      return;
    }
    if (paletteOpen && value.startsWith("/")) {
      setPaletteFilter(value);
      return;
    }
    if (paletteOpen && !value.startsWith("/")) {
      setPaletteOpen(false);
      setPaletteFilter(undefined);
    }
  }, [paletteOpen]);

  function closePalette() {
    setPaletteOpen(false);
    setPaletteFilter(undefined);
    const value = text.trim();
    if (value.startsWith("/")) {
      setText("");
      if (editorRef.current) editorRef.current.textContent = "";
    }
    editorRef.current?.focus();
  }

  return (
    <div className="shrink-0 w-full px-4 pb-3 flex flex-col justify-center items-center bg-card">
      <div className="w-full rounded-xl md:max-w-200 md:mx-auto 2xl:max-w-250 border border-border bg-background-weak relative">
        {paletteOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-1 z-50">
            <CommandPalette
              sessionID={chat.activeSession()}
              onClose={closePalette}
              onConfigChanged={() => setConfigVersion((v) => v + 1)}
              initialFilter={paletteFilter?.replace("/", "")}
            />
          </div>
        )}

        <DockShellForm
          onSubmit={handleSubmit}
          className="group/prompt-input border-b border-border bg-card rounded-lg overflow-hidden focus-within:shadow-xs focus-within:border-border-strong"
          style={
            isBypass
              ? { borderColor: "var(--destructive)", borderWidth: "1.5px" }
              : undefined
          }
        >
          <div
            className="relative"
            onMouseDown={(e) => {
              const target = e.target;
              if (!(target instanceof HTMLElement)) return;
              if (target.closest("[data-action]")) return;
              editorRef.current?.focus();
            }}
          >
            {/* Attachment chips (Claude Code style) */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="group flex items-center gap-1.5 h-7 pl-1.5 pr-1 rounded-md border border-border-weak bg-muted hover:bg-muted-hover transition-colors"
                  >
                    {isImageMime(att.mimeType) ? (
                      <img
                        src={att.dataUrl}
                        alt=""
                        className="size-4 rounded-sm object-cover flex-shrink-0"
                      />
                    ) : (
                      <FileIcon
                        size={14}
                        className="text-foreground-weaker flex-shrink-0"
                      />
                    )}
                    <span className="text-[12px] text-foreground-weak truncate max-w-[160px] leading-none">
                      {att.fileName}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeAttachment(att.id)}
                      className="size-4 flex-shrink-0"
                    >
                      <X size={10} weight="bold" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div
              className="relative max-h-[240px] overflow-y-auto no-scrollbar"
              style={{ scrollPaddingBottom: space }}
            >
              <div
                ref={editorRef}
                data-component="prompt-input"
                role="textbox"
                aria-multiline="true"
                contentEditable="true"
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                className="select-text w-full pl-3 pr-2 pt-2 text-base leading-xl text-foreground focus:outline-none whitespace-pre-wrap"
                style={{ paddingBottom: space }}
              />
              {!text.trim() && !attachments.length && (
                <div
                  className="absolute top-0 inset-x-0 pl-3 pr-2 pt-2 text-base leading-xl text-muted-foreground pointer-events-none whitespace-nowrap truncate"
                  style={{ paddingBottom: space }}
                >
                  Ask anything...
                </div>
              )}
            </div>

            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0"
              style={{
                height: space,
                background:
                  "linear-gradient(to top, var(--surface-raised-stronger-non-alpha) calc(100% - 20px), transparent)",
              }}
            />

            <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2">
              <div className="flex items-center gap-1.5 pointer-events-auto">
                {contextUsage?.contextSize && !chat.streaming() && (
                  <ContextBadge usage={contextUsage} />
                )}
                <Button
                  data-action="prompt-submit"
                  type="submit"
                  size="icon-sm"
                  disabled={
                    !text.trim() && !attachments.length && !chat.streaming()
                  }
                  className="bg-text-strong text-background-stronger hover:bg-text-strong/90"
                  onClick={
                    chat.streaming()
                      ? (e: React.MouseEvent) => {
                          e.preventDefault();
                          chat.abort();
                        }
                      : undefined
                  }
                >
                  {sending ? (
                    <Spinner className="size-3.5" />
                  ) : chat.streaming() ? (
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <rect
                        x="5"
                        y="5"
                        width="10"
                        height="10"
                        fill="currentColor"
                        rx="1"
                      />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M10 15.8337V4.16699M4.16699 10.0003L10 4.16699L15.8337 10.0003"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </Button>
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-2 left-2">
              <div className="pointer-events-auto flex items-center gap-0.5">
                <Button
                  data-action="prompt-attach"
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus
                    size={18}
                    weight="bold"
                    className="text-foreground-weak"
                  />
                </Button>
                <Button
                  data-action="prompt-command"
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPaletteFilter(undefined);
                    setPaletteOpen(!paletteOpen);
                  }}
                >
                  <Command
                    size={18}
                    weight="regular"
                    className="text-foreground-weak"
                  />
                </Button>
              </div>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            onChange={(e) => {
              const list = e.target.files;
              if (list) void addFiles(Array.from(list));
              e.target.value = "";
            }}
          />
        </DockShellForm>

        <DockTray attach="top" className="rounded-lg">
          <div className="px-2 pt-2 pb-2 flex items-center gap-1.5 min-w-0">
            <AgentSelector
              current={agent}
              sessionID={chat.activeSession()}
              onSelect={setAgent}
              onSwitched={() => setConfigVersion((v) => v + 1)}
              onInstallAgent={() => {
                window.dispatchEvent(
                  new CustomEvent("open-settings", {
                    detail: { page: "agents" },
                  }),
                );
              }}
            />
            <ConfigSelector
              category="model"
              sessionID={chat.activeSession()}
              refreshKey={configVersion}
            />
            <BranchIndicator />
            <div className="flex-1" />
            <ConfigSelector
              category="mode"
              sessionID={chat.activeSession()}
              refreshKey={configVersion}
              onValueChange={(v) => {
                const val = v.toLowerCase();
                setIsBypass(
                  val.includes("bypass") || val.includes("dangerous"),
                );
              }}
            />
          </div>
        </DockTray>
      </div>

      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-border-selected">
            <ImageIcon size={40} className="text-primary" />
            <span className="text-base font-medium leading-lg text-foreground">
              Drop files to attach
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
