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

    // Folder-flow header shows the folder name (may appear in header + body, check at least one exists)
    expect(await screen.findAllByText("new-thing")).not.toHaveLength(0)
    // Back button from the overlay
    expect(screen.getByRole("button", { name: /back to workspaces list/i })).toBeInTheDocument()
  })

  it("unmounts the list while the folder-flow step is shown (misclick regression)", async () => {
    vi.mocked(openDialog).mockResolvedValue("/tmp/new-thing")
    vi.mocked(classifyDirectory).mockResolvedValue({ type: "new", directory: "/tmp/new-thing" })

    render(<LocalTab onAdd={vi.fn()} />)
    await screen.findByText("project-alpha")
    await userEvent.click(screen.getByText(/choose a folder/i))
    await screen.findByRole("button", { name: /back to workspaces list/i })

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
    await screen.findByRole("button", { name: /back to workspaces list/i })

    await userEvent.click(screen.getByRole("button", { name: /back to workspaces list/i }))

    expect(await screen.findByText("project-alpha")).toBeInTheDocument()
    expect(screen.getByText(/choose a folder/i)).toBeInTheDocument()
  })

  it("restores focus to 'Choose a folder' after back", async () => {
    vi.mocked(openDialog).mockResolvedValue("/tmp/new-thing")
    vi.mocked(classifyDirectory).mockResolvedValue({ type: "new", directory: "/tmp/new-thing" })

    render(<LocalTab onAdd={vi.fn()} />)
    await screen.findByText("project-alpha")
    await userEvent.click(screen.getByText(/choose a folder/i))
    await screen.findByRole("button", { name: /back to workspaces list/i })
    await userEvent.click(screen.getByRole("button", { name: /back to workspaces list/i }))

    await waitFor(() => {
      expect(screen.getByText(/choose a folder/i).closest("button")).toHaveFocus()
    })
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
