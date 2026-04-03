import React, { useState } from "react"
import { createPortal } from "react-dom"
import { InstalledTab } from "./plugins-installed"
import { MarketplaceTab } from "./plugins-marketplace"
import { useWorkspace } from "../context/workspace"

interface Props { open: boolean; onClose: () => void }

export function PluginsModal(props: Props) {
  const workspace = useWorkspace()
  const [activeTab, setActiveTab] = useState<"installed" | "marketplace">("installed")

  if (!props.open) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={props.onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="bg-background-weak w-[720px] max-h-[560px] flex flex-col rounded-xl shadow-2xl overflow-hidden pointer-events-auto">
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-base">
            <h2 className="text-16-semibold text-text-strong">Plugins</h2>
            <button type="button" className="text-text-weak hover:text-text-base text-xl leading-none transition-colors" aria-label="Close" onClick={props.onClose}>&times;</button>
          </div>
          <div className="flex border-b border-border-base px-4">
            <button className={`px-4 py-2.5 text-14-medium border-b-2 transition-colors ${activeTab === "installed" ? "border-text-base text-text-base" : "border-transparent text-text-weak hover:text-text-base"}`} onClick={() => setActiveTab("installed")}>Installed</button>
            <button className={`px-4 py-2.5 text-14-medium border-b-2 transition-colors ${activeTab === "marketplace" ? "border-text-base text-text-base" : "border-transparent text-text-weak hover:text-text-base"}`} onClick={() => setActiveTab("marketplace")}>Marketplace</button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === "installed" ? <InstalledTab workspace={workspace} /> : <MarketplaceTab workspace={workspace} />}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
