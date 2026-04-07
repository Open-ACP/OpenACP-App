import React, { useMemo, useState, useEffect, useCallback } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { useChat } from "../../context/chat";
import { useSessions } from "../../context/sessions";
import { usePermissions } from "../../context/permissions";
import { useAutoScroll } from "../../hooks/use-auto-scroll";
import { UserMessage } from "./user-message";
import { MessageTurn } from "./message-turn";
import { PermissionRequestCard } from "./permission-request";
import { showToast } from "../../lib/toast";
import type { Message } from "../../types";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="text-xl-medium text-foreground" style={{ fontSize: 24 }}>How can I help you today?</div>
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
      className="absolute bottom-4 left-1/2 z-10"
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

export function ChatView() {
  const chat = useChat();
  const permissions = usePermissions();
  const activeSessionId = chat.activeSession();

  const autoScroll = useAutoScroll({
    working: chat.streaming(),
    bottomThreshold: 120,
  });

  // Force scroll to bottom when switching sessions — use double rAF + setTimeout fallback
  // to ensure messages are rendered before scrolling
  useEffect(() => {
    autoScroll.forceScrollToBottom();
    // Fallback: setTimeout ensures scroll fires after React commit + paint
    const timer = setTimeout(() => autoScroll.forceScrollToBottom(), 80);
    return () => clearTimeout(timer);
  }, [chat.activeSession()]);

  // Scroll to bottom when scrollTrigger fires (user sends message, cross-adapter message, history loaded)
  useEffect(() => {
    if (chat.scrollTrigger() > 0) autoScroll.forceScrollToBottom();
  }, [chat.scrollTrigger()]);

  const sessions = useSessions();
  const sessionTitle = useMemo(() => {
    if (!activeSessionId) return ""
    return sessions.list().find((s) => s.id === activeSessionId)?.name || ""
  }, [activeSessionId, sessions.list()])

  const hasMessages = chat.activeSession() && chat.messages().length > 0;

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
              <DropdownMenuItem onSelect={() => {/* TODO */}}>Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => {/* TODO */}}>Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {hasMessages ? (
          <>
            <div
              ref={autoScroll.scrollRef}
              className="h-full overflow-y-auto no-scrollbar pt-3"
              onScroll={autoScroll.handleScroll}
            >
              <div
                ref={autoScroll.contentRef}
                className="px-6 md:max-w-200 md:mx-auto 2xl:max-w-[1000px] pb-32 flex flex-col"
                onClick={autoScroll.handleInteraction}
              >
                {(() => {
                  const messages = chat.messages();
                  const groups: { user: Message; assistants: Message[] }[] = [];
                  let current: { user: Message; assistants: Message[] } | null =
                    null;

                  for (const msg of messages) {
                    if (msg.role === "user") {
                      current = { user: msg, assistants: [] };
                      groups.push(current);
                    } else if (current) {
                      current.assistants.push(msg);
                    } else {
                      // assistant without preceding user (edge case)
                      groups.push({ user: null as any, assistants: [msg] });
                    }
                  }

                  return groups.map((group, gi) => {
                    const isLastGroup = gi === groups.length - 1;
                    if (!group.user) {
                      // Orphan assistant messages
                      return group.assistants.map((msg, ai) => (
                        <div
                          key={msg.id}
                          style={{
                            marginTop: gi === 0 && ai === 0 ? "0px" : "20px",
                          }}
                        >
                          <MessageTurn
                            message={msg}
                            streaming={
                              chat.streaming() &&
                              isLastGroup &&
                              ai === group.assistants.length - 1
                            }
                          />
                        </div>
                      ));
                    }
                    return (
                      <div
                        key={group.user.id}
                        style={{ marginTop: gi === 0 ? "0px" : "28px" }}
                      >
                        <UserMessage message={group.user} />
                        {group.assistants.map((msg, ai) => (
                          <div key={msg.id} style={{ marginTop: "20px" }}>
                            <MessageTurn
                              message={msg}
                              streaming={
                                chat.streaming() &&
                                isLastGroup &&
                                ai === group.assistants.length - 1
                              }
                            />
                          </div>
                        ))}
                      </div>
                    );
                  });
                })()}
                {activeSessionId && (
                  <PermissionRequestCard sessionId={activeSessionId} />
                )}
                {(() => {
                  if (!chat.streaming()) return null;
                  const msgs = chat.messages();
                  const lastMsg = msgs[msgs.length - 1];
                  // Don't show cursor when content is actively visible (text streaming or tool running)
                  if (lastMsg?.role === "assistant" && lastMsg.blocks.length > 0) {
                    const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1];
                    if (lastBlock.type === "text" && lastBlock.content.length > 0) return null;
                    if (lastBlock.type === "tool" && (lastBlock.status === "running" || lastBlock.status === "pending")) return null;
                  }
                  return (
                    <div className="oac-stream-indicator" style={{ paddingLeft: 30 }}>
                      <span className="oac-stream-cursor" />
                    </div>
                  );
                })()}
              </div>
            </div>
            <ScrollToBottomButton
              visible={autoScroll.userScrolled()}
              onClick={() => autoScroll.resume()}
            />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
