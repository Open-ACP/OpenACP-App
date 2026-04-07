import { Sidebar, TextAlignLeft, FolderOpen } from "@phosphor-icons/react"

interface TitlebarProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  reviewOpen: boolean
  onToggleReview: () => void
  fileTreeOpen: boolean
  onToggleFileTree: () => void
}

export function Titlebar({ sidebarCollapsed, onToggleSidebar, reviewOpen, onToggleReview, fileTreeOpen, onToggleFileTree }: TitlebarProps) {
  return (
    <header
      className="h-12 shrink-0 relative grid items-center border-b border-border-weak px-2"
      style={{ gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)" }}
      data-tauri-drag-region
    >
      {/* Left: traffic light spacer + sidebar toggle */}
      <div className="flex items-center min-w-0">
        <div style={{ width: 80 }} className="shrink-0" />
        <button
          type="button"
          className="oac-titlebar-btn"
          title={sidebarCollapsed ? "Show sessions" : "Hide sessions"}
          onClick={onToggleSidebar}
        >
          <Sidebar size={18} />
        </button>
      </div>

      {/* Center: empty, draggable */}
      <div />

      {/* Right: Review + File Tree */}
      <div className="flex items-center justify-end gap-0.5 min-w-0 pr-1" data-tauri-drag-region>
        <button
          type="button"
          className={`oac-titlebar-btn ${reviewOpen ? "oac-titlebar-btn--active" : ""}`}
          title="Review changes"
          onClick={onToggleReview}
        >
          <TextAlignLeft size={18} />
        </button>
        <button
          type="button"
          className={`oac-titlebar-btn ${fileTreeOpen ? "oac-titlebar-btn--active" : ""}`}
          title="File tree"
          onClick={onToggleFileTree}
        >
          <FolderOpen size={18} />
        </button>
      </div>
    </header>
  )
}
