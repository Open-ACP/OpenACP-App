import React, { useState } from "react";
import { GearSix, Palette, Robot, Desktop, Info } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { VisuallyHidden } from "radix-ui";
import { SettingsGeneral } from "./settings-general";
import { SettingsAppearance } from "./settings-appearance";
import { SettingsAgents } from "./settings-agents";
import { SettingsServer } from "./settings-server";
import { SettingsAbout } from "./settings-about";

export type SettingsPage =
  | "general"
  | "appearance"
  | "agents"
  | "server"
  | "about";

const APP_VERSION = __APP_VERSION__;
declare const __APP_VERSION__: string;

interface NavGroup {
  label: string;
  items: { id: SettingsPage; label: string; icon: React.ElementType }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "App",
    items: [
      { id: "general", label: "General", icon: GearSix },
      { id: "appearance", label: "Appearance", icon: Palette },
    ],
  },
  {
    label: "Server",
    items: [
      { id: "agents", label: "Agents", icon: Robot },
      { id: "server", label: "Server", icon: Desktop },
    ],
  },
  {
    label: "Info",
    items: [{ id: "about", label: "About", icon: Info }],
  },
];

export function SettingsDialog({
  open,
  onOpenChange,
  workspacePath,
  serverUrl,
  serverConnected,
  initialPage = "general",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspacePath: string;
  serverUrl: string | null;
  serverConnected: boolean;
  initialPage?: SettingsPage;
}) {
  const [page, setPage] = useState<SettingsPage>(initialPage);

  // Sync initialPage when dialog opens with a different page
  React.useEffect(() => {
    if (open) setPage(initialPage);
  }, [open, initialPage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[90vw] max-w-[900px] sm:max-w-[900px] h-[80vh] max-h-[640px] p-0 gap-0 overflow-hidden flex flex-row bg-card"
      >
        <VisuallyHidden.Root>
          <DialogTitle>Settings</DialogTitle>
        </VisuallyHidden.Root>

        {/* Sidebar */}
        <div className="w-50 shrink-0 bg-background-base border-r border-border-weak flex flex-col px-3 py-4">
          <nav className="flex flex-col gap-1 flex-1">
            {NAV_GROUPS.map((group, gi) => (
              <div key={group.label} className={gi > 0 ? "mt-4" : ""}>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1 block">
                  {group.label}
                </span>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = page === item.id;
                  return (
                    <button
                      key={item.id}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-md text-sm transition-colors ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                      }`}
                      onClick={() => setPage(item.id)}
                    >
                      <Icon size={18} weight={isActive ? "fill" : "regular"} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <span className="text-xs text-muted-foreground px-2">
            {APP_VERSION}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto px-8 py-6">
            {page === "general" && (
              <SettingsGeneral workspacePath={workspacePath} />
            )}
            {page === "appearance" && <SettingsAppearance />}
            {page === "agents" && (
              <SettingsAgents workspacePath={workspacePath} />
            )}
            {page === "server" && (
              <SettingsServer
                serverUrl={serverUrl}
                connected={serverConnected}
              />
            )}
            {page === "about" && <SettingsAbout />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
