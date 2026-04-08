import React, { useState } from "react";
import { X as XIcon } from "@phosphor-icons/react";
import { InstalledTab } from "./plugins-installed";
import { MarketplaceTab } from "./plugins-marketplace";
import { useWorkspace } from "../context/workspace";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PluginsModal(props: Props) {
  const workspace = useWorkspace();
  const [activeTab, setActiveTab] = useState<"installed" | "marketplace">(
    "installed",
  );

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="bg-card w-[720px] max-w-[720px] max-h-[560px] flex flex-col p-0 gap-0 overflow-hidden"
      >
        <DialogHeader className="shrink-0 flex flex-row items-center justify-between px-6 py-3 border-b border-border-weak gap-0">
          <DialogTitle>Plugins</DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={props.onClose}
          >
            <XIcon />
          </Button>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "installed" | "marketplace")}
          className="flex flex-col flex-1 min-h-0 gap-0"
        >
          <TabsList
            variant="line"
            className="shrink-0 border-b border-border-weak px-4 w-full justify-start h-auto rounded-none p-0"
          >
            <TabsTrigger
              value="installed"
              className="text-base font-medium leading-normal px-4 py-2.5"
            >
              Installed
            </TabsTrigger>
            <TabsTrigger
              value="marketplace"
              className="text-base font-medium leading-normal px-4 py-2.5"
            >
              Marketplace
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="installed"
            className="flex-1 min-h-0 overflow-y-auto"
          >
            <InstalledTab workspace={workspace} />
          </TabsContent>
          <TabsContent
            value="marketplace"
            className="flex-1 min-h-0 overflow-y-auto"
          >
            <MarketplaceTab workspace={workspace} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
