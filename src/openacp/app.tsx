import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { WorkspaceProvider, useWorkspace } from "./context/workspace";
import { SessionsProvider } from "./context/sessions";
import { ChatProvider, useChat } from "./context/chat";
import { PermissionsProvider, usePermissions } from "./context/permissions";
import { SidebarPanel } from "./components/sidebar";
import { SidebarRail } from "./components/sidebar-rail";
import { ChatView } from "./components/chat";
import { Composer } from "./components/composer";
import { WelcomeScreen } from "./components/welcome";
import { AddWorkspaceModal } from "./components/add-workspace/index";
import { ReconnectDialog } from "./components/reconnect-dialog";
import {
  loadWorkspaces,
  saveWorkspaces,
  discoverLocalInstances,
  type WorkspaceEntry,
} from "./api/workspace-store";
import { getKeychainToken } from "./api/keychain";
import { ReviewPanel } from "./components/review-panel";
import { ShareWorkspaceDialog } from "./components/share-workspace-dialog";
import { PluginsModal } from "./components/plugins-modal";
import {
  SettingsDialog,
  type SettingsPage,
} from "./components/settings/settings-dialog";
import { showToast } from "./lib/toast";
import { Toaster } from "./components/ui/toaster";
import { useSortedWorkspaces } from "./hooks/use-sorted-workspaces";
import {
  useWorkspaceConnection,
  type ConnectionStatus,
} from "./hooks/use-workspace-connection";
import { useUpdateCheckContext } from "./hooks/use-update-check";
import { useSystemNotifications } from "./hooks/use-system-notifications";
import { useSoundEffects } from "./hooks/use-sound-effects";
import { NotificationsProvider, useNotifications } from "./context/notifications";
import {
  getAllSettings,
  getSetting,
  applyTheme,
  applyFontSize,
} from "./lib/settings-store";
import { Titlebar } from "./components/titlebar";
import { FileTreePanel } from "./components/file-tree-panel";
import { BrowserPanel } from "./components/browser-panel";
import { BrowserPanelProvider, useBrowserPanel } from "./context/browser-panel";
import { BrowserOverlayProvider } from "./context/browser-overlay";
import { FloatingBrowserFrame } from "./components/floating-browser-frame";
import { TerminalProvider } from "./context/terminal";
import { TerminalPanel } from "./components/terminal-panel";
import { ToolDisplayProvider } from "./context/tool-display";
import type { ServerInfo } from "./types";

