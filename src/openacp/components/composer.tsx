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
import { useBrowserOverlayLock } from "../context/browser-overlay";
import { AgentSelector } from "./agent-selector";
import { BranchIndicator } from "./branch-indicator";
import { CommandPalette } from "./command-palette";
import { ConfigSelector } from "./config-selector";
import { Spinner } from "./ui/spinner";
import { showToast } from "../lib/toast";
import { Code, ListChecks, Circle, CheckCircle, CircleNotch } from "@phosphor-icons/react";
import type { FileAttachment, UsageInfo, PlanEntry } from "../types";

export interface CodeSnippet {
  id: string
  filePath: string
  lines: [number, number]
  code: string
  comment: string
}
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
          <div className="flex items-center gap-1.5 cursor-default px-1.5 py-0.5">
            <svg width="14" height="14" viewBox="0 0 18 18">
              <circle cx="9" cy="9" r="7" fill="none" stroke="var(--border-weak)" strokeWidth="2" />
              <circle cx="9" cy="9" r="7" fill="none" stroke={color} strokeWidth="2"
                strokeDasharray={`${(pct / 100) * 44} 44`}
                strokeLinecap="round"
                transform="rotate(-90 9 9)"
              />
            </svg>
            <span style={{ fontSize: 11, color, fontWeight: 500 }}>{pct.toFixed(1)}%</span>
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

