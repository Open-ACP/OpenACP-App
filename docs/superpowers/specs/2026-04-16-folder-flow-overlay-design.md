# Folder Flow Overlay — Design Spec

**Date:** 2026-04-16
**Status:** Approved
**Scope:** `OpenACP-App` only. No server change.

---

## Problem

In the **Add Workspace → Local** tab, after the user picks a folder the result panel (`BrowseResultView` / `RegisterExistingView` / `CreateInstance`) renders **inline below** the workspace list and the picker button, then scrolls into view.

Symptoms the user flagged:
1. The list of existing workspaces above stays interactive — the user can misclick a list item mid-flow.
2. The "Open a folder" button stays clickable — the user can start a second classification while the first one's result is still shown, leading to confusing state.
3. The panel appears in the same scroll context as the list, so the transition feels flat and the "now configure this folder" step is not visually distinct.

Net effect: the picked-folder flow has no focus. The user doesn't feel locked into a step.

## Goal

After a folder is picked, the classification/configuration step should **take over the tab body** with a right-to-left push animation, hiding the list and picker behind it. A back affordance slides it away to return to the list. The list is literally unmounted while the overlay is active, so misclicks are impossible.

## Non-goals

- No change to the **Remote** tab.
- No change to the outer `AddWorkspaceModal` (dialog shell, header, close button, Local/Remote tab strip).
- No change to the internals of `BrowseResultView`, `RegisterExistingView`, or `CreateInstance`. Only their mounting location and a new wrapper header.
- No new design tokens, no `DESIGN.md` update, no `ds-demo/registry.tsx` entry — this uses existing tokens and matches the existing animation spec already used elsewhere in the app.

## Affected files

- `src/openacp/components/add-workspace/local-tab.tsx` — refactor.
- `src/openacp/components/add-workspace/folder-flow-step.tsx` — **new**, wrapper for the picked-folder step.
- `src/openacp/components/add-workspace/local-tab.test.tsx` — **new**, vitest cases.

## Design

### 1. View state in `LocalTab`

Replace the current `browseResult` state with a single discriminated view:

```ts
type LocalTabView =
  | { step: 'list' }
  | { step: 'folder-flow'; result: ClassifyDirectoryResult }
```

`classifyDirectory()` in `workspace-service.ts:107-110` currently returns an inline anonymous union with no exported name. As part of this change, **export a named type** from `workspace-service.ts`:

```ts
export type ClassifyDirectoryResult =
  | { type: 'registered'; instance: InstanceListEntry }
  | { type: 'unregistered'; directory: string }
  | { type: 'new'; directory: string }
```

Update the `classifyDirectory()` return annotation to reference it. This is a zero-risk refactor (same structure, new name) and gives `FolderFlowStep` and the test file a real import to use.

Transitions:
- `handleBrowse()` on success: `setView({ step: 'folder-flow', result })`.
- `FolderFlowStep.onBack`: `setView({ step: 'list' })`.
- `onAdd` / `onSetup` success: bubbles up to `AddWorkspaceModal` which closes — no local transition needed.

The existing `browseResultRef` (declared at `local-tab.tsx:29`) and its `scrollIntoView` effect (`local-tab.tsx:31-35`) are **deleted**. The overlay obviates the need to scroll.

### 2. New component: `FolderFlowStep`

**File:** `src/openacp/components/add-workspace/folder-flow-step.tsx`

**Props:**
```ts
interface FolderFlowStepProps {
  result: ClassifyDirectoryResult
  instances: InstanceListEntry[]
  onAdd: (entry: WorkspaceEntry) => void
  onSetup?: (path: string, instanceId: string, instanceName: string) => void
  onBack: () => void
}
```

**`onSetup` signature note.** `CreateInstance.handleCreate()` already invokes `onSetup(path, instanceId, instanceName)` with 3 args (`create-instance.tsx:41`), but `LocalTabProps.onSetup` and `AddWorkspaceModalProps.onSetup` currently declare only 2 args (`local-tab.tsx:16`, `index.tsx:11`). This pre-existing inconsistency means the 3rd argument is silently dropped at the boundary today. As part of this change, **widen both** `LocalTabProps.onSetup` and `AddWorkspaceModalProps.onSetup` to the 3-arg form so `FolderFlowStep` can pass the name through cleanly. Whether the callers in `app.tsx` use the name is their choice; the type simply stops lying.