export function UpdateToastRow({
  icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="shrink-0 text-muted-foreground">{icon}</div>
      <p className="flex-1 text-sm text-foreground">{title}</p>
      <button
        onClick={onAction}
        className="shrink-0 text-xs font-medium text-accent-foreground bg-accent px-2.5 py-1 rounded-md hover:opacity-90 transition-opacity"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function NoServerScreen({
  directory,
  isRemote,
  errorMessage,
  onStart,
  onReconnect,
  onRemove,
}: {
  directory: string;
  isRemote?: boolean;
  errorMessage?: string | null;
  onStart: () => void;
  onReconnect: () => void;
  onRemove?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<string | null>(null);

  const handleStart = async () => {
    setBusy(true);
    setAction("Starting...");
    await onStart();
    setBusy(false);
    setAction(null);
  };

  const handleReconnect = async () => {
    setBusy(true);
    setAction("Connecting...");
    await onReconnect();
    setBusy(false);
    setAction(null);
  };

  return (
    <div className="text-center flex flex-col items-center gap-5 max-w-xs">
      <div className="flex flex-col items-center gap-2">
        <div className="size-10 rounded-lg bg-secondary flex items-center justify-center mb-1">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 10h.01M10 10h.01" />
          </svg>
        </div>
        <div className="text-sm font-medium text-foreground">
          {isRemote ? "Connection Lost" : "No Server Found"}
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {directory}
        </div>
        {isRemote && (
          <div className="text-xs text-muted-foreground">
            The host may have stopped sharing this workspace.
          </div>
        )}
        {errorMessage && (
          <div className="text-xs text-destructive max-w-[250px] text-center">
            {errorMessage}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleReconnect}
          disabled={busy}
          className="h-8 px-4 rounded-lg border border-border text-foreground text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Reconnect
        </button>
        {!isRemote && (
          <button
            onClick={handleStart}
            disabled={busy}
            className="h-8 px-4 rounded-lg bg-foreground text-background text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Start Server
          </button>
        )}
        {isRemote && onRemove && (
          <button
            onClick={onRemove}
            className="h-8 px-4 rounded-lg border border-destructive text-destructive text-xs font-medium transition-opacity hover:opacity-90"
          >
            Remove
          </button>
        )}
      </div>
      {busy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="size-1.5 rounded-full bg-muted-foreground animate-pulse" />
          {action}
        </div>
      )}
    </div>
  );
}

function ChatArea() {
  const chat = useChat();

  useEffect(() => {
    function handleNavigateSession(e: Event) {
      const { sessionId } = (e as CustomEvent).detail ?? {}
      if (sessionId) {
        chat.setActiveSession(sessionId)
      }
    }
    window.addEventListener("navigate-session", handleNavigateSession)
    return () => window.removeEventListener("navigate-session", handleNavigateSession)
  }, [chat])

  return (
    <div className="flex flex-1 min-h-0 h-full min-w-0">
      <div className="@container flex-1 flex flex-col min-h-0 h-full bg-bg-strong min-w-0 border-l border-border-weak overflow-hidden">
        <ChatView />
        <Composer />
      </div>
    </div>
  );
}

function ChatWithPermissions({
  sidebarCollapsed,
  reviewOpen,
  onToggleReview,
  setReviewOpen,
  fileTreeOpen,
  workspacePath,
  browserPanelEnabled,
  terminalOpen,
  onCloseTerminal,
}: {
  sidebarCollapsed: boolean;
  reviewOpen: boolean;
  onToggleReview: () => void;
  setReviewOpen: (open: boolean) => void;
  fileTreeOpen: boolean;
  workspacePath: string;
  browserPanelEnabled: boolean;
  terminalOpen: boolean;
  onCloseTerminal: () => void;
}) {
  const permissions = usePermissions();
  const workspaceCtx = useWorkspace();
  const browser = useBrowserPanel();
  const isRemote = workspaceCtx.workspace.type === "remote";
  const [openFiles, setOpenFiles] = useState<
    import("./components/review-panel").OpenFile[]
  >([]);
  const [requestedTab, setRequestedTab] = useState<string | null>(null);

  const handleOpenFile = useCallback(
    (path: string, content: string, language: string) => {
      setOpenFiles((prev) => {
        if (prev.some((f) => f.path === path)) return prev;
        return [...prev, { path, content, language }];
      });
      setRequestedTab(path);
      setReviewOpen(true);
    },
    [setReviewOpen],
  );

  const handleCloseFile = useCallback((path: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.path !== path));
  }, []);

  // Listen for file open events from tool blocks in chat (local only)
  useEffect(() => {
    if (isRemote) return;
    async function handleOpenFromChat(e: Event) {
      const { path } = (e as CustomEvent).detail;
      if (!path || typeof path !== "string") return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<{ content: string; language: string }>(
          "read_file_content",
          { path },
        );
        handleOpenFile(path, result.content, result.language);
      } catch (err) {
        console.error("[open-file-in-review] failed:", err);
      }
    }
    window.addEventListener("open-file-in-review", handleOpenFromChat);
    return () =>
      window.removeEventListener("open-file-in-review", handleOpenFromChat);
  }, [handleOpenFile, isRemote]);

  return (
    <ChatProvider
      onPermissionRequest={permissions.addRequest}
      onPermissionResolved={(e) => permissions.dismiss(e.sessionId)}
    >
      <SidebarPanel collapsed={sidebarCollapsed} />
      <div className="flex flex-1 flex-col min-h-0 min-w-0">
        <div className="flex flex-1 min-h-0">
          <ChatArea />
          <AnimatePresence initial={false}>
            {reviewOpen && (
              <motion.div
                className="shrink-0 h-full overflow-hidden"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <ReviewPanel
                  onClose={onToggleReview}
                  openFiles={openFiles}
                  onCloseFile={handleCloseFile}
                  requestedTab={requestedTab}
                  onRequestedTabHandled={() => setRequestedTab(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {fileTreeOpen && workspacePath && !isRemote && (
              <motion.div
                className="shrink-0 h-full overflow-hidden"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <FileTreePanel
                  workspacePath={workspacePath}
                  onOpenFile={handleOpenFile}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {browser.isVisible &&
              browserPanelEnabled &&
              browser.mode !== "floating" && (
                <motion.div
                  className="shrink-0 h-full overflow-hidden"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <BrowserPanel />
                </motion.div>
              )}
          </AnimatePresence>
        </div>
        <TerminalPanel
          open={terminalOpen}
          onClose={onCloseTerminal}
          workspacePath={workspacePath}
        />
      </div>
    </ChatProvider>
  );
}

export function OpenACPApp() {
  return (
    <ToolDisplayProvider>
      <BrowserOverlayProvider>
        <BrowserPanelProvider>
          <NotificationsProvider>
            <OpenACPAppInner />
            <FloatingBrowserFrame />
          </NotificationsProvider>
        </BrowserPanelProvider>
      </BrowserOverlayProvider>
    </ToolDisplayProvider>
  );
}

function OpenACPAppInner() {
  const browser = useBrowserPanel();
  const { append: appendNotification, unreadCount } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const activeWs = workspaces.find((w) => w.id === active);
  const activeWsName = activeWs?.directory?.split("/").pop() || activeWs?.name;
  // Session name lookup — populated by SessionsProvider deeper in the tree
  const sessionNamesRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    function handleSessionsUpdated(e: Event) {
      const sessions = (e as CustomEvent).detail as Array<{ id: string; name: string }> | undefined;
      if (sessions) {
        const map = new Map<string, string>();
        for (const s of sessions) map.set(s.id, s.name);
        sessionNamesRef.current = map;
      }
    }
    window.addEventListener("sessions-updated", handleSessionsUpdated);
    return () => window.removeEventListener("sessions-updated", handleSessionsUpdated);
  }, []);
  const getSessionName = useCallback((id: string) => sessionNamesRef.current.get(id), []);
  useSystemNotifications(appendNotification, activeWsName, getSessionName);
  useSoundEffects();

  // Unified update system — the hook and the toast effect now live in
  // main.tsx App so they also cover the onboarding screens. Here we only
  // read the shared state via context to drive the sidebar badge.
  const { state: updateState } = useUpdateCheckContext();
  const [updatesSeen, setUpdatesSeen] = useState(false);

  // Listen for macOS menu "Check for Updates"
  useEffect(() => {
    function handleOpenAbout() {
      setSettingsPage("about");
      setShowSettings(true);
      setUpdatesSeen(true);
    }
    window.addEventListener("open-settings-about", handleOpenAbout);
    return () => window.removeEventListener("open-settings-about", handleOpenAbout);
  }, []);

  const [showAddWorkspace, setShowAddWorkspace] = useState(false);
  const [addWorkspaceDefaultTab, setAddWorkspaceDefaultTab] = useState<
    "local" | "remote"
  >("local");
  const [reconnectWorkspaceId, setReconnectWorkspaceId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("general");
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharingWorkspaceIds, setSharingWorkspaceIds] = useState<Set<string>>(
    new Set(),
  );
  const [shareLinks, setShareLinks] = useState<Map<string, string>>(new Map());
  // ── Helpers ────────────────────────────────────────────────────────────

  const {
    sorted: sortedWorkspaces,
    pinnedIds,
    togglePin,
    reorder,
    rename: renameWorkspace,
    touchLastActive,
  } = useSortedWorkspaces(workspaces, setWorkspaces);

  const findWorkspace = useCallback(
    (id: string) => workspaces.find((w) => w.id === id),
    [workspaces],
  );

  const activeWorkspace = active ? (findWorkspace(active) ?? null) : null;

  // Auto-close browser panel when the active workspace changes
  const { close: closeBrowser, isVisible: browserIsVisible } = browser;
  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (prevActiveRef.current !== active && browserIsVisible) {
      void closeBrowser();
    }
    prevActiveRef.current = active;
  }, [active, closeBrowser, browserIsVisible]);

  // ── Connection state machine ───────────────────────────────────────────

  const {
    state: connectionState,
    connect,
    disconnect,
    startServer,
  } = useWorkspaceConnection(activeWorkspace, {
    onConnected: (server) => {
      // Update background status for this workspace
      if (active) {
        setAllWorkspaceStatuses((prev) => {
          const next = new Map(prev);
          next.set(active, "connected");
          return next;
        });
        void refreshWorkspaceInfo(active, server);
      }
    },
    onError: (error) => {
      console.warn("[workspace] connection error:", error);
      if (active) {
        setAllWorkspaceStatuses((prev) => {
          const next = new Map(prev);
          next.set(active, "error");
          return next;
        });
      }
    },
  });

  const server = connectionState.server;
  const connectionStatus = connectionState.status;

  // Track connection status for ALL workspaces (not just active)
  const [allWorkspaceStatuses, setAllWorkspaceStatuses] = useState<
    Map<string, "connected" | "error" | "unknown">
  >(new Map());

  // Check all workspace server statuses on mount + periodically
  useEffect(() => {
    if (!ready || workspaces.length === 0) return;

    async function checkAllStatuses() {
      const statuses = new Map<string, "connected" | "error" | "unknown">();
      await Promise.all(
        workspaces.map(async (ws) => {
          if (ws.type === "remote") {
            statuses.set(ws.id, "unknown");
            return;
          }
          try {
            const status = await invoke<{
              server_alive: boolean;
              port: number | null;
            }>("get_workspace_status", { directory: ws.directory });
            if (status.server_alive && status.port) {
              // Server process alive + port found → try unauthenticated health check
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 3000);
              try {
                const res = await fetch(
                  `http://127.0.0.1:${status.port}/api/v1/system/health`,
                  {
                    signal: controller.signal,
                  },
                );
                // Health endpoint is public (no auth required) — 200 means server is up
                statuses.set(ws.id, res.ok ? "connected" : "unknown");
              } catch {
                // Network error but process alive → server may be starting
                statuses.set(ws.id, "unknown");
              } finally {
                clearTimeout(timer);
              }
            } else if (!status.has_config) {
              // No .openacp config at all
              statuses.set(ws.id, "error");
            } else {
              // Config exists but server not running
              statuses.set(ws.id, "unknown");
            }
          } catch {
            statuses.set(ws.id, "unknown");
          }
        }),
      );
      setAllWorkspaceStatuses(statuses);
    }

    void checkAllStatuses();

    // Re-check every 60 seconds
    const interval = setInterval(checkAllStatuses, 60000);

    // Re-check when app regains focus
    function handleVisibility() {
      if (document.visibilityState === "visible") void checkAllStatuses();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [ready, workspaces]);

  // Merge active workspace connection state with background checks
  const connectedWorkspaceIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, status] of allWorkspaceStatuses) {
      if (status === "connected") set.add(id);
    }
    // Active workspace: use live connection state (more accurate)
    if (active) {
      if (connectionStatus === "connected") set.add(active);
      else set.delete(active);
    }
    return set;
  }, [allWorkspaceStatuses, active, connectionStatus]);

  const errorWorkspaceIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, status] of allWorkspaceStatuses) {
      if (status === "error") set.add(id);
    }
    if (active) {
      if (connectionStatus === "error" || connectionStatus === "disconnected")
        set.add(active);
      else set.delete(active);
    }
    return set;
  }, [allWorkspaceStatuses, active, connectionStatus]);

  // ── Workspace info refresh ──────────────────────────────────────────────

  async function refreshWorkspaceInfo(id: string, serverInfo?: ServerInfo) {
    const entry = workspaces.find((w) => w.id === id);
    if (!entry) return;
    try {
      if (entry.type === "local") {
        const list = await discoverLocalInstances();
        const found = list.find((i) => i.id === id);
        if (
          found &&
          (found.name !== entry.name || found.directory !== entry.directory)
        ) {
          setWorkspaces((prev) =>
            prev.map((w) =>
              w.id === id
                ? {
                    ...w,
                    name: found.name ?? w.name,
                    directory: found.directory,
                  }
                : w,
            ),
          );
        }
      } else if (entry.type === "remote" && entry.host) {
        const token = serverInfo?.token ?? (await getKeychainToken(id));
        if (!token) return;
        const res = await fetch(`${entry.host}/api/v1/workspace`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const ws = (await res.json()) as { name?: string; directory?: string };
        if (ws.name !== entry.name || ws.directory !== entry.directory) {
          setWorkspaces((prev) =>
            prev.map((w) =>
              w.id === id
                ? {
                    ...w,
                    name: ws.name ?? w.name,
                    directory: ws.directory ?? w.directory,
                  }
                : w,
            ),
          );
        }
      }
    } catch {
      /* best-effort */
    }
  }

  // ── Load workspaces on mount ─────────────────────────────────────────────

  useEffect(() => {
    void loadWorkspaces().then(async (entries) => {
      if (entries.length > 0) setWorkspaces(entries);
      const sorted = [...entries].sort((a, b) => {
        if (a.lastActiveAt && b.lastActiveAt)
          return b.lastActiveAt.localeCompare(a.lastActiveAt);
        if (a.lastActiveAt) return -1;
        if (b.lastActiveAt) return 1;
        return 0;
      });
      const lastId = sorted.length > 0 ? sorted[0].id : null;
      if (lastId) setActive(lastId);
      setReady(true);
    });
  }, []);

  // Persist workspaces
  useEffect(() => {
    if (ready && workspaces.length > 0) void saveWorkspaces(workspaces);
  }, [workspaces, ready]);

  // Apply saved settings on mount
  useEffect(() => {
    void getAllSettings().then((settings) => {
      applyTheme(settings.theme);
      applyFontSize(settings.fontSize);
      if (!settings.devMode) {
        document.addEventListener("contextmenu", blockContextMenu);
      }
    });
    function blockContextMenu(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable
      )
        return;
      e.preventDefault();
    }
    function handleDevModeChange(e: Event) {
      const enabled = (e as CustomEvent).detail;
      if (enabled) {
        document.removeEventListener("contextmenu", blockContextMenu);
      } else {
        document.addEventListener("contextmenu", blockContextMenu);
      }
    }
    window.addEventListener("devmode-changed", handleDevModeChange);
    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      window.removeEventListener("devmode-changed", handleDevModeChange);
    };
  }, []);

  // Listen for open-settings custom event
  useEffect(() => {
    function handleOpenSettings(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.page) setSettingsPage(detail.page);
      else setSettingsPage("general");
      setShowSettings(true);
    }
    window.addEventListener("open-settings", handleOpenSettings);
    return () =>
      window.removeEventListener("open-settings", handleOpenSettings);
  }, []);

  function addWorkspace(entry: WorkspaceEntry): boolean {
    const existing = workspaces.find((w) => w.id === entry.id);
    if (existing) {
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === entry.id ? { ...w, ...entry } : w)),
      );
      setActive(entry.id);
      return false;
    }
    setWorkspaces((prev) => [...prev, entry]);
    setActive(entry.id);
    return true;
  }

  function addInstance(instanceId: string) {
    const existing = findWorkspace(instanceId);
    if (existing) {
      setActive(instanceId);
      return;
    }
    addWorkspace({
      id: instanceId,
      name: instanceId,
      directory: "",
      type: "local",
    });
  }

  function switchInstance(instanceId: string) {
    setActive(instanceId);
  }

  function removeInstance(instanceId: string) {
    setWorkspaces((prev) => prev.filter((w) => w.id !== instanceId));
    if (active === instanceId)
      setActive(workspaces.find((w) => w.id !== instanceId)?.id ?? null);
  }

  // ── Add workspace modal ─────────────────────────────────────────────────

  function handleAddWorkspace(entry: WorkspaceEntry) {
    const isNew = addWorkspace(entry);
    setShowAddWorkspace(false);
    // No explicit connect() here — useWorkspaceConnection watches workspace.host
    // and will trigger a fresh connection automatically after the state update renders.
    showToast({
      description: isNew
        ? `Workspace "${entry.name}" added.`
        : `Workspace "${entry.name}" already exists — info updated.`,
      variant: "success",
    });
  }

  function openAddWorkspaceModal(defaultTab: "local" | "remote" = "local") {
    setAddWorkspaceDefaultTab(defaultTab);
    setShowAddWorkspace(true);
  }

  function closeAddWorkspaceModal() {
    setShowAddWorkspace(false);
  }

  async function openFolderPicker() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (!selected || typeof selected !== "string") return;
      const existingMatch = workspaces.find((w) => w.directory === selected);
      if (existingMatch) {
        switchInstance(existingMatch.id);
        return;
      }
      const discovered = await discoverLocalInstances();
      const match = discovered.find((info) => info.directory === selected);
      if (match)
        addWorkspace({
          id: match.id,
          name: match.name ?? match.id,
          directory: match.directory,
          type: "local",
        });
      else
        showToast({
          description: `No OpenACP instance found in ${selected}. Run "openacp start" in that directory first.`,
        });
    } catch (e) {
      console.error("[openFolder] failed", e);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const hasInstance = active !== null;
  const isConnected = connectionStatus === "connected" && server !== null;
  const isError =
    connectionStatus === "error" || connectionStatus === "disconnected";
  const isLoading =
    connectionStatus === "connecting" || connectionStatus === "reconnecting";

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [browserPanelEnabled, setBrowserPanelEnabled] = useState(false);

  // Load browser panel setting
  useEffect(() => {
    void getAllSettings().then((settings) => {
      setBrowserPanelEnabled(settings.browserPanel);
    });
    function handleBrowserSettingChanged(e: Event) {
      setBrowserPanelEnabled((e as CustomEvent).detail);
    }
    window.addEventListener(
      "browser-panel-changed",
      handleBrowserSettingChanged,
    );
    return () =>
      window.removeEventListener(
        "browser-panel-changed",
        handleBrowserSettingChanged,
      );
  }, []);

  // Touch lastActiveAt when workspace has message activity
  useEffect(() => {
    function handleActivity() {
      if (active) touchLastActive(active);
    }
    window.addEventListener("workspace-activity", handleActivity);
    return () =>
      window.removeEventListener("workspace-activity", handleActivity);
  }, [active, touchLastActive]);

  // Listen for open-in-browser events (from link interceptor)
  const openBrowser = browser.open;
  useEffect(() => {
    function handleOpenInBrowser(e: Event) {
      const { url } = (e as CustomEvent).detail;
      if (!url) return;
      if (browserPanelEnabled) {
        void getSetting("browserLastMode").then((mode) =>
          openBrowser(url, undefined, mode),
        );
      } else {
        import("@tauri-apps/plugin-opener")
          .then(({ openUrl }) => openUrl(url))
          .catch(console.error);
      }
    }
    window.addEventListener("open-in-browser-panel", handleOpenInBrowser);
    return () =>
      window.removeEventListener("open-in-browser-panel", handleOpenInBrowser);
  }, [browserPanelEnabled, openBrowser]);

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      <Titlebar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        reviewOpen={reviewOpen}
        onToggleReview={() => setReviewOpen((v) => !v)}
        fileTreeOpen={fileTreeOpen}
        onToggleFileTree={() => setFileTreeOpen((v) => !v)}
        browserOpen={browser.isVisible}
        onToggleBrowser={() => {
          if (browser.isVisible) {
            void browser.close();
            return;
          }
          if (browser.url && /^https?:\/\//i.test(browser.url)) {
            // Reopen with last valid URL in the user's default mode
            void getSetting("browserLastMode").then((mode) => {
              void openBrowser(browser.url!, undefined, mode);
            });
          } else {
            // Fresh session — just show the empty panel; user types a URL
            browser.show();
          }
        }}
        terminalOpen={terminalOpen}
        onToggleTerminal={() => setTerminalOpen((v) => !v)}
        hideFileTree={activeWorkspace?.type === "remote"}
        hideBrowser={!browserPanelEnabled}
        hideTerminal={!hasInstance}
        disabled={!isConnected}
        notificationCount={unreadCount}
        notificationOpen={notifOpen}
        onNotificationOpenChange={setNotifOpen}
      />
      <div className="flex flex-1 min-h-0">
        <SidebarRail
          workspaces={sortedWorkspaces.map((w) => ({
            id: w.id,
            directory: w.directory,
            name: w.name,
            type: w.type,
            host: w.host,
            pinned: w.pinned,
            customName: w.customName,
          }))}
          activeId={active}
          connectedIds={connectedWorkspaceIds}
          errorIds={errorWorkspaceIds}
          pinnedIds={pinnedIds}
          onSwitchWorkspace={(id) => switchInstance(id)}
          onRemoveWorkspace={(id) => removeInstance(id)}
          onTogglePin={togglePin}
          onReorder={reorder}
          onRename={renameWorkspace}
          onShareWorkspace={() => setShareOpen(true)}
          onCopyShareLink={async (id) => {
            const link = shareLinks.get(id);
            if (link) {
              try {
                await navigator.clipboard.writeText(link);
                showToast({ description: "Share link copied" });
              } catch {
                showToast({ description: "Failed to copy" });
              }
            }
          }}
          onStopSharing={async (id) => {
            if (!connectionState.server) return;
            try {
              const { createApiClient } = await import("./api/client");
              const client = createApiClient(connectionState.server!);
              const tokens = await client.listTokens();
              await Promise.all(tokens.map((t) => client.revokeToken(t.id)));
              setSharingWorkspaceIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
              setShareLinks((prev) => {
                const next = new Map(prev);
                next.delete(id);
                return next;
              });
              showToast({
                description: "Stopped sharing — all tokens revoked",
              });
            } catch (e) {
              console.error("[stop-sharing]", e);
              showToast({ description: "Failed to revoke tokens" });
            }
          }}
          sharingIds={sharingWorkspaceIds}
          onReconnect={(id) => {
            const ws = workspaces.find((w) => w.id === id);
            if (ws?.type === "remote") {
              setReconnectWorkspaceId(id);
            } else {
              switchInstance(id);
            }
          }}
          onOpenFolder={() => openAddWorkspaceModal("local")}
          onOpenPlugins={() => setPluginsOpen(true)}
          onOpenSettings={() => {
            setSettingsPage("general");
            setShowSettings(true);
          }}
          hasUpdates={updateState.hasUpdates && !updatesSeen}
        />

        {hasInstance ? (
          isConnected ? (
            <WorkspaceProvider
              workspace={activeWorkspace!}
              server={server!}
              onReconnectNeeded={() => {
                // Trigger reconnection via the hook
                void connect();
              }}
              onTokenRefreshed={({ expiresAt, refreshDeadline }) => {
                if (!active) return;
                setWorkspaces((prev) =>
                  prev.map((w) =>
                    w.id === active ? { ...w, expiresAt, refreshDeadline } : w,
                  ),
                );
              }}
            >
              <TerminalProvider>
                <SessionsProvider>
                  <PermissionsProvider>
                    <ChatWithPermissions
                      sidebarCollapsed={sidebarCollapsed}
                      reviewOpen={reviewOpen}
                      onToggleReview={() => setReviewOpen((v) => !v)}
                      setReviewOpen={setReviewOpen}
                      fileTreeOpen={fileTreeOpen}
                      workspacePath={activeWorkspace?.directory ?? ""}
                      browserPanelEnabled={browserPanelEnabled}
                      terminalOpen={terminalOpen}
                      onCloseTerminal={() => setTerminalOpen(false)}
                    />
                  </PermissionsProvider>
                </SessionsProvider>
              </TerminalProvider>
              <PluginsModal
                open={pluginsOpen}
                onClose={() => setPluginsOpen(false)}
              />
              <ShareWorkspaceDialog
                open={shareOpen}
                onOpenChange={setShareOpen}
                onShared={(link) => {
                  if (active) {
                    setSharingWorkspaceIds(
                      (prev) => new Set([...prev, active]),
                    );
                    setShareLinks((prev) => new Map(prev).set(active, link));
                  }
                }}
              />
            </WorkspaceProvider>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-card">
              {isError ? (
                <NoServerScreen
                  directory={
                    activeWorkspace?.directory || activeWorkspace?.host || ""
                  }
                  isRemote={activeWorkspace?.type === "remote"}
                  errorMessage={connectionState.error}
                  onRemove={() => {
                    if (active) removeInstance(active);
                  }}
                  onReconnect={() => void connect()}
                  onStart={() => void startServer()}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="size-1.5 rounded-full bg-muted-foreground animate-pulse" />
                    {connectionStatus === "reconnecting"
                      ? `Reconnecting... (attempt ${connectionState.retryCount + 1})`
                      : "Connecting..."}
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          <WelcomeScreen
            onOpenFolder={openFolderPicker}
            onAddWorkspace={() => openAddWorkspaceModal("local")}
            onSelectWorkspace={(instanceId) => addInstance(instanceId)}
          />
        )}
      </div>
      {showAddWorkspace && (
        <AddWorkspaceModal
          onAdd={handleAddWorkspace}
          onClose={closeAddWorkspaceModal}
          existingWorkspaces={workspaces}
          defaultTab={addWorkspaceDefaultTab}
        />
      )}
      {reconnectWorkspaceId && (() => {
        const ws = workspaces.find((w) => w.id === reconnectWorkspaceId)
        if (!ws) return null
        return (
          <ReconnectDialog
            open
            workspace={ws}
            onReconnect={async (newHost) => {
              // Try health check with existing token at new URL
              const { getKeychainToken } = await import("./api/keychain")
              const token = await getKeychainToken(ws.id)
              if (!token) throw new Error("No token found — use a share link to re-authenticate")
              const res = await fetch(`${newHost}/api/v1/system/health`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(8000),
              })
              if (res.status === 401) throw new Error("401")
              if (!res.ok) throw new Error(`Server returned ${res.status}`)
              // Health check passed — update host and reconnect
              setWorkspaces((prev) =>
                prev.map((w) => w.id === reconnectWorkspaceId ? { ...w, host: newHost } : w),
              )
              setReconnectWorkspaceId(null)
              switchInstance(reconnectWorkspaceId)
            }}
            onFallbackToAdd={() => {
              setReconnectWorkspaceId(null)
              openAddWorkspaceModal("remote")
            }}
            onClose={() => setReconnectWorkspaceId(null)}
          />
        )
      })()}
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        workspacePath={activeWorkspace?.directory ?? ""}
        serverUrl={connectionState.server?.url ?? null}
        serverConnected={connectionStatus === "connected"}
        initialPage={settingsPage}
        onAboutViewed={() => setUpdatesSeen(true)}
      />
      <Toaster />
    </div>
  );
}
