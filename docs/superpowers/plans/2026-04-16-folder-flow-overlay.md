# Folder Flow Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Add Workspace → Local tab "choose a folder" flow take over the tab body as a sliding overlay step, so the workspace list and picker are unmounted mid-flow and users can't misclick into them.

**Architecture:** `LocalTab` becomes a two-view component (`list` / `folder-flow`). When a folder is classified, a new `FolderFlowStep` wrapper slides in right-to-left via `motion/react` `AnimatePresence`, hosting the existing `BrowseResultView` / `RegisterExistingView` / `CreateInstance` rendering plus a single header with a back arrow and folder name. The back arrow slides the overlay out and restores the list. Reduced-motion users get a crossfade.

**Spec:** `docs/superpowers/specs/2026-04-16-folder-flow-overlay-design.md`

**Tech Stack:** React 19, TypeScript, Tailwind 4, motion/react 12, vitest 4, phosphor icons, shadcn primitives

**Branch:** `feat/folder-flow-overlay` — this is a UI change on `OpenACP-App`. Do not commit directly to `main`; open a PR when done (see Task 8).

---

## Pre-flight

Before Task 1, make sure you're on a feature branch:

```bash
cd OpenACP-App
git switch -c feat/folder-flow-overlay
git status  # should be clean relative to main, plus any WIP you carry in
```

If there are unrelated uncommitted changes in `add-workspace/` or elsewhere from previous work, stash or commit them on their own branch before starting — this plan touches those files.

---

### Task 1: Bootstrap DOM testing infrastructure

The project has `vitest` wired for pure-Node tests (`src/onboarding/__tests__/startup.test.ts`), but no jsdom and no React Testing Library. The plan's TDD needs DOM rendering. One-time infra cost.

**Files:**
- Modify: `OpenACP-App/package.json`
- Modify: `OpenACP-App/vite.config.ts`
- Create: `OpenACP-App/src/test/setup.ts`

- [ ] **Step 1: Add dev dependencies**

Run:

```bash
cd OpenACP-App
pnpm add -D jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Expected: `package.json` devDependencies now contains the four new entries. `pnpm-lock.yaml` updates.

- [ ] **Step 2: Create the test setup file**

Create `OpenACP-App/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 3: Point vitest at jsdom globally**

In `OpenACP-App/vite.config.ts`, replace the existing `test:` block:

```ts
  test: {
    environment: "node",
  },
```

with:

```ts
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
```

**Note on vitest 4:** The older `environmentMatchGlobs` key was removed in vitest 4. To keep the existing `startup.test.ts` running under the Node environment (it was written against Node), use a per-file docblock override (next step).

- [ ] **Step 4: Pin the existing Node-only test to the `node` environment via docblock**

At the very top of `src/onboarding/__tests__/startup.test.ts`, above the `import` lines, add a docblock comment:

```ts
/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
// ...rest unchanged
```

This is vitest 4's supported mechanism for per-file environment overrides.

- [ ] **Step 5: Verify the existing test still passes**

Run:

```bash
pnpm test -- src/onboarding/__tests__/startup.test.ts
```

Expected: `startup.test.ts` passes (3 passed, 0 failed), running under the `node` environment.

- [ ] **Step 6: Smoke-test jsdom by running the whole suite**

Run:

```bash
pnpm test
```

Expected: 3 passed, 0 failed (only `startup.test.ts` exists today). No jsdom-related errors.

- [ ] **Step 7: Commit**

```bash
git add OpenACP-App/package.json OpenACP-App/pnpm-lock.yaml OpenACP-App/vite.config.ts OpenACP-App/src/test/setup.ts OpenACP-App/src/onboarding/__tests__/startup.test.ts
git commit -m "test: bootstrap jsdom + react-testing-library for component tests"
```

---

### Task 2: Type-level cleanup (export `ClassifyDirectoryResult`, widen `onSetup`)

Small, mechanical, type-only. Done in one task because they're tightly coupled and each of them is a one-line change.

