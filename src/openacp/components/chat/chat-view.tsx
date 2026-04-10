import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { BrandIcon } from "../brand-loader";
import { useChat } from "../../context/chat";
import { useSessions } from "../../context/sessions";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { UserMessage } from "./user-message";
import { MessageTurn } from "./message-turn";
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
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <BrandIcon className="w-12 h-8 text-foreground" />
        <div className="text-xl font-medium text-foreground">How can I help you today?</div>
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
          background: "var(--surface-stronger-non-alpha, var(--card))",
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

type MessageGroup = { user: Message | null; assistants: Message[] };

interface ChatGroupProps {
  group: MessageGroup
  index: number
  isLast: boolean
  streaming: boolean
}

function ChatGroup({ group, index, isLast, streaming }: ChatGroupProps) {
  if (!group.user) {
    // Orphan assistant messages (no preceding user turn)
    return (
      <>
        {group.assistants.map((msg, ai) => (
          <div
            key={msg.id}
            style={{ marginTop: index === 0 && ai === 0 ? "0px" : "20px" }}
          >
            <MessageTurn
              message={msg}
              streaming={streaming && isLast && ai === group.assistants.length - 1}
            />
          </div>
        ))}
      </>
    )
  }
  return (
    <div style={{ marginTop: index === 0 ? "0px" : "28px" }}>
      <UserMessage message={group.user} />
      {group.assistants.map((msg, ai) => (
        <div key={msg.id} style={{ marginTop: "20px" }}>
          <MessageTurn
            message={msg}
            streaming={streaming && isLast && ai === group.assistants.length - 1}
          />
        </div>
      ))}
    </div>
  )
}

// Footer rendered by Virtuoso below the last message item.
// Reads from context directly because Virtuoso's Footer receives no props.
function ChatFooter() {
  const chat = useChat()
  const streaming = chat.streaming()
  const messages = chat.messages()
  const activeSessionId = chat.activeSession()

  const showCursor = (() => {
    if (!streaming) return false
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.role === "assistant" && lastMsg.blocks.length > 0) {
      const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1]
      if (lastBlock.type === "text" && lastBlock.content.length > 0) return false
      if (lastBlock.type === "tool" && (lastBlock.status === "running" || lastBlock.status === "pending")) return false
    }
    return true
  })()

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
  )
}

export function ChatView() {
  const chat = useChat();
  const activeSessionId = chat.activeSession();

  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [atBottom, setAtBottom] = useState(true)

  const messages = chat.messages()
  const streaming = chat.streaming()

  const groups = useMemo<MessageGroup[]>(() => {
    const result: MessageGroup[] = []
    let current: MessageGroup | null = null
    for (const msg of messages) {
      if (msg.role === "user") {
        current = { user: msg, assistants: [] }
        result.push(current)
      } else if (current) {
        current.assistants.push(msg)
      } else {
        result.push({ user: null, assistants: [msg] })
      }
    }
    return result
  }, [messages])

  // Scroll to bottom on session switch
  useEffect(() => {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "auto" })
  }, [activeSessionId])

  // Scroll to bottom when triggered (user sent message, cross-adapter turn, history loaded)
  useEffect(() => {
    if (chat.scrollTrigger() > 0) {
      virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "auto" })
    }
  }, [chat.scrollTrigger()])

  const sessions = useSessions();
  const sessionTitle = useMemo(() => {
    if (!activeSessionId) return ""
    return sessions.list().find((s) => s.id === activeSessionId)?.name || ""
  }, [activeSessionId, sessions.list()])

  const hasMessages = activeSessionId && messages.length > 0

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
          <span className="text-md-medium text-foreground truncate flex-1">{sessionTitle}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <DotsThree size={16} weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuItem onSelect={handleStartRename}>Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
            <DialogDescription>Enter a new name for this session.</DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground outline-none focus:border-primary"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename() }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button disabled={!renameValue.trim()} onClick={handleRename}>Rename</Button>
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
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleArchive}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {hasMessages ? (
          <>
            <Virtuoso
              ref={virtuosoRef}
              className="h-full no-scrollbar"
              data={groups}
              itemContent={(index, group) => (
                <div
                  className="px-6 md:max-w-180 md:mx-auto 2xl:max-w-220"
                  style={{ paddingTop: index === 0 ? 12 : 0 }}
                >
                  <ChatGroup
                    group={group}
                    index={index}
                    isLast={index === groups.length - 1}
                    streaming={streaming}
                  />
                </div>
              )}
              followOutput={streaming ? "smooth" : false}
              atBottomStateChange={setAtBottom}
              components={{ Footer: ChatFooter }}
              increaseViewportBy={{ top: 600, bottom: 600 }}
              defaultItemHeight={200}
            />
            <ScrollToBottomButton
              visible={!atBottom}
              onClick={() => virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" })}
            />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
