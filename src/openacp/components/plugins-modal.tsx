import React, { useState } from "react"
import { InstalledTab } from "./plugins-installed"
import { MarketplaceTab } from "./plugins-marketplace"
import { useWorkspace } from "../context/workspace"
import { Dialog, DialogContent } from "./ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs"
import { Button } from "./ui/button"

interface Props { open: boolean; onClose: () => void }

export function PluginsModal(props: Props) {
  const workspace = useWorkspace()
  const [activeTab, setActiveTab] = useState<"installed" | "marketplace">("installed")

  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="bg-background-weak w-[720px] max-w-[720px] max-h-[560px] flex flex-col p-0 gap-0 overflow-hidden"
      >
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold leading-xl tracking-tight text-foreground">Plugins</h2>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground-weak" aria-label="Close" onClick={props.onClose}>&times;</Button>
        </div>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "installed" | "marketplace")} className="flex flex-col flex-1 min-h-0 gap-0">
          <TabsList variant="line" className="shrink-0 border-b border-border px-4 w-full justify-start h-auto rounded-none p-0">
            <TabsTrigger value="installed" className="text-base font-medium leading-lg px-4 py-2.5">Installed</TabsTrigger>
            <TabsTrigger value="marketplace" className="text-base font-medium leading-lg px-4 py-2.5">Marketplace</TabsTrigger>
          </TabsList>
          <TabsContent value="installed" className="flex-1 min-h-0 overflow-y-auto">
            <InstalledTab workspace={workspace} />
          </TabsContent>
          <TabsContent value="marketplace" className="flex-1 min-h-0 overflow-y-auto">
            <MarketplaceTab workspace={workspace} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