**Files:**
- Modify: `OpenACP-App/src/openacp/api/workspace-service.ts:103-110`
- Modify: `OpenACP-App/src/openacp/components/add-workspace/local-tab.tsx:14-18` (the `LocalTabProps` interface)
- Modify: `OpenACP-App/src/openacp/components/add-workspace/index.tsx:9-15` (the `AddWorkspaceModalProps` interface)

- [ ] **Step 1: Export `ClassifyDirectoryResult`**

In `src/openacp/api/workspace-service.ts`, above `classifyDirectory()` (just before line 107), add:

```ts
export type ClassifyDirectoryResult =
  | { type: 'registered'; instance: InstanceListEntry }
  | { type: 'unregistered'; directory: string }
  | { type: 'new'; directory: string }
```

Then change the `classifyDirectory()` return annotation from the inline union to `Promise<ClassifyDirectoryResult>`.

- [ ] **Step 2: Widen `LocalTabProps.onSetup`**

In `src/openacp/components/add-workspace/local-tab.tsx`, change:

```ts
  onSetup?: (path: string, instanceId: string) => void
```

to:

```ts
  onSetup?: (path: string, instanceId: string, instanceName: string) => void
```

- [ ] **Step 3: Widen `AddWorkspaceModalProps.onSetup`**

In `src/openacp/components/add-workspace/index.tsx`, change:

```ts
  onSetup?: (path: string, instanceId: string) => void
```

to:

```ts
  onSetup?: (path: string, instanceId: string, instanceName: string) => void
```

Note: the call site at `src/openacp/app.tsx:1087` already passes a 3-arg callback (`(path, instanceId, instanceName) => {...}`), so no change is needed there.

- [ ] **Step 4: Run type-check**

```bash
make lint
```

Expected: 0 TS errors.

- [ ] **Step 5: Commit**

```bash
git add src/openacp/api/workspace-service.ts src/openacp/components/add-workspace/local-tab.tsx src/openacp/components/add-workspace/index.tsx
git commit -m "refactor(add-workspace): export ClassifyDirectoryResult, widen onSetup to 3 args"
```

---

### Task 3: Build `FolderFlowStep` component (TDD)

This is the new overlay-body wrapper that hosts the header + the three result renderings. Built in isolation so its contract is crisp before we wire it into `LocalTab`.

**Files:**
- Create: `OpenACP-App/src/openacp/components/add-workspace/folder-flow-step.tsx`
- Create: `OpenACP-App/src/openacp/components/add-workspace/folder-flow-step.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `folder-flow-step.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FolderFlowStep } from "./folder-flow-step"
import type { InstanceListEntry } from "../../api/workspace-store"

const instances: InstanceListEntry[] = []

