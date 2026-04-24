import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FolderFlowStep } from "./folder-flow-step"
import type { InstanceListEntry } from "../../api/workspace-store"

const instances: InstanceListEntry[] = []

describe("FolderFlowStep", () => {
  it("renders the folder name in the header", () => {
    render(
      <FolderFlowStep
        result={{ type: "unregistered", directory: "/tmp/demo" }}
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

  it("moves focus to the back button on mount", async () => {
    render(
      <FolderFlowStep
        result={{ type: "unregistered", directory: "/tmp/demo" }}
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
})