function PlanBadge({ entries }: { entries: PlanEntry[] }) {
  const completed = entries.filter(e => e.status === "completed").length
  const inProgress = entries.filter(e => e.status === "in_progress").length
  const total = entries.length
  const allDone = completed === total
  const color = allDone ? "var(--surface-success-strong)" : inProgress > 0 ? "var(--primary)" : "var(--muted-foreground)"

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-default px-1.5 py-0.5">
            <ListChecks size={14} style={{ color }} />
            <span style={{ fontSize: 11, color, fontWeight: 500 }}>{completed}/{total}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8} className="bg-card border border-border-weak text-foreground px-3 py-2.5 max-w-[280px]">
          <div className="text-xs font-medium text-foreground mb-2">Plan</div>
          <div className="flex flex-col gap-1.5">
            {entries.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {entry.status === "completed" ? (
                  <CheckCircle size={14} weight="fill" className="text-green-500 shrink-0 mt-0.5" />
                ) : entry.status === "in_progress" ? (
                  <CircleNotch size={14} weight="bold" className="text-primary shrink-0 mt-0.5 animate-spin" />
                ) : (
                  <Circle size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span className={entry.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}>
                  {entry.content}
                </span>
              </div>
            ))}
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

  // Get latest plan entries from messages
  // Hide when all done + user sent a new message after (= new task started)
  const planEntries = useMemo(() => {
    const messages = chat.messages();
    let planFound: PlanEntry[] | null = null;
    let planMsgIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      for (let j = msg.blocks.length - 1; j >= 0; j--) {
        const block = msg.blocks[j];
        if (block.type === "plan" && block.entries.length > 0) {
          planFound = block.entries;
          planMsgIndex = i;
          break;
        }
      }
      if (planFound) break;
    }
    if (!planFound) return null;
    const allDone = planFound.every(e => e.status === "completed");
    if (allDone) {
      // Check if user sent a message after the plan message
      const hasUserMsgAfter = messages.slice(planMsgIndex + 1).some(m => m.role === "user");
      if (hasUserMsgAfter) return null;
    }
    return planFound;
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
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [dragging, setDragging] = useState(false);
  useBrowserOverlayLock(dragging);

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

  const removeSnippet = useCallback((id: string) => {
    setSnippets((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // ── Code snippet listener ─────────────────────────────────────────────

  useEffect(() => {
    function handleSnippet(e: Event) {
      const { comment, code, lines, filePath } = (e as CustomEvent).detail;
      const fileName = filePath?.split("/").pop() || "unknown";
      setSnippets((prev) => [...prev, {
        id: `snippet-${Date.now()}`,
        filePath: fileName,
        lines,
        code,
        comment,
      }]);
      editorRef.current?.focus();
    }
    window.addEventListener("add-code-snippet", handleSnippet);
    return () => window.removeEventListener("add-code-snippet", handleSnippet);
  }, []);

  // ── Drag & drop (Tauri native events) ───────────────────────────────────
  // macOS WKWebView doesn't support HTML5 file drag-drop, so we use
  // Tauri's native onDragDropEvent which provides file paths from the OS.

  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const { invoke } = await import("@tauri-apps/api/core");

      const unlistenFn = await getCurrentWebview().onDragDropEvent(async (event) => {
        const { type } = event.payload;
        if (type === "enter") {
          setDragging(true);
        } else if (type === "leave") {
          setDragging(false);
        } else if (type === "drop") {
          setDragging(false);
          const { paths } = event.payload;
          if (!paths?.length) return;

          for (const filePath of paths) {
            if (attachments.length >= MAX_ATTACHMENTS) {
              showToast({ title: "Attachment limit", description: `Maximum ${MAX_ATTACHMENTS} files` });
              break;
            }
            try {
              const result = await invoke<{
                fileName: string;
                mimeType: string;
                dataUrl: string;
                size: number;
              }>("read_file_base64", { path: filePath });

              if (result.size > MAX_FILE_SIZE) {
                showToast({ title: "File too large", description: `${result.fileName} exceeds 10 MB limit` });
                continue;
              }

              const att: FileAttachment = {
                id: nextAttachId(),
                fileName: result.fileName,
                mimeType: result.mimeType,
                dataUrl: result.dataUrl,
                size: result.size,
              };
              setAttachments((prev) => [...prev, att]);
            } catch (err) {
              const name = filePath.split("/").pop() ?? filePath;
              showToast({ title: "Unsupported file", description: `${name}: ${String(err)}` });
            }
          }
        }
      });

      unlisten = unlistenFn;
    })();

    return () => { unlisten?.(); };
  }, [attachments.length]);

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
      if (!value && !attachments.length && !snippets.length) return;
      setText("");
      if (editorRef.current) editorRef.current.textContent = "";
      const atts = attachments.length ? [...attachments] : undefined;
      // Build prompt with snippet context
      let prompt = value;
      if (snippets.length > 0) {
        const snippetContext = snippets.map((s) =>
          `[${s.filePath}:${s.lines[0]}${s.lines[0] !== s.lines[1] ? `-${s.lines[1]}` : ""}] ${s.comment}\n\`\`\`\n${s.code}\n\`\`\``
        ).join("\n\n");
        prompt = prompt ? `${snippetContext}\n\n${prompt}` : snippetContext;
      }
      setAttachments([]);
      setSnippets([]);
      setSending(true);
      try {
        await chat.sendPrompt(prompt || "See attached files", atts);
      } finally {
        setSending(false);
      }
    },
    [text, paletteOpen, chat, attachments, snippets],
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
    <div className="w-full pb-3 flex flex-col justify-center items-center pointer-events-none [&>*]:pointer-events-auto">
      <div ref={composerRef} className={`w-full px-6 md:max-w-180 md:mx-auto 2xl:max-w-220 relative ${dragging ? "z-50" : ""}`}>
        <div className={`w-full rounded-xl border bg-background-weak relative transition-colors ${
          dragging
            ? "border-dashed border-2 border-primary/60 bg-primary/5"
            : "border-border"
        }`}>
        {paletteOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
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
          className="group/prompt-input border-b border-border rounded-lg overflow-hidden focus-within:shadow-xs focus-within:border-border-strong"
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
            {/* Drop hint overlay inside composer */}
            {dragging && (
              <div className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-primary/5 pointer-events-none">
                <div className="flex items-center gap-2 text-sm font-medium text-primary/80">
                  <ImageIcon size={20} />
                  Drop files to attach
                </div>
              </div>
            )}

            {/* Snippet + Attachment chips */}
            {(snippets.length > 0 || attachments.length > 0) && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                {snippets.map((snip) => (
                  <div
                    key={snip.id}
                    className="group flex flex-col gap-0.5 max-w-[240px] pl-2 pr-1 py-1 rounded-md border border-border-weak bg-muted hover:bg-muted-hover transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <Code size={14} className="text-primary flex-shrink-0" />
                      <span className="text-[12px] text-foreground truncate leading-none font-medium">
                        {snip.filePath}:{snip.lines[0]}{snip.lines[0] !== snip.lines[1] ? `-${snip.lines[1]}` : ""}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeSnippet(snip.id)}
                        className="size-4 flex-shrink-0 ml-auto"
                      >
                        <X size={10} weight="bold" />
                      </Button>
                    </div>
                    <span className="text-[11px] text-foreground-weak truncate leading-none pl-5">
                      {snip.comment}
                    </span>
                  </div>
                ))}
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
                className="select-text w-full pl-3 pr-2 pt-2 text-base leading-relaxed text-foreground focus:outline-none whitespace-pre-wrap"
                style={{ paddingBottom: space }}
              />
              {!text.trim() && !attachments.length && !snippets.length && (
                <div
                  className="absolute top-0 inset-x-0 pl-3 pr-2 pt-2 text-base leading-relaxed text-muted-foreground pointer-events-none whitespace-nowrap truncate"
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
              {(planEntries?.length || contextUsage?.contextSize) && (
                <div className="flex items-center rounded-lg border border-border-weak px-0.5 py-0.5 pointer-events-auto">
                  {planEntries && planEntries.length > 0 && (
                    <PlanBadge entries={planEntries} />
                  )}
                  {contextUsage?.contextSize && (
                    <ContextBadge usage={contextUsage} />
                  )}
                </div>
              )}
              <div className="pointer-events-auto">
                <Button
                  data-action="prompt-submit"
                  type="submit"
                  size="icon-sm"
                  disabled={
                    !text.trim() && !attachments.length && !snippets.length && !chat.streaming()
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
      </div>

      {/* Drag overlay — scrim over whole window to funnel attention to composer */}
      {dragging && (
        <div className="fixed inset-0 z-40 bg-background/60 pointer-events-none" />
      )}
    </div>
  );
}
