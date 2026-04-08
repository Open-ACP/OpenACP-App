import React, { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { WorkspaceProvider, useWorkspace, resolveWorkspaceServer } from "./context/workspace";
import { SessionsProvider } from "./context/sessions";
import { ChatProvider, useChat } from "./context/chat";
import { PermissionsProvider, usePermissions } from "./context/permissions";
import { SidebarPanel } from "./components/sidebar";
import { SidebarRail } from "./components/sidebar-rail";
import { ChatView } from "./components/chat";
import { Composer } from "./components/composer";
import { WelcomeScreen } from "./components/welcome";
import { AddWorkspaceModal } from "./components/add-workspace/index";
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
import { SetupModal } from "./components/add-workspace/setup-modal";
import { showToast } from "./lib/toast";
import { Toaster } from "./components/ui/toaster";
import {
  getAllSettings,
  applyTheme,
  applyFontSize,
} from "./lib/settings-store";
import { Titlebar } from "./components/titlebar";
import { FileTreePanel } from "./components/file-tree-panel";
import type { ServerInfo } from "./types";

function NoServerScreen({ directory, isRemote, onStart, onReconnect, onRemove }: { directory: string; isRemote?: boolean; onStart: () => void; onReconnect: () => void; onRemove?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState<string | null>(null)

  const handleStart = async () => {
    setBusy(true)
    setAction("Starting...")
    await onStart()
    setBusy(false)
    setAction(null)
  }

  const handleReconnect = async () => {
    setBusy(true)
    setAction("Connecting...")
    await onReconnect()
    setBusy(false)
    setAction(null)
  }

  return (
    <div className="text-center flex flex-col items-center gap-5 max-w-xs">
      <div className="flex flex-col items-center gap-2">
        <div className="size-10 rounded-lg bg-secondary flex items-center justify-center mb-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01" />
          </svg>
        </div>
        <div className="text-sm font-medium text-foreground">
          {isRemote ? "Connection Lost" : "No Server Found"}
        </div>
        <div className="text-xs text-muted-foreground font-mono">{directory}</div>
        {isRemote && (
          <div className="text-xs text-muted-foreground">
            The host may have stopped sharing this workspace.
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
  )
}

function ChatArea() {
  const chat = useChat();
  return (
    <div className="flex flex-1 min-h-0 h-full min-w-0">
      <div className="@container relative flex-1 flex flex-col min-h-0 h-full bg-card min-w-0 border-l border-border-weak overflow-hidden">
        <ChatView />
        <div className="absolute inset-x-0 bottom-0 z-10">
          <Composer />
        </div>
      </div>
    </div>
  );
}

function ChatWithPermissions({ sidebarCollapsed, reviewOpen, onToggleReview, setReviewOpen, fileTreeOpen, workspacePath }: {
  sidebarCollapsed: boolean
  reviewOpen: boolean
  onToggleReview: () => void
  setReviewOpen: (open: boolean) => void
  fileTreeOpen: boolean
  workspacePath: string
}) {
  const permissions = usePermissions();
  const workspaceCtx = useWorkspace();
  const isRemote = workspaceCtx.workspace.type === "remote";
  const [openFiles, setOpenFiles] = useState<import("./components/review-panel").OpenFile[]>([]);
  const [requestedTab, setRequestedTab] = useState<string | null>(null);

  const handleOpenFile = useCallback((path: string, content: string, language: string) => {
    setOpenFiles(prev => {
      if (prev.some(f => f.path === path)) return prev
      return [...prev, { path, content, language }]
    })
    setRequestedTab(path)
    setReviewOpen(true)
  }, [setReviewOpen])

  const handleCloseFile = useCallback((path: string) => {
    setOpenFiles(prev => prev.filter(f => f.path !== path))
  }, [])

  // Listen for file open events from tool blocks in chat (local only)
  useEffect(() => {
    if (isRemote) return
    async function handleOpenFromChat(e: Event) {
      const { path } = (e as CustomEvent).detail
      if (!path || typeof path !== "string") return
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        const result = await invoke<{ content: string; language: string }>("read_file_content", { path })
        handleOpenFile(path, result.content, result.language)
      } catch (err) {
        console.error("[open-file-in-review] failed:", err)
      }
    }
    window.addEventListener("open-file-in-review", handleOpenFromChat)
    return () => window.removeEventListener("open-file-in-review", handleOpenFromChat)
  }, [handleOpenFile, isRemote])

  return (
    <ChatProvider
      onPermissionRequest={permissions.addRequest}
      onPermissionResolved={(e) => permissions.dismiss(e.sessionId)}
    >
      <SidebarPanel collapsed={sidebarCollapsed} />
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
            <ReviewPanel onClose={onToggleReview} openFiles={openFiles} onCloseFile={handleCloseFile} requestedTab={requestedTab} onRequestedTabHandled={() => setRequestedTab(null)} />
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
    </ChatProvider>
  );
}

export function OpenACPApp() {
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [server, setServer] = useState<ServerInfo | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [errorWorkspaceIds, setErrorWorkspaceIds] = useState<Set<string>>(
    new Set(),
  );
  const [connectedWorkspaceIds, setConnectedWorkspaceIds] = useState<Set<string>>(new Set());

  const [showAddWorkspace, setShowAddWorkspace] = useState(false);
  const [addWorkspaceDefaultTab, setAddWorkspaceDefaultTab] = useState<
    "local" | "remote"
  >("local");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("general");
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharingWorkspaceIds, setSharingWorkspaceIds] = useState<Set<string>>(new Set());
  const [shareLinks, setShareLinks] = useState<Map<string, string>>(new Map());
  const [setupInfo, setSetupInfo] = useState<{ path: string; instanceId: string } | null>(null);

  const retryRef = useRef<ReturnType<typeof setInterval>>();
  const retryCountRef = useRef(0);

  // ── Helpers ────────────────────────────────────────────────────────────

  const findWorkspace = useCallback(
    (id: string) => workspaces.find((w) => w.id === id),
    [workspaces],
  );

  // ── Workspace info refresh ──────────────────────────────────────────────

  async function refreshWorkspaceInfo(id: string) {
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
        const token = await getKeychainToken(id);
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
      // Keep all saved workspaces — don't filter by CLI discovery
      // resolveServer will handle connection per workspace
      if (entries.length > 0) setWorkspaces(entries);
      const lastId = entries.length > 0 ? entries[entries.length - 1].id : null;
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
      // Apply devMode: block right-click context menu unless enabled
      if (!settings.devMode) {
        document.addEventListener("contextmenu", blockContextMenu);
      }
    });
    function blockContextMenu(e: MouseEvent) {
      // Allow context menu on inputs/textareas
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
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

  // Listen for open-settings custom event (e.g. from Composer "Install agent...")
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
    setErrorWorkspaceIds((prev) => {
      const next = new Set(prev);
      next.delete(instanceId);
      return next;
    });
  }

  // ── Server connection ───────────────────────────────────────────────────

  const resolveServer = useCallback(
    async (instanceId: string): Promise<ServerInfo | null> => {
      setServerLoading(true);
      setServerError(false);
      try {
        const entry = findWorkspace(instanceId);
        let info: ServerInfo | null = null;
        if (!entry || entry.type === "local") {
          info = await resolveWorkspaceServer(instanceId, entry?.directory);
        } else {
          const jwt = await getKeychainToken(entry.id);
          if (!jwt) {
            setServerLoading(false);
            setServerError(true);
            return null;
          }
          info = { url: entry.host ?? "", token: jwt };
        }
        if (info) {
          try {
            const res = await fetch(`${info.url}/api/v1/system/health`, {
              headers: info.token ? { Authorization: `Bearer ${info.token}` } : {},
            });
            if (res.ok) {
              setServerLoading(false);
              setServerError(false);
              setErrorWorkspaceIds((prev) => {
                const next = new Set(prev);
                next.delete(instanceId);
                return next;
              });
              setConnectedWorkspaceIds((prev) => new Set([...prev, instanceId]));
              retryCountRef.current = 0;
              void refreshWorkspaceInfo(instanceId);
              return info;
            }
          } catch { /* health check failed */ }
        }
        setServerLoading(false);
        setServerError(true);
        setErrorWorkspaceIds((prev) => new Set([...prev, instanceId]));
        setConnectedWorkspaceIds((prev) => { const next = new Set(prev); next.delete(instanceId); return next });
        return null;
      } catch {
        setServerLoading(false);
        setServerError(true);
        setErrorWorkspaceIds((prev) => new Set([...prev, instanceId]));
        setConnectedWorkspaceIds((prev) => { const next = new Set(prev); next.delete(instanceId); return next });
        return null;
      }
    },
    [findWorkspace, workspaces],
  );

  const stopRetry = useCallback(() => {
    if (retryRef.current) {
      clearInterval(retryRef.current);
      retryRef.current = undefined;
    }
  }, []);

  const startRetry = useCallback(
    (instanceId: string) => {
      stopRetry();
      const interval = Math.min(3000 + retryCountRef.current * 1000, 10000);
      retryRef.current = setInterval(async () => {
        retryCountRef.current++;
        const info = await resolveServer(instanceId);
        if (info) {
          setServer(info);
          stopRetry();
        }
      }, interval);
    },
    [stopRetry, resolveServer],
  );

  // Keep refs to avoid stale closures while only re-running on active change
  const resolveServerRef = useRef(resolveServer);
  const startRetryRef = useRef(startRetry);
  const stopRetryRef = useRef(stopRetry);
  resolveServerRef.current = resolveServer;
  startRetryRef.current = startRetry;
  stopRetryRef.current = stopRetry;

  // React to active workspace changes
  useEffect(() => {
    stopRetryRef.current();
    setServer(null);
    if (!active) return;
    let cancelled = false;
    void resolveServerRef.current(active).then((info) => {
      if (cancelled) return;
      if (info) setServer(info);
      else startRetryRef.current(active);
    });
    return () => {
      cancelled = true;
      stopRetryRef.current();
    };
  }, [active]);

  // Visibility change
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === "visible" && active && !server) {
        const info = await resolveServer(active);
        if (info) {
          setServer(info);
          stopRetry();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [active, server, resolveServer, stopRetry]);

  // ── Add workspace modal ─────────────────────────────────────────────────

  async function handleAddWorkspace(entry: WorkspaceEntry) {
    const isNew = addWorkspace(entry);
    setShowAddWorkspace(false);
    if (!isNew && active === entry.id) {
      stopRetry();
      setServer(null);
      const info = await resolveServer(entry.id);
      if (info) setServer(info);
      else startRetry(entry.id);
    }
    showToast({
      description: isNew
        ? `Workspace "${entry.name}" added.`
        : `Workspace "${entry.name}" already exists -- info updated.`,
      variant: "success",
    });
  }

  function openAddWorkspaceModal(defaultTab: "local" | "remote" = "local") {
    stopRetry();
    setAddWorkspaceDefaultTab(defaultTab);
    setShowAddWorkspace(true);
  }

  function closeAddWorkspaceModal() {
    setShowAddWorkspace(false);
    if (active && !server) startRetry(active);
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
        window.alert(
          `No OpenACP instance found in ${selected}.\nRun "openacp start" in that directory first.`,
        );
    } catch (e) {
      console.error("[openFolder] failed", e);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const activeWorkspace = active ? (findWorkspace(active) ?? null) : null;
  const hasInstance = active !== null;
  const isConnected = server !== null;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [fileTreeOpen, setFileTreeOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground-weak select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      <Titlebar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        reviewOpen={reviewOpen}
        onToggleReview={() => setReviewOpen((v) => !v)}
        fileTreeOpen={fileTreeOpen}
        onToggleFileTree={() => setFileTreeOpen((v) => !v)}
        hideFileTree={activeWorkspace?.type === "remote"}
      />
      <div className="flex flex-1 min-h-0">
        <SidebarRail
          workspaces={workspaces.map((w) => ({ id: w.id, directory: w.directory, name: w.name, type: w.type }))}
          activeId={active}
          connectedIds={connectedWorkspaceIds}
          errorIds={errorWorkspaceIds}
          onSwitchWorkspace={(id) => switchInstance(id)}
          onRemoveWorkspace={(id) => removeInstance(id)}
          onShareWorkspace={() => setShareOpen(true)}
          onCopyShareLink={async (id) => {
            const link = shareLinks.get(id)
            if (link) {
              try {
                await navigator.clipboard.writeText(link)
                showToast({ description: "Share link copied" })
              } catch {
                showToast({ description: "Failed to copy" })
              }
            }
          }}
          onStopSharing={async (id) => {
            if (!server) return
            try {
              const { createApiClient } = await import("./api/client")
              const client = createApiClient(server)
              const tokens = await client.listTokens()
              await Promise.all(tokens.map(t => client.revokeToken(t.id)))
              setSharingWorkspaceIds(prev => { const next = new Set(prev); next.delete(id); return next })
              setShareLinks(prev => { const next = new Map(prev); next.delete(id); return next })
              showToast({ description: "Stopped sharing — all tokens revoked" })
            } catch (e) {
              console.error("[stop-sharing]", e)
              showToast({ description: "Failed to revoke tokens" })
            }
          }}
          sharingIds={sharingWorkspaceIds}
          onReconnect={(id) => { switchInstance(id); openAddWorkspaceModal("remote") }}
          onOpenFolder={() => openAddWorkspaceModal("local")}
          onOpenPlugins={() => setPluginsOpen(true)}
          onOpenSettings={() => {
            setSettingsPage("general");
            setShowSettings(true);
          }}
        />

        {hasInstance ? (
          isConnected ? (
            <WorkspaceProvider
              workspace={activeWorkspace!}
              server={server!}
              onReconnectNeeded={() => {
                setServer(null);
                setServerError(true);
                if (active)
                  setErrorWorkspaceIds((prev) => new Set([...prev, active]));
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
              <SessionsProvider>
                <PermissionsProvider>
                  <ChatWithPermissions
                    sidebarCollapsed={sidebarCollapsed}
                    reviewOpen={reviewOpen}
                    onToggleReview={() => setReviewOpen((v) => !v)}
                    setReviewOpen={setReviewOpen}
                    fileTreeOpen={fileTreeOpen}
                    workspacePath={activeWorkspace?.directory ?? ""}
                  />
                </PermissionsProvider>
              </SessionsProvider>
              <PluginsModal open={pluginsOpen} onClose={() => setPluginsOpen(false)} />
              <ShareWorkspaceDialog
                open={shareOpen}
                onOpenChange={setShareOpen}
                onShared={(link) => {
                  if (active) {
                    setSharingWorkspaceIds(prev => new Set([...prev, active]))
                    setShareLinks(prev => new Map(prev).set(active, link))
                  }
                }}
              />
            </WorkspaceProvider>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-card">
            {serverError ? (
              <NoServerScreen
                directory={activeWorkspace?.directory || activeWorkspace?.host || ""}
                isRemote={activeWorkspace?.type === "remote"}
                onRemove={() => { if (active) removeInstance(active) }}
                onReconnect={async () => {
                  if (!active) return
                  const info = await resolveServerRef.current(active)
                  if (info) {
                    setServer(info)
                    stopRetryRef.current()
                    showToast({ description: "Connected" })
                  } else {
                    showToast({ description: "Could not connect — is the server running?" })
                    startRetryRef.current(active)
                  }
                }}
                onStart={async () => {
                  if (!activeWorkspace?.directory || !active) return
                  try {
                    const { invoke } = await import("@tauri-apps/api/core")
                    await invoke<string>("invoke_cli", { args: ["start", "--dir", activeWorkspace.directory, "--daemon"] })
                    await new Promise(r => setTimeout(r, 2000))
                  } catch {
                    // "already running" or other error — either way try connecting
                  }
                  // Always try to connect after start attempt
                  const info = await resolveServerRef.current(active)
                  if (info) {
                    setServer(info)
                    stopRetryRef.current()
                    showToast({ description: "Server connected" })
                  } else {
                    showToast({ description: "Server starting — retrying..." })
                    startRetryRef.current(active)
                  }
                }}
              />
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="size-1.5 rounded-full bg-muted-foreground animate-pulse" />
                Connecting...
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
          onSetup={(path, instanceId) => {
            setShowAddWorkspace(false)
            setSetupInfo({ path, instanceId })
          }}
          onClose={closeAddWorkspaceModal}
          existingIds={workspaces.map((w) => w.id)}
          defaultTab={addWorkspaceDefaultTab}
        />
      )}
      {setupInfo && (
        <SetupModal
          open
          path={setupInfo.path}
          instanceId={setupInfo.instanceId}
          onComplete={(entry) => {
            setSetupInfo(null)
            addWorkspace(entry)
            showToast({ description: `Workspace "${entry.name}" ready.`, variant: "success" })
          }}
          onClose={() => setSetupInfo(null)}
        />
      )}
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        workspacePath={activeWorkspace?.directory ?? ""}
        serverUrl={server?.url ?? null}
        serverConnected={!!server}
        initialPage={settingsPage}
      />
      <Toaster />
    </div>
  );
}
