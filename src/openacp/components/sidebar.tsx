import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Trash, DotsThree } from "@phosphor-icons/react";
import { ResizeHandle } from "./ui/resize-handle";
import { Spinner } from "./ui/spinner";
import { Button } from "./ui/button";
import { useSessions } from "../context/sessions";
import { useChat } from "../context/chat";
import { useWorkspace } from "../context/workspace";
import { showToast } from "../lib/toast";

const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 480;

export function SidebarPanel({ collapsed }: { collapsed?: boolean }) {
  const sessions = useSessions();
  const chat = useChat();
  const workspace = useWorkspace();

  const [panelWidth, setPanelWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  const workspaceName = useMemo(
    () => workspace.workspace.customName || workspace.directory.split("/").pop() || "Workspace",
    [workspace.workspace.customName, workspace.directory],
  );
  const workspacePath = useMemo(() => {
    const parts = workspace.directory.split("/");
    if (parts.length > 3) return "~/" + parts.slice(3).join("/");
    return workspace.directory;
  }, [workspace.directory]);

  return (
    <AnimatePresence initial={false}>
    {!collapsed && (
    <motion.div
      className="relative flex flex-col min-h-0 min-w-0 box-border border-l border-border-weak bg-background overflow-hidden shrink-0"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: panelWidth, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <ResizeHandle
        direction="horizontal"
        edge="end"
        size={panelWidth}
        min={MIN_SIDEBAR_WIDTH}
        max={MAX_SIDEBAR_WIDTH}
        onResize={setPanelWidth}
      />
      <div className="flex flex-col flex-1 min-h-0 px-3">
      <div className="shrink-0 pl-1 py-1">
        <div className="group/project flex items-center justify-between gap-2 py-2 pl-2 pr-1">
          <div className="flex flex-col min-w-0">
            <span className="text-base font-medium leading-lg text-foreground truncate">
              {workspaceName}
            </span>
            <span
              className="text-sm leading-lg text-foreground-weak truncate"
              title={workspace.directory}
            >
              {workspacePath}
            </span>
          </div>
          <button
            type="button"
            className="shrink-0 size-7 flex items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/project:opacity-100 hover:text-foreground hover:bg-accent transition-all"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              window.dispatchEvent(new CustomEvent("open-workspace-menu", {
                detail: { x: rect.right, y: rect.bottom + 4 }
              }))
            }}
          >
            <DotsThree size={18} weight="bold" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <nav className="flex flex-col gap-1">
          <NewSessionButton />
          <div className="h-2" />
          {sessions.loading() && <SessionSkeleton />}
          {sessions.list().map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              active={chat.activeSession() === session.id}
              streaming={
                chat.streaming() && chat.activeSession() === session.id
              }
              onClick={() => chat.setActiveSession(session.id)}
              onDelete={() => sessions.remove(session.id)}
            />
          ))}
        </nav>
      </div>
      </div>
    </motion.div>
    )}
    </AnimatePresence>
  );
}

function NewSessionButton() {
  const sessions = useSessions();
  const chat = useChat();
  const [creating, setCreating] = useState(false);

  return (
    <Button
      variant="outline"
      className="w-full justify-center h-9 text-foreground"
      disabled={creating}
      onClick={async () => {
        if (creating) return;
        setCreating(true);
        try {
          const session = await sessions.create();
          if (session) {
            chat.setActiveSession(session.id);
          } else {
            showToast({
              description:
                "Failed to create session. Max sessions may be reached.",
              variant: "error",
            });
          }
        } finally {
          setCreating(false);
        }
      }}
    >
      {creating ? (
        <Spinner className="size-[15px] text-muted-foreground" />
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
      {creating ? "Creating..." : "New session"}
    </Button>
  );
}

function SessionItem({
  session,
  active,
  streaming,
  onClick,
  onDelete,
}: {
  session: { id: string; name: string; agent: string; status: string };
  active: boolean;
  streaming: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  return (
    <div
      data-session-id={session.id}
      className={`group/session relative w-full min-w-0 rounded-md cursor-default pl-2 pr-1 transition-colors ${active ? "bg-accent" : "hover:bg-accent"}`}
    >
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <Button
            variant="ghost"
            className={`flex items-center gap-1 min-w-0 w-full text-left py-1 h-auto px-0 rounded-none focus-visible:ring-0 hover:bg-transparent ${active ? "active" : ""}`}
            onClick={onClick}
          >
            <div className="shrink-0 size-6 flex items-center justify-center">
              {streaming ? (
                <Spinner className="size-[15px] text-muted-foreground" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M5 10H15"
                    stroke="currentColor"
                    strokeLinecap="round"
                    className="text-muted-foreground"
                  />
                </svg>
              )}
            </div>
            <span className="text-base leading-xl text-foreground min-w-0 flex-1 truncate">
              {session.name
                .replace(
                  /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu,
                  "",
                )
                .trim()}
            </span>
          </Button>
        </div>
        <div className="shrink-0 overflow-hidden transition-[width,opacity] w-0 opacity-0 pointer-events-none group-hover/session:w-8 group-hover/session:opacity-100 group-hover/session:pointer-events-auto">
          {confirmDelete ? (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Confirm delete"
              className="text-destructive hover:text-destructive"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
                setConfirmDelete(false);
              }}
              onBlur={() => setConfirmDelete(false)}
            >
              <Trash size={16} weight="fill" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete session"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirmDelete(true);
              }}
            >
              <Trash size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-8 w-full rounded-md bg-secondary opacity-60 animate-pulse"
        />
      ))}
    </div>
  );
}
