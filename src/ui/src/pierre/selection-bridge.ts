export const previewSelectedLines = (..._: any[]) => {}
export const cloneSelectedLineRange = (range: any) => range ? { ...range } : undefined
export const formatSelectedLineLabel = (..._: any[]) => ""
export const lineInSelectedRange = (..._: any[]) => false
export const createLineNumberSelectionBridge = () => ({ onPointerDown: () => {}, onPointerMove: () => {}, onPointerUp: () => {} })
export const restoreShadowTextSelection = (..._: any[]) => {}
