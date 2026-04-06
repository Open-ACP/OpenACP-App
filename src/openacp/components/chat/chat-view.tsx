import React, { useMemo, useState, useEffect } from "react";
import { TextAlignLeft, Circle, DotsThree } from "@phosphor-icons/react";
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

function ChatHeader({ onOpenReview }: { onOpenReview?: () => void }) {
  const chat = useChat();
  const sessions = useSessions();

  const session = useMemo(() => {
    const id = chat.activeSession();
    if (!id) return undefined;
    return sessions.list().find((s) => s.id === id);
  }, [chat.activeSession(), sessions.list()]);

  const title = session?.name || "Untitled";

  if (!chat.activeSession()) return null;

  return (
    <div className="flex items-center h-11 px-4 border-b border-border-weak flex-shrink-0">
      <div className="flex-1 min-w-0">
        <span className="text-md-medium text-foreground truncate block">
          {title}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          title="Review changes"
          onClick={() => onOpenReview?.()}
        >
          <TextAlignLeft size={16} />
        </Button>
        <Button variant="ghost" size="icon-sm" title="Context">
          <Circle size={16} />
        </Button>
        <Button variant="ghost" size="icon-sm" title="More options">
          <DotsThree size={16} weight="bold" />
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  const chat = useChat();
  const sessions = useSessions();
  const hasSession = !!chat.activeSession();
  const [creating, setCreating] = useState(false);

  async function handleNewSession() {
    if (creating) return;
    setCreating(true);
    try {
      const session = await sessions.create();
      if (session) {
        chat.setActiveSession(session.id);
      } else {
        showToast({
          description: "Failed to create session. Max sessions may be reached.",
          variant: "error",
        });
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center border border-border-weak/50">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M12.292 6.04167L16.2503 9.99998L12.292 13.9583M2.91699 9.99998H15.6253M17.0837 3.75V16.25"
              stroke="currentColor"
              strokeLinecap="square"
              className="text-muted-foreground"
            />
          </svg>
        </div>
        <div className="text-center">
          <div className="text-md-medium text-foreground">
            {hasSession ? "Ready to chat" : "No session selected"}
          </div>
          <div className="text-sm-regular text-muted-foreground mt-1">
            {hasSession
              ? "Type a message below to start"
              : "Create a new session or select one from the sidebar"}
          </div>
        </div>
        {!hasSession && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewSession}
            disabled={creating}
          >
            {creating ? (
              <div
                className="w-3.5 h-3.5 border-2 rounded-full oac-spinner"
                style={{
                  borderColor: "var(--muted-foreground)",
                  borderTopColor: "transparent",
                }}
              />
            ) : (
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 4.16699V15.8337M4.16699 10.0003H15.8337"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
            {creating ? "Creating..." : "New Session"}
          </Button>
        )}
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

export function ChatView({ onOpenReview }: { onOpenReview?: () => void }) {
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

  const hasMessages = chat.activeSession() && chat.messages().length > 0;

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      <ChatHeader onOpenReview={onOpenReview} />
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
