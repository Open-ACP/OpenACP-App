import React, { useState, useEffect, useRef } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { invoke } from "@tauri-apps/api/core"
import { X } from "@phosphor-icons/react"
import {
  type InstanceListEntry,
  type WorkspaceEntry,
  invalidateInstancesCache,
} from "../../api/workspace-store"
import {
  listWorkspaces,
  classifyDirectory,
  type ClassifyDirectoryResult,
} from "../../api/workspace-service"
import { FolderFlowStep } from "./folder-flow-step"
import { AgentSetupStep } from "./agent-setup-step"

interface LocalTabProps {
  onAdd: (entry: WorkspaceEntry) => void
  existingIds?: string[]
}

type View =
  | { step: "list" }
  | { step: "folder-flow"; result: ClassifyDirectoryResult }
  | { step: "agent-setup"; path: string; instanceId: string; instanceName: string }

// Slide spec matches the project convention used in sidebar.tsx:51 and terminal-panel.tsx:58.
// Reduced-motion path is a quick crossfade.
const SLIDE_FULL = {
  listExit: { x: "-30%", opacity: 0 },
  flowInitial: { x: "100%", opacity: 0 },
  flowAnimate: { x: 0, opacity: 1 },
  flowExit: { x: "100%", opacity: 0 },
  transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const },
} as const

const SLIDE_REDUCED = {
  listExit: { opacity: 0 },
  flowInitial: { opacity: 0 },
  flowAnimate: { opacity: 1 },
  flowExit: { opacity: 0 },
  transition: { duration: 0.08 },
} as const

export function LocalTab(props: LocalTabProps) {
  const [instances, setInstances] = useState<InstanceListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>({ step: "list" })
  const reducedMotion = useReducedMotion()
  const browseButtonRef = useRef<HTMLButtonElement>(null)
  const prevStepRef = useRef<View["step"]>(view.step)

  useEffect(() => {
    if (prevStepRef.current !== "list" && view.step === "list") {
      browseButtonRef.current?.focus()
    }
    prevStepRef.current = view.step
  }, [view.step])

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

  const slide = reducedMotion ? SLIDE_REDUCED : SLIDE_FULL

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
              browseButtonRef={browseButtonRef}
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
                  invalidateInstancesCache()
                  setInstances((prev) => prev.filter((x) => x.id !== id))
                } catch (err) {
                  console.error("[local-tab] remove instance failed:", err)
                }
              }}
              onBrowse={handleBrowse}
            />
          </motion.div>
        ) : view.step === "folder-flow" ? (
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
              onSetup={(path, instanceId, instanceName) =>
                setView({ step: "agent-setup", path, instanceId, instanceName })
              }
              onBack={() => setView({ step: "list" })}
            />
          </motion.div>
        ) : (
          <motion.div
            key="agent-setup"
            initial={slide.flowInitial}
            animate={slide.flowAnimate}
            exit={slide.flowExit}
            transition={slide.transition}
          >
            <AgentSetupStep
              path={view.path}
              instanceId={view.instanceId}
              instanceName={view.instanceName}
              onComplete={(entry) => props.onAdd(entry)}
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
  browseButtonRef?: React.RefObject<HTMLButtonElement | null>
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
          ref={props.browseButtonRef}
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