**Layout:**
- A header row at the top: `[← back button] {folderName}`.
  - Back button: `<button type="button" aria-label="Back to workspaces list">` with a `CaretLeft` phosphor icon (size 14).
  - Folder name: `result.directory.split('/').pop() ?? result.directory`, rendered in `text-sm font-medium text-foreground`.
  - Header row spacing: `px-0 py-0 mb-3`, flex row, gap-2. Uses the existing 4px grid.
- Body: reuses the existing `BrowseResultView`-derived rendering:
  - `result.type === 'registered'` → the same "Workspace found" card the current code renders.
  - `result.type === 'unregistered'` → the same `RegisterExistingView` card.
  - `result.type === 'new'` → the existing `CreateInstance` component.
- The existing "Back" button on the `registered` inline card and on `RegisterExistingView` is **removed** — it is redundant with the header back arrow. Correspondingly, the `onClose` prop on `RegisterExistingView` itself is dropped (nothing else consumes it once the button is gone).
- `CreateInstance.onClose` stays — it is still consumed internally (`create-instance.tsx:89,95`) for the `clone` / `new` → back to `choose` sub-step navigation — but in this new layout it's wired to `onBack` (returns the user to the list), matching the current behavior where the inner Back in `ActionButtons` already returns to the `choose` sub-step without calling `onClose`.

### 3. Animated container

In `LocalTab`, the body is wrapped:

```tsx
<div className="relative overflow-hidden">
  <AnimatePresence mode="popLayout" initial={false}>
    {view.step === 'list' ? (
      <motion.div
        key="list"
        initial={{ x: 0 }}
        animate={{ x: 0 }}
        exit={{ x: '-30%', opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* existing list + picker button */}
      </motion.div>
    ) : (
      <motion.div
        key="folder-flow"
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <FolderFlowStep ... />
      </motion.div>
    )}
  </AnimatePresence>
</div>
```

- `duration: 0.2, ease: [0.25, 0.1, 0.25, 1]` matches `src/openacp/components/sidebar.tsx:51` and `src/openacp/components/terminal-panel.tsx:58`.
- `mode="popLayout"` keeps the two panels from fighting for layout during the swap.
- `relative overflow-hidden` on the parent prevents the off-screen panel from bleeding into the modal's scroll area.

### 4. Reduced motion

Use `useReducedMotion()` from `motion/react`. When `true`:
- Replace the slide with a crossfade: `initial/animate/exit` only touches `opacity`, no `x`.
- `duration` drops to `0.08` for a near-instant swap.

### 5. Modal-level height

The dialog body currently uses `p-5 h-[28rem] overflow-y-auto` (`add-workspace/index.tsx:75`). Keep the fixed height; within `LocalTab`, the animated container fills it. The `overflow-hidden` wrapper above is **inside** that scroll area — each step can still scroll its own content independently. In practice:
- List step may scroll (long list of workspaces).
- Folder-flow step is short enough that it won't scroll in typical cases, but `CreateInstance` in `clone` mode with a long instance dropdown is fine because the Select portals out.

### 6. Tab switch behavior

Switching to the Remote tab while in `folder-flow` step resets `view` to `{ step: 'list' }`. Rationale: the user has explicitly left the Local flow; landing on Remote and then returning to Local mid-flow would be jarring. Implementation: `AddWorkspaceModal` already unmounts `LocalTab` on tab switch (the `{tab === 'local' ? <LocalTab /> : <RemoteTab />}` ternary), so `LocalTab`'s local state resets naturally — nothing to do.

### 7. Esc and modal-close

Esc and the modal's X button continue to close the whole `AddWorkspaceModal` regardless of which step the Local tab is on. Matches current behavior. No special handling in `FolderFlowStep`.

### 8. Focus management

