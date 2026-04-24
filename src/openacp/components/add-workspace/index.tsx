import React, { useState, useEffect } from "react";
import { X as XIcon } from "@phosphor-icons/react";
import { LocalTab } from "./local-tab";
import { RemoteTab } from "./remote-tab";
import type { WorkspaceEntry } from "../../api/workspace-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { prefetchAgentsList } from "./use-agents-list";

interface AddWorkspaceModalProps {
  onAdd: (entry: WorkspaceEntry) => void;
  onClose: () => void;
  existingWorkspaces: WorkspaceEntry[];
  defaultTab?: "local" | "remote";
}

export function AddWorkspaceModal(props: AddWorkspaceModalProps) {
  const [tab, setTab] = useState<"local" | "remote">(
    props.defaultTab ?? "local",
  );

  useEffect(() => {
    prefetchAgentsList()
  }, []);

  // Derive IDs for LocalTab; RemoteTab needs the full entries for silent re-linking
  const existingIds = props.existingWorkspaces.map((w) => w.id);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent
        className="bg-card w-full sm:max-w-lg rounded-xl p-0 overflow-hidden gap-0 border-border-weak"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        {/* Visually hidden title for screen reader accessibility */}
        <DialogTitle className="sr-only">Add Workspace</DialogTitle>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-weak">
          <span className="text-sm font-medium text-foreground">Add Workspace</span>
          <button
            onClick={props.onClose}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <XIcon size={14} />
          </button>
        </div>

        {/* Tabs — every tab carries a 2px bottom border (active = foreground, inactive = weak),
            so the underline is one continuous line across both halves with no height jump. */}
        <div className="flex">
          <button
            className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === "local"
                ? "text-foreground border-foreground"
                : "text-muted-foreground border-border-weak hover:text-foreground"
            }`}
            onClick={() => setTab("local")}
          >
            Local
          </button>
          <button
            className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === "remote"
                ? "text-foreground border-foreground"
                : "text-muted-foreground border-border-weak hover:text-foreground"
            }`}
            onClick={() => setTab("remote")}
          >
            Remote
          </button>
        </div>

        {/* Content */}
        <div className="p-5 h-[28rem] overflow-y-auto">
          {tab === "local" ? (
            <LocalTab onAdd={props.onAdd} existingIds={existingIds} />
          ) : (
            <RemoteTab onAdd={props.onAdd} existingWorkspaces={props.existingWorkspaces} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
