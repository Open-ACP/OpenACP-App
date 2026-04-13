import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { DotsThree, GitBranch, GithubLogo } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { BrandIcon } from "../brand-loader";
import { useChat } from "../../context/chat";
import { useSessions } from "../../context/sessions";
import { useWorkspace } from "../../context/workspace";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { UserMessage } from "./user-message";
import {
  AssistantBlockRow,
  AssistantEmptyRow,
  groupBlocks,
  type RenderItem,
} from "./message-turn";
import { PermissionRequestCard } from "./permission-request";
import { showToast } from "../../lib/toast";
import type { Message } from "../../types";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

function EmptyState() {
  const workspace = useWorkspace();
  const [branch, setBranch] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<string | null>("get_git_branch", { directory: workspace.directory })
      .then((b) => !cancelled && setBranch(b))
      .catch(() => !cancelled && setBranch(null));
    invoke<string | null>("get_git_remote_url", {
      directory: workspace.directory,
    })
      .then((u) => !cancelled && setRemoteUrl(u))
      .catch(() => !cancelled && setRemoteUrl(null));
    return () => {
      cancelled = true;
    };
  }, [workspace.directory]);

  const { parentPath, folderName } = useMemo(() => {
    const dir = workspace.directory.replace(/\/$/, "");
    const idx = dir.lastIndexOf("/");
    if (idx <= 0) return { parentPath: "", folderName: dir };
    return {
      parentPath: dir.slice(0, idx + 1),
      folderName: dir.slice(idx + 1),
    };
  }, [workspace.directory]);

  const githubRepo = useMemo(() => {
    if (!remoteUrl) return null;
    // Support https://github.com/owner/repo(.git) and git@github.com:owner/repo(.git)
    const match = remoteUrl.match(
      /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/,
    );
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
  }, [remoteUrl]);

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-5 max-w-2xl px-6">
        <div className="w-16 h-16 bg-fg-base rounded-xl flex justify-center items-center">
          <BrandIcon className="w-12 h-auto text-bg-base" />
        </div>
        <div className="text-xl font-medium text-foreground">
          How can I help you today?
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm text-fg-weak truncate max-w-full">
            <span>{parentPath}</span>
            <span className="text-fg-base">{folderName}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-fg-weak">
            {branch && (
              <div className="flex items-center gap-1.5">
                <GitBranch size={14} weight="duotone" />
                <span>{branch}</span>
              </div>
            )}
            {githubRepo && (
              <div className="flex items-center gap-1.5">
                <GithubLogo size={14} weight="duotone" />
                <span>{githubRepo}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScrollToBottomButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;
  return (
    <div
      className="absolute bottom-50 left-1/2 z-20"
      style={{ transform: "translateX(-50%)" }}
    >
      <Button
        variant="outline"
        size="icon-sm"
        className="rounded-full"
        style={{
          background: "var(--bg-strong)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
        onClick={onClick}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path
            d="M5.83301 8.33366L9.99967 12.5003L14.1663 8.33366"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Button>
    </div>
  );
}

// Each assistant message is flattened into one FlatItem per RenderItem (block/noise-group).
// This allows Virtuoso to virtualize at the block level — a message with 200+ blocks only
// mounts the blocks currently in view instead of all at once.
type FlatItem =
  | { key: string; type: "user"; message: Message; topSpacing: number }
  | {
      key: string;
      type: "assistant-block";
      message: Message;
      renderItem: RenderItem;
      isFirstBlock: boolean;
      isLastBlock: boolean;
      isLastMsg: boolean;
      topSpacing: number;
    }
  | {
      key: string;
      type: "assistant-empty";
      message: Message;
      isLastMsg: boolean;
      topSpacing: number;
    };

// Footer rendered by Virtuoso below the last message item.
// Reads from context directly because Virtuoso's Footer receives no props.
function ChatFooter() {
  const chat = useChat();
  const streaming = chat.streaming();
  const messages = chat.messages();
  const activeSessionId = chat.activeSession();

  const showCursor = (() => {
    if (!streaming) return false;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant" && lastMsg.blocks.length > 0) {
      const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1];
      if (lastBlock.type === "text" && lastBlock.content.length > 0)
        return false;
      if (
        lastBlock.type === "tool" &&
        (lastBlock.status === "running" || lastBlock.status === "pending")
      )
        return false;
    }
    return true;
  })();

  return (
    <div className="px-6 md:max-w-180 md:mx-auto 2xl:max-w-220">
      {activeSessionId && <PermissionRequestCard sessionId={activeSessionId} />}
      {showCursor && (
        <div className="oac-stream-indicator" style={{ paddingLeft: 30 }}>
          <span className="oac-stream-cursor" />
        </div>
      )}
      {/* Spacer so the last message is not obscured by the Composer (replaces pb-80) */}
      <div style={{ height: 320 }} />
    </div>
  );
}

export function ChatView() {
  const chat = useChat();
  const activeSessionId = chat.activeSession();

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);

  const messages = chat.messages();
  const streaming = chat.streaming();

  // Cache groupBlocks results per Message object reference so we only recompute
  // when a message actually changes (during streaming only the last message changes).
  const groupBlocksCacheRef = useRef(new WeakMap<Message, RenderItem[]>());

  const flatItems = useMemo<FlatItem[]>(() => {
    const cache = groupBlocksCacheRef.current;
    const items: FlatItem[] = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        items.push({
          key: `u-${msg.id}`,
          type: "user",
          message: msg,
          topSpacing: items.length === 0 ? 12 : 28,
        });
      } else {
        const topSpacing = items.length === 0 ? 12 : 20;

        if (!cache.has(msg)) {
          cache.set(msg, groupBlocks(msg.blocks ?? []));
        }
        const renderItems = cache.get(msg)!;

        if (renderItems.length === 0) {
          items.push({
            key: `ae-${msg.id}`,
            type: "assistant-empty",
            message: msg,
            isLastMsg: false,
            topSpacing,
          });
        } else {
          for (let i = 0; i < renderItems.length; i++) {
            items.push({
              key: `ab-${msg.id}-${i}`,
              type: "assistant-block",
              message: msg,
              renderItem: renderItems[i],
              isFirstBlock: i === 0,
              isLastBlock: i === renderItems.length - 1,
              isLastMsg: false,
              // Only the first block in a message gets the top spacing; the rest
              // have topSpacing=0 so block-level items within a message are adjacent
              // (needed for timeline connecting lines to render correctly).
              topSpacing: i === 0 ? topSpacing : 0,
            });
          }
        }
      }
    }

    // Mark isLastMsg on every item belonging to the last assistant message
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.type === "assistant-block" || item.type === "assistant-empty") {
        // Mark all items in this message
        const lastMsgId = item.message.id;
        for (let j = i; j >= 0; j--) {
          const it = items[j];
          if (
            (it.type === "assistant-block" || it.type === "assistant-empty") &&
            it.message.id === lastMsgId
          ) {
            items[j] = { ...it, isLastMsg: true };
          } else {
            break;
          }
        }
        break;
      }
    }

    return items;
  }, [messages]);

  // Scroll to bottom on session switch
  useEffect(() => {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "auto" });
  }, [activeSessionId]);

  // Scroll to bottom when triggered (user sent message, cross-adapter turn, history loaded)
  useEffect(() => {
    if (chat.scrollTrigger() > 0) {
      virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "auto" });
    }
  }, [chat.scrollTrigger()]);

  const sessions = useSessions();
  const sessionTitle = useMemo(() => {
    if (!activeSessionId) return "";
    return sessions.list().find((s) => s.id === activeSessionId)?.name || "";
  }, [activeSessionId, sessions.list()]);

  const hasMessages = activeSessionId && messages.length > 0;

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);

  const handleStartRename = useCallback(() => {
    setRenameValue(sessionTitle);
    setRenameOpen(true);
  }, [sessionTitle]);

  const handleRename = useCallback(async () => {
    const name = renameValue.trim();
    if (!name || !activeSessionId) return;
    try {
      await sessions.rename(activeSessionId, name);
    } catch {
      showToast({ description: "Failed to rename session" });
    }
    setRenameOpen(false);
  }, [renameValue, activeSessionId, sessions]);

  const handleArchive = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      await sessions.archive(activeSessionId);
      chat.setActiveSession("");
    } catch {
      showToast({ description: "Failed to archive session" });
    }
    setArchiveOpen(false);
  }, [activeSessionId, sessions, chat]);

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      {sessionTitle && (
        <div className="flex items-center h-11 px-4 shrink-0 oac-session-header">
          <span className="text-md-medium text-foreground truncate flex-1">
            {sessionTitle}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <DotsThree size={16} weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuItem onSelect={handleStartRename}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
            <DialogDescription>
              Enter a new name for this session.
            </DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground outline-none focus:border-primary"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!renameValue.trim()} onClick={handleRename}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation dialog */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Archive session</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive "{sessionTitle}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchive}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {hasMessages ? (
          <>
            <Virtuoso
              ref={virtuosoRef}
              className="h-full no-scrollbar"
              data={flatItems}
              computeItemKey={(_, item) => item.key}
              itemContent={(_, item) => (
                <div
                  className="px-6 md:max-w-180 md:mx-auto 2xl:max-w-220"
                  style={{ paddingTop: item.topSpacing }}
                >
                  {item.type === "user" ? (
                    <UserMessage message={item.message} />
                  ) : item.type === "assistant-empty" ? (
                    <AssistantEmptyRow
                      streaming={streaming && item.isLastMsg}
                    />
                  ) : (
                    <AssistantBlockRow
                      message={item.message}
                      renderItem={item.renderItem}
                      isFirstBlock={item.isFirstBlock}
                      isLastBlock={item.isLastBlock}
                      streaming={
                        streaming && item.isLastMsg && item.isLastBlock
                      }
                    />
                  )}
                </div>
              )}
              followOutput={streaming ? "smooth" : false}
              atBottomStateChange={setAtBottom}
              atBottomThreshold={100}
              components={{ Footer: ChatFooter }}
              increaseViewportBy={{ top: 1200, bottom: 600 }}
              defaultItemHeight={80}
            />
            <ScrollToBottomButton
              visible={!atBottom}
              onClick={() =>
                virtuosoRef.current?.scrollToIndex({
                  index: "LAST",
                  behavior: "smooth",
                })
              }
            />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