- When `FolderFlowStep` mounts, move focus to the back button via a `useEffect` + `ref.current?.focus()`. Announce the step visually via the header; screen readers get the focus shift.
- When returning to the list (`onBack`), move focus back to the "Open a folder" button. Implementation: `LocalTab` keeps a `browseButtonRef`. When the view transitions from `folder-flow` to `list`, a `useEffect` watching `view.step` focuses that ref.

## State machine

```
         ┌─────────────────────────────────────────┐
         │                                         │
  [list] ─ handleBrowse success ─▶ [folder-flow]   │
         ◀── onBack ──────────────── (registered)  │
         ◀── onAdd success ─ closes modal          │
                                    (unregistered) │
         ◀── onAdd success ─ closes modal          │
                                    (new)          │
         ◀── onSetup success ─ closes modal        │
                              (opens setup modal)  │
```

Modal-level exits (Esc, X, Remote tab switch) unmount `LocalTab` entirely and reset from either state.

## Testing

**New file:** `src/openacp/components/add-workspace/local-tab.test.tsx`

Vitest + React Testing Library. Mocks: `@tauri-apps/plugin-dialog`, `../../api/workspace-service` (stub `listWorkspaces` and `classifyDirectory`).

Cases:
1. **Happy path, new folder** — stub `classifyDirectory` → `{ type: 'new', directory: '/tmp/foo' }`. Click "Choose a folder", await the transition, assert the folder-flow header shows "foo" and a back button, assert `CreateInstance`'s "Create new" / "Clone from existing" buttons are present.
2. **Back returns to list** — from case 1, click the back button, assert the list is visible again and the folder-flow step is gone.
3. **Unregistered folder shows RegisterExisting card** — stub `classifyDirectory` → `{ type: 'unregistered', directory: '/tmp/bar' }`. Assert the "Existing workspace detected" card is rendered inside the overlay with the header's back button present.
4. **Registered folder shows the Add card** — stub `classifyDirectory` → `{ type: 'registered', instance: {...} }`. Assert "Workspace found" card renders, clicking "Add workspace" fires `onAdd`.
5. **Reduced motion** — mock `matchMedia('(prefers-reduced-motion: reduce)')` to `true`, assert the component still renders correctly end-to-end (do not assert on exact style values; assert on functional behavior).
6. **List misclicks impossible during folder-flow** — after entering folder-flow, `queryByText('/* an existing workspace directory */')` from the list returns `null`. This is the core regression the change fixes.

No test for the animation timing itself (brittle) — the component contract is covered by mount/unmount assertions.

## Risks and trade-offs

- **Risk:** Dropping the inner "Back" buttons from `RegisteredView` / `RegisterExistingView` / `CreateInstance` changes a user-visible affordance. Mitigation: the header back arrow is always in the same spot and keyboard-focused on mount, which is a clearer pattern than a button tucked next to "Add".
- **Risk:** `AnimatePresence` with `mode="popLayout"` in a fixed-height container occasionally flashes during the first render if `initial={false}` isn't set. Mitigation: `initial={false}` on the `AnimatePresence`.
- **Trade-off:** The list-step's exit animation (`x: '-30%', opacity: 0`) means during the ~200ms slide the list is partially visible. Acceptable: it reinforces the push metaphor and 200ms is short. If the stacking looks wrong during review, fall back to a simple crossfade on the list side while keeping the slide-in on the folder-flow side.

## Acceptance criteria

1. Picking a folder triggers a right-to-left slide; the list and picker button are not in the DOM during the folder-flow step.
2. The header back arrow returns to the list with a left-to-right slide; focus lands on the "Open a folder" button.
3. All three classification outcomes (`registered`, `unregistered`, `new`) render inside the overlay with the same header.
4. Switching to Remote and back to Local resets the Local tab to the list step.
5. `prefers-reduced-motion` users get a crossfade instead of a slide.
6. New vitest cases pass; existing tests continue to pass.
7. No new design tokens introduced; existing token usage matches project rules (no hardcoded colors, no font-weight > 500, 4px grid).

## Out of scope / future

- Generalizing this "push step" pattern into a reusable component. Defer until a second caller needs it.
- Breadcrumb navigation inside `CreateInstance` (the internal `choose → clone/new` steps). Current "Back" in `ActionButtons` is sufficient; if it feels off after implementation, revisit.