describe("FolderFlowStep", () => {
  it("renders the folder name in the header", () => {
    render(
      <FolderFlowStep
        result={{ type: "new", directory: "/tmp/demo" }}
        instances={instances}
        onAdd={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByText("demo")).toBeInTheDocument()
  })

  it("exposes a back button with a descriptive aria-label", () => {
    render(
      <FolderFlowStep
        result={{ type: "new", directory: "/tmp/demo" }}
        instances={instances}
        onAdd={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(
      screen.getByRole("button", { name: /back to workspaces list/i }),
    ).toBeInTheDocument()
  })

  it("calls onBack when the back button is clicked", async () => {
    const onBack = vi.fn()
    render(
      <FolderFlowStep
        result={{ type: "new", directory: "/tmp/demo" }}
        instances={instances}
        onAdd={vi.fn()}
        onBack={onBack}
      />,
    )
    await userEvent.click(
      screen.getByRole("button", { name: /back to workspaces list/i }),
    )
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it("renders the 'Workspace found' card for a registered result", () => {
    const inst = { id: "abc", name: "demo-ws", directory: "/tmp/demo", status: "stopped" } as InstanceListEntry
    render(
      <FolderFlowStep
        result={{ type: "registered", instance: inst }}
        instances={[inst]}
        onAdd={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByText(/workspace found/i)).toBeInTheDocument()
  })

  it("renders the 'Existing workspace detected' card for unregistered", () => {
    render(
      <FolderFlowStep
        result={{ type: "unregistered", directory: "/tmp/demo" }}
        instances={instances}
        onAdd={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByText(/existing workspace detected/i)).toBeInTheDocument()
  })

  it("renders CreateInstance for a new result", () => {
    render(
      <FolderFlowStep
        result={{ type: "new", directory: "/tmp/demo" }}
        instances={instances}
        onAdd={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    // CreateInstance shows the "Create new" option in its choose sub-step
    expect(screen.getByText(/create new/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm test -- folder-flow-step
```

Expected: all 6 FAIL with "Cannot find module ./folder-flow-step".

- [ ] **Step 3: Implement `FolderFlowStep`**

Create `folder-flow-step.tsx`:

```tsx
import React, { useState } from "react"
import { CaretLeft } from "@phosphor-icons/react"
import type { ClassifyDirectoryResult } from "../../api/workspace-service"
import type { InstanceListEntry, WorkspaceEntry } from "../../api/workspace-store"
import {
  registerWorkspace,
  WorkspaceServiceError,
} from "../../api/workspace-service"
import { CreateInstance } from "./create-instance"
import { Button } from "../ui/button"

interface FolderFlowStepProps {
  result: ClassifyDirectoryResult
  instances: InstanceListEntry[]
  onAdd: (entry: WorkspaceEntry) => void
  onSetup?: (path: string, instanceId: string, instanceName: string) => void
  onBack: () => void
}

export function FolderFlowStep(props: FolderFlowStepProps) {
  const folderName = directoryOf(props.result).split("/").pop() ?? directoryOf(props.result)

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          aria-label="Back to workspaces list"
          onClick={props.onBack}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <CaretLeft size={14} />
        </button>
        <span className="text-sm font-medium text-foreground truncate">{folderName}</span>
      </div>
      <Body {...props} />
    </div>
  )
}

function directoryOf(result: ClassifyDirectoryResult): string {
  return result.type === "registered" ? result.instance.directory : result.directory
}

function Body(props: FolderFlowStepProps) {
  const { result } = props
  if (result.type === "registered") {
    const inst = result.instance
    return (
      <div className="p-4 bg-secondary rounded-xl border border-border space-y-3">
        <div>
          <p className="text-md-medium text-foreground mb-1">Workspace found</p>
          <p className="text-sm-regular text-muted-foreground">
            This folder is already set up as <strong className="text-fg-weak">{inst.name ?? inst.id}</strong>. Click Add to open it here.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => props.onAdd({ id: inst.id, name: inst.name ?? inst.id, directory: inst.directory, type: "local" })}
          className="px-4 py-1.5 text-sm-medium h-auto"
        >
          Add workspace
        </Button>
      </div>
    )
  }
  if (result.type === "unregistered") {
    return <RegisterExistingView path={result.directory} onAdd={props.onAdd} />
  }
  return (
    <CreateInstance
      path={result.directory}
      existingInstances={props.instances}
      onAdd={props.onAdd}
      onSetup={props.onSetup}
      onClose={props.onBack}
    />
  )
}

function RegisterExistingView(props: {
  path: string
  onAdd: (e: WorkspaceEntry) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function register() {
    setLoading(true)
    setError(null)
    try {
      const entry = await registerWorkspace(props.path)
      props.onAdd(entry)
    } catch (e) {
      if (e instanceof WorkspaceServiceError) setError(e.message)
      else setError(typeof e === "string" ? e : "Failed to add workspace")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 bg-secondary rounded-xl border border-border space-y-3">
      <div>
        <p className="text-md-medium text-foreground mb-1">Existing workspace detected</p>
        <p className="text-sm-regular text-muted-foreground">
          This folder already has an OpenACP workspace. Click Add to register it.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={register}
          disabled={loading}
          className="px-4 py-1.5 text-sm-medium h-auto"
        >
          {loading ? "Adding..." : "Add workspace"}
        </Button>
        {error && <p className="text-sm-regular text-destructive">{error}</p>}
      </div>
    </div>
  )
}
```

Key differences from the existing `BrowseResultView` + `RegisterExistingView` in `local-tab.tsx`:
- Inline "Back" buttons on the `registered` card and `RegisterExistingView` are **dropped** (header back arrow replaces them).
- `RegisterExistingView` no longer takes an `onClose` prop — nothing consumes it now that the Back button is gone.
- `CreateInstance.onClose` is wired to `onBack` so the existing internal `choose → clone/new` sub-step navigation still works — but if an unrelated caller ever routes `onClose` at the result-panel level, it now exits to the list, not nowhere.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm test -- folder-flow-step
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/openacp/components/add-workspace/folder-flow-step.tsx src/openacp/components/add-workspace/folder-flow-step.test.tsx
git commit -m "feat(add-workspace): add FolderFlowStep overlay component"
```

---

### Task 4: Refactor `LocalTab` to use the view state + animated container (TDD)

This is the heart of the change. Replaces the inline `browseResult` + `BrowseResultView` render with a discriminated view + `AnimatePresence` hosting either the list or the `FolderFlowStep`. Removes the old `BrowseResultView`, `RegisterExistingView`, `browseResultRef`, and `scrollIntoView` effect.

**Files:**
- Modify: `OpenACP-App/src/openacp/components/add-workspace/local-tab.tsx` (whole file refactor — see below)
- Create: `OpenACP-App/src/openacp/components/add-workspace/local-tab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `local-tab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LocalTab } from "./local-tab"
import type { InstanceListEntry } from "../../api/workspace-store"

// Mocks
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}))
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))
vi.mock("../../api/workspace-service", () => ({
  listWorkspaces: vi.fn(),
  classifyDirectory: vi.fn(),
  registerWorkspace: vi.fn(),
  createWorkspace: vi.fn(),
  startWorkspaceServer: vi.fn(),
  WorkspaceServiceError: class extends Error {},
}))

import { open as openDialog } from "@tauri-apps/plugin-dialog"
import {
  listWorkspaces,
  classifyDirectory,
} from "../../api/workspace-service"

const EXISTING: InstanceListEntry[] = [
  { id: "ws-1", name: "project-alpha", directory: "/home/user/alpha", status: "running" } as InstanceListEntry,
  { id: "ws-2", name: "project-beta", directory: "/home/user/beta", status: "stopped" } as InstanceListEntry,
]

beforeEach(() => {
  vi.mocked(listWorkspaces).mockResolvedValue(EXISTING)
})

describe("LocalTab", () => {
  it("renders the existing workspace list on mount", async () => {
    render(<LocalTab onAdd={vi.fn()} />)
    expect(await screen.findByText("project-alpha")).toBeInTheDocument()
    expect(screen.getByText("project-beta")).toBeInTheDocument()
    expect(screen.getByText(/choose a folder/i)).toBeInTheDocument()
  })

  it("swaps to the folder-flow step after picking a folder", async () => {
    vi.mocked(openDialog).mockResolvedValue("/tmp/new-thing")
    vi.mocked(classifyDirectory).mockResolvedValue({ type: "new", directory: "/tmp/new-thing" })

    render(<LocalTab onAdd={vi.fn()} />)
    await screen.findByText("project-alpha")

    await userEvent.click(screen.getByText(/choose a folder/i))

    // Folder-flow header shows the folder name
    expect(await screen.findByText("new-thing")).toBeInTheDocument()
    // Back button from the overlay
    expect(screen.getByRole("button", { name: /back to workspaces list/i })).toBeInTheDocument()
  })

  it("unmounts the list while the folder-flow step is shown (misclick regression)", async () => {
    vi.mocked(openDialog).mockResolvedValue("/tmp/new-thing")
    vi.mocked(classifyDirectory).mockResolvedValue({ type: "new", directory: "/tmp/new-thing" })

    render(<LocalTab onAdd={vi.fn()} />)
    await screen.findByText("project-alpha")
    await userEvent.click(screen.getByText(/choose a folder/i))
    await screen.findByText("new-thing")

    await waitFor(() => {
      expect(screen.queryByText("project-alpha")).not.toBeInTheDocument()
      expect(screen.queryByText("project-beta")).not.toBeInTheDocument()
      expect(screen.queryByText(/choose a folder/i)).not.toBeInTheDocument()
    })
  })

  it("returns to the list when back is clicked", async () => {
    vi.mocked(openDialog).mockResolvedValue("/tmp/new-thing")
    vi.mocked(classifyDirectory).mockResolvedValue({ type: "new", directory: "/tmp/new-thing" })

    render(<LocalTab onAdd={vi.fn()} />)
    await screen.findByText("project-alpha")
    await userEvent.click(screen.getByText(/choose a folder/i))
    await screen.findByText("new-thing")

    await userEvent.click(screen.getByRole("button", { name: /back to workspaces list/i }))

    expect(await screen.findByText("project-alpha")).toBeInTheDocument()
    expect(screen.getByText(/choose a folder/i)).toBeInTheDocument()
  })

  it("propagates onAdd from the folder-flow step (registered path)", async () => {
    const inst: InstanceListEntry = EXISTING[0]!
    vi.mocked(openDialog).mockResolvedValue(inst.directory)
    vi.mocked(classifyDirectory).mockResolvedValue({ type: "registered", instance: inst })
    const onAdd = vi.fn()

    render(<LocalTab onAdd={onAdd} />)
    await screen.findByText("project-alpha")
    await userEvent.click(screen.getByText(/choose a folder/i))
    await screen.findByText(/workspace found/i)

    // The overlay's "Add workspace" button
    const addBtns = screen.getAllByRole("button", { name: /add workspace/i })
    await userEvent.click(addBtns[addBtns.length - 1]!)

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: inst.id, type: "local" }))
  })
})
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm test -- local-tab
```

Expected: the "renders the existing workspace list on mount" test passes (list-on-mount was already working before). The 4 new-flow tests FAIL because `handleBrowse()` currently sets `browseResult`, not a view transition.

- [ ] **Step 3: Refactor `LocalTab`**

Replace the contents of `src/openacp/components/add-workspace/local-tab.tsx` with:

```tsx
import React, { useState, useEffect, useRef } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { invoke } from "@tauri-apps/api/core"
import { X } from "@phosphor-icons/react"
import {
  type InstanceListEntry,
  type WorkspaceEntry,
} from "../../api/workspace-store"
import {
  listWorkspaces,
  classifyDirectory,
  type ClassifyDirectoryResult,
} from "../../api/workspace-service"
import { FolderFlowStep } from "./folder-flow-step"

interface LocalTabProps {
  onAdd: (entry: WorkspaceEntry) => void
  onSetup?: (path: string, instanceId: string, instanceName: string) => void
  existingIds?: string[]
}

type View =
  | { step: "list" }
  | { step: "folder-flow"; result: ClassifyDirectoryResult }

export function LocalTab(props: LocalTabProps) {
  const [instances, setInstances] = useState<InstanceListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>({ step: "list" })
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    listWorkspaces()
      .then(setInstances)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleBrowse() {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({ directory: true, multiple: false })
    if (!selected || typeof selected !== "string") return
    const result = await classifyDirectory(selected, instances)
    setView({ step: "folder-flow", result })
  }

  const slide = reducedMotion
    ? {
        listExit: { opacity: 0 },
        flowInitial: { opacity: 0 },
        flowAnimate: { opacity: 1 },
        flowExit: { opacity: 0 },
        transition: { duration: 0.08 },
      }
    : {
        listExit: { x: "-30%", opacity: 0 },
        flowInitial: { x: "100%", opacity: 0 },
        flowAnimate: { x: 0, opacity: 1 },
        flowExit: { x: "100%", opacity: 0 },
        transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const },
      }

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        {view.step === "list" ? (
          <motion.div
            key="list"
            initial={{ x: 0, opacity: 1 }}
            animate={{ x: 0, opacity: 1 }}
            exit={slide.listExit}
            transition={slide.transition}
          >
            <ListView
              instances={instances}
              loading={loading}
              existingIds={props.existingIds}
              onSelectInstance={(inst) =>
                props.onAdd({
                  id: inst.id,
                  name: inst.name ?? inst.id,
                  directory: inst.directory,
                  type: "local",
                })
              }
              onRemoveInstance={async (id) => {
                try {
                  await invoke("remove_instance_registration", { instanceId: id })
                  setInstances((prev) => prev.filter((x) => x.id !== id))
                } catch (err) {
                  console.error("[local-tab] remove instance failed:", err)
                }
              }}
              onBrowse={handleBrowse}
            />
          </motion.div>
        ) : (
          <motion.div
            key="folder-flow"
            initial={slide.flowInitial}
            animate={slide.flowAnimate}
            exit={slide.flowExit}
            transition={slide.transition}
          >
            <FolderFlowStep
              result={view.result}
              instances={instances}
              onAdd={props.onAdd}
              onSetup={props.onSetup}
              onBack={() => setView({ step: "list" })}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ListView(props: {
  instances: InstanceListEntry[]
  loading: boolean
  existingIds?: string[]
  onSelectInstance: (inst: InstanceListEntry) => void
  onRemoveInstance: (id: string) => void
  onBrowse: () => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Workspaces on this machine
        </p>
        {props.loading && (
          <div className="rounded-lg border border-border-weak overflow-hidden max-h-64 overflow-y-auto">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-border-weak" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium w-32 rounded bg-accent animate-pulse">&nbsp;</span>
                  </div>
                  <span className="text-xs font-mono truncate block w-56 rounded bg-accent animate-pulse">&nbsp;</span>
                </div>
                <div className="size-2 rounded-full shrink-0 bg-accent animate-pulse" />
              </div>
            ))}
          </div>
        )}
        {!props.loading && props.instances.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">No workspaces found.</p>
        )}
        {!props.loading && props.instances.length > 0 && (
          <div className="rounded-lg border border-border-weak overflow-hidden max-h-64 overflow-y-auto">
            {props.instances.map((inst, i) => {
              const alreadyAdded = props.existingIds?.includes(inst.id) ?? false
              const isRunning = inst.status === "running"
              return (
                <div
                  key={inst.id}
                  className={`group flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer ${
                    i > 0 ? "border-t border-border-weak" : ""
                  } ${alreadyAdded ? "opacity-70" : ""} hover:bg-accent`}
                  onClick={() => props.onSelectInstance(inst)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{inst.name ?? inst.id}</span>
                      {alreadyAdded && <span className="text-2xs text-muted-foreground">Added</span>}
                    </div>
                    <span className="text-xs text-muted-foreground truncate block font-mono">{inst.directory}</span>
                  </div>
                  {isRunning && (
                    <div className="size-2 rounded-full shrink-0" style={{ background: "var(--color-success)" }} />
                  )}
                  {!alreadyAdded && !isRunning && (
                    <button
                      type="button"
                      className="shrink-0 size-6 flex items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-accent transition-all"
                      title="Remove from list"
                      onClick={async (e) => {
                        e.stopPropagation()
                        props.onRemoveInstance(inst.id)
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border-weak pt-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Open a folder</p>
        <button
          type="button"
          onClick={props.onBrowse}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border-weak text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0">
            <path d="M2.5 5.83333V15.8333H17.5V7.5H9.58333L7.5 5.83333H2.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Choose a folder to open or create a workspace...
        </button>
      </div>
    </div>
  )
}
```

Key changes from the previous implementation:
- `browseResult` state and `browseResultRef` + `scrollIntoView` effect: **deleted**.
- In-file `BrowseResultView` and `RegisterExistingView` functions: **deleted** (their behavior now lives in `FolderFlowStep`).
- New `View` discriminated type + `setView` state.
- New `ListView` sub-component: the previous list + picker, extracted so the animated parent stays small.
- `AnimatePresence` with mode="popLayout" and reduced-motion-aware slide/fade.

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: all pass (3 onboarding + 6 folder-flow-step + 5 local-tab = 14 total).

- [ ] **Step 5: Type-check**

```bash
make lint
```

Expected: 0 TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/openacp/components/add-workspace/local-tab.tsx src/openacp/components/add-workspace/local-tab.test.tsx
git commit -m "feat(add-workspace): slide folder-flow in as overlay step"
```

---

### Task 5: Focus management

When the overlay mounts, focus the back button. When it dismisses back to the list, focus the "Choose a folder" button. This is a small, additive change to `FolderFlowStep` and `LocalTab` (the ListView subcomponent).

**Files:**
- Modify: `OpenACP-App/src/openacp/components/add-workspace/folder-flow-step.tsx`
- Modify: `OpenACP-App/src/openacp/components/add-workspace/local-tab.tsx`
- Modify: `OpenACP-App/src/openacp/components/add-workspace/folder-flow-step.test.tsx`
- Modify: `OpenACP-App/src/openacp/components/add-workspace/local-tab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `folder-flow-step.test.tsx`:

```tsx
  it("moves focus to the back button on mount", async () => {
    render(
      <FolderFlowStep
        result={{ type: "new", directory: "/tmp/demo" }}
        instances={instances}
        onAdd={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /back to workspaces list/i }),
      ).toHaveFocus()
    })
  })
```

(Add `waitFor` to the existing import from `@testing-library/react`.)

Add to `local-tab.test.tsx`:

```tsx
  it("restores focus to 'Choose a folder' after back", async () => {
    vi.mocked(openDialog).mockResolvedValue("/tmp/new-thing")
    vi.mocked(classifyDirectory).mockResolvedValue({ type: "new", directory: "/tmp/new-thing" })

    render(<LocalTab onAdd={vi.fn()} />)
    await screen.findByText("project-alpha")
    await userEvent.click(screen.getByText(/choose a folder/i))
    await screen.findByText("new-thing")
    await userEvent.click(screen.getByRole("button", { name: /back to workspaces list/i }))

    await waitFor(() => {
      expect(screen.getByText(/choose a folder/i).closest("button")).toHaveFocus()
    })
  })
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm test -- add-workspace
```

Expected: 2 new tests FAIL (focus not yet moved).

- [ ] **Step 3: Add focus logic to `FolderFlowStep`**

In `folder-flow-step.tsx`:

```tsx
import React, { useEffect, useRef, useState } from "react"
// ...

export function FolderFlowStep(props: FolderFlowStepProps) {
  const backRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    backRef.current?.focus()
  }, [])
  // ...
  <button ref={backRef} type="button" aria-label="Back to workspaces list" ...>
```

- [ ] **Step 4: Add focus logic to `LocalTab` / `ListView`**

In `local-tab.tsx`:

1. Add a `browseButtonRef = useRef<HTMLButtonElement>(null)` in `LocalTab`.
2. Pass it as a `browseButtonRef` prop to `ListView`, have `ListView` attach it to the `<button type="button" onClick={props.onBrowse}>`.
3. Add a `useEffect` in `LocalTab` that watches `view.step`: when it transitions to `"list"`, call `browseButtonRef.current?.focus()`. Skip on initial mount (a `wasMountedRef` or tracking a previous `view.step` via `useRef` is fine; simplest is to track the previous step in a ref and only focus on transitions `folder-flow → list`).

```tsx
  const browseButtonRef = useRef<HTMLButtonElement>(null)
  const prevStepRef = useRef<View["step"]>(view.step)
  useEffect(() => {
    if (prevStepRef.current === "folder-flow" && view.step === "list") {
      browseButtonRef.current?.focus()
    }
    prevStepRef.current = view.step
  }, [view.step])
```

- [ ] **Step 5: Run tests**

```bash
pnpm test -- add-workspace
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/openacp/components/add-workspace/folder-flow-step.tsx src/openacp/components/add-workspace/folder-flow-step.test.tsx src/openacp/components/add-workspace/local-tab.tsx src/openacp/components/add-workspace/local-tab.test.tsx
git commit -m "feat(add-workspace): move focus to back button on overlay, restore on back"
```

---

### Task 6: CHANGELOG entry

**File:** `OpenACP-App/CHANGELOG.md`

- [ ] **Step 1: Add a line under `## Unreleased` → `### Changed`**

Under the existing `### Changed` subsection of `## Unreleased`:

```md
- Add Workspace → Local: "Choose a folder" result now slides in as a focused overlay step; the workspace list and picker are unmounted while the user configures the picked folder, preventing mid-flow misclicks
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for folder-flow overlay"
```

---

### Task 7: Manual QA + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 2: Run type check**

```bash
make lint
```

Expected: 0 TS errors.

- [ ] **Step 3: Start the Tauri dev app and walk the flow**

```bash
make tauri-dev
```

Manually verify each of the following. Do not mark this step complete until all check. If anything fails, fix + commit + re-run this step.

- [ ] Open **Add Workspace** modal.
- [ ] Local tab loads and shows existing workspaces.
- [ ] Click **Choose a folder**, pick a brand-new directory.
  - [ ] Overlay slides in from the right in ~200 ms.
  - [ ] Header shows the folder name + back arrow.
  - [ ] `CreateInstance` body renders with Clone / Create-new options.
  - [ ] List + picker are not visible behind the overlay.
- [ ] Click the **back arrow**. Overlay slides away, list is visible, focus lands on "Choose a folder".
- [ ] Pick a folder that **already has** `.openacp/config.json` but is not registered. Overlay shows "Existing workspace detected". Clicking **Add workspace** registers it and closes the modal.
- [ ] Pick a folder that is **already registered**. Overlay shows "Workspace found". **Add workspace** closes the modal.
- [ ] From the overlay, click Remote tab, then click Local tab again. Lands back on the list (folder-flow state is reset).
- [ ] Press **Esc** from the overlay — the whole modal closes (no special intercept).
- [ ] Verify in **dark mode** and **light mode** (toggle via Settings → General).
- [ ] Toggle system **Reduce Motion** (macOS: System Settings → Accessibility → Display → Reduce motion) and re-walk the flow. Observe a quick crossfade, no slide.
- [ ] Keyboard-only: after folder pick, Tab reaches back button first; Enter dismisses; focus returns to "Choose a folder" button.

- [ ] **Step 4: Any fixes from QA get their own commits**

If QA surfaces issues, fix, commit with a `fix(add-workspace): …` message, and re-run the QA checklist.

---

### Task 8: Open the pull request

**Files:** none (git / gh only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/folder-flow-overlay
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat(add-workspace): slide folder-flow in as overlay step" --body "$(cat <<'EOF'
## Summary
- Refactor Add Workspace → Local so picking a folder swaps the tab body for a sliding `FolderFlowStep` overlay (right-to-left push, `motion/react`)
- The workspace list + picker are unmounted while the overlay is active, so mid-flow misclicks into the list are impossible (the regression the user flagged)
- Back arrow in the overlay header slides it out and restores focus to the "Choose a folder" button
- Respects `prefers-reduced-motion`: crossfade instead of slide

## Test plan
- [ ] `pnpm test` — all pass (jsdom bootstrap + new FolderFlowStep + LocalTab tests)
- [ ] `make lint` — clean
- [ ] Manual walk-through: registered / unregistered / new classification paths in the overlay
- [ ] Dark + light themes
- [ ] `prefers-reduced-motion: reduce` → crossfade
- [ ] Keyboard nav + focus management (back button on mount, picker on dismiss)

Spec: `docs/superpowers/specs/2026-04-16-folder-flow-overlay-design.md`
EOF
)"
```

- [ ] **Step 3: Verify PR opened and CI triggered**

```bash
gh pr view --json url,checks
```

Expected: PR URL printed, checks have started.

---

## Done when

- All 8 tasks are checked off.
- `pnpm test` green.
- `make lint` clean.
- Manual QA checklist in Task 7 Step 3 fully checked.
- PR open.
- No code changes outside `OpenACP-App/src/openacp/components/add-workspace/`, `OpenACP-App/src/openacp/api/workspace-service.ts`, `OpenACP-App/src/test/setup.ts`, `OpenACP-App/vite.config.ts`, `OpenACP-App/package.json`, `OpenACP-App/pnpm-lock.yaml`, `OpenACP-App/CHANGELOG.md`, and `OpenACP-App/docs/superpowers/`.
