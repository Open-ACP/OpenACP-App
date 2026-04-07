import React, { useState } from "react";
import { X as XIcon } from "@phosphor-icons/react";
import { LocalTab } from "./local-tab";
import { RemoteTab } from "./remote-tab";
import type { WorkspaceEntry } from "../../api/workspace-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";

interface AddWorkspaceModalProps {
  onAdd: (entry: WorkspaceEntry) => void;
  onSetup?: (path: string, instanceId: string) => void;
  onClose: () => void;
  existingIds: string[];
  defaultTab?: "local" | "remote";
}

export function AddWorkspaceModal(props: AddWorkspaceModalProps) {
  const [tab, setTab] = useState<"local" | "remote">(
    props.defaultTab ?? "local",
  );

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
      >
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

        {/* Tabs */}
        <div className="flex border-b border-border-weak">
          <button
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === "local"
                ? "text-foreground border-b-2 border-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("local")}
          >
            Local
          </button>
          <button
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === "remote"
                ? "text-foreground border-b-2 border-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab("remote")}
          >
            Remote
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {tab === "local" ? (
            <LocalTab onAdd={props.onAdd} onSetup={props.onSetup} existingIds={props.existingIds} />
          ) : (
            <RemoteTab onAdd={props.onAdd} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
