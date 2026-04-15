/**
 * Invisible drag region for onboarding screens (no titlebar).
 * Allows the user to pan/move the window by dragging the top area.
 */
export function WindowDragBar() {
  return (
    <div
      data-tauri-drag-region
      className="fixed top-0 left-0 right-0 z-50 h-8"
    />
  )
}
