import { Sidebar, TextAlignLeft, FolderOpen, Globe } from "@phosphor-icons/react"

interface TitlebarProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  reviewOpen: boolean
  onToggleReview: () => void
  fileTreeOpen: boolean
  onToggleFileTree: () => void
  browserOpen: boolean
  onToggleBrowser: () => void
  hideFileTree?: boolean
  hideBrowser?: boolean
  disabled?: boolean
}

export function Titlebar({ sidebarCollapsed, onToggleSidebar, reviewOpen, onToggleReview, fileTreeOpen, onToggleFileTree, browserOpen, onToggleBrowser, hideFileTree, hideBrowser, disabled }: TitlebarProps) {
  const btnDisabled = disabled ? "opacity-30 pointer-events-none" : ""

  return (
    <header
      className="h-12 shrink-0 relative grid items-center border-b border-border-weak px-2"
      style={{ gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)" }}
      data-tauri-drag-region
    >
      {/* Left: traffic light spacer + sidebar toggle */}
      <div className="flex items-center min-w-0" data-tauri-drag-region>
        <div style={{ width: 80 }} className="shrink-0" data-tauri-drag-region />
        <button
          type="button"
          className={`oac-titlebar-btn ${btnDisabled}`}
          title={sidebarCollapsed ? "Show sessions" : "Hide sessions"}
          onClick={disabled ? undefined : onToggleSidebar}
        >
          <Sidebar size={18} />
        </button>
      </div>

      {/* Center: empty, draggable */}
      <div data-tauri-drag-region />

      {/* Right: Review + File Tree + Browser */}
      <div className="flex items-center justify-end gap-1 min-w-0 pr-1" data-tauri-drag-region>
        <button
          type="button"
          className={`oac-titlebar-btn ${reviewOpen ? "oac-titlebar-btn--active" : ""} ${btnDisabled}`}
          title="Review changes"
          onClick={disabled ? undefined : onToggleReview}
        >
          <TextAlignLeft size={18} />
        </button>
        {!hideFileTree && (
          <button
            type="button"
            className={`oac-titlebar-btn ${fileTreeOpen ? "oac-titlebar-btn--active" : ""} ${btnDisabled}`}
            title="File tree"
            onClick={disabled ? undefined : onToggleFileTree}
          >
            <FolderOpen size={18} />
          </button>
        )}
        {!hideBrowser && (
          <button
            type="button"
            className={`oac-titlebar-btn ${browserOpen ? "oac-titlebar-btn--active" : ""} ${btnDisabled}`}
            title="Browser"
            onClick={disabled ? undefined : onToggleBrowser}
          >
            <Globe size={18} />
          </button>
        )}
      </div>
    </header>
  )
}
