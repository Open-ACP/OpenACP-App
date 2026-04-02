import { createSignal } from "solid-js"
import { Dialog as Kobalte } from "@kobalte/core/dialog"
import { Tabs } from "@openacp/ui/tabs"
import { InstalledTab } from "./plugins-installed"
import { MarketplaceTab } from "./plugins-marketplace"
import { useWorkspace } from "../context/workspace"

interface Props {
  open: boolean
  onClose: () => void
}

export function PluginsModal(props: Props) {
  const workspace = useWorkspace()
  const [activeTab, setActiveTab] = createSignal<"installed" | "marketplace">("installed")

  return (
    <Kobalte
      modal
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <Kobalte.Portal>
        <Kobalte.Overlay class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" />
        <div class="fixed inset-0 z-50 flex items-center justify-center">
          <Kobalte.Content class="bg-background-weak w-[720px] max-h-[560px] flex flex-col rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div class="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-base">
              <Kobalte.Title as="h2" class="text-16-semibold text-text-strong">
                Plugins
              </Kobalte.Title>
              <Kobalte.CloseButton
                type="button"
                class="text-text-weak hover:text-text-base text-xl leading-none transition-colors"
                aria-label="Close"
              >
                &times;
              </Kobalte.CloseButton>
            </div>

            <Tabs
              value={activeTab()}
              onChange={setActiveTab}
              class="flex flex-col flex-1 min-h-0"
            >
              <Tabs.List class="shrink-0 px-4">
                <Tabs.Trigger value="installed">Installed</Tabs.Trigger>
                <Tabs.Trigger value="marketplace">Marketplace</Tabs.Trigger>
              </Tabs.List>

              <div class="flex-1 min-h-0 overflow-y-auto">
                <Tabs.Content value="installed">
                  <InstalledTab workspace={workspace} />
                </Tabs.Content>
                <Tabs.Content value="marketplace">
                  <MarketplaceTab workspace={workspace} />
                </Tabs.Content>
              </div>
            </Tabs>
          </Kobalte.Content>
        </div>
      </Kobalte.Portal>
    </Kobalte>
  )
}
