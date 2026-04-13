import React, { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { platform } from "@tauri-apps/plugin-os"
import { motion } from "motion/react"
import { ArrowClockwise, Terminal } from "@phosphor-icons/react"
import { StepChecklist, type Step, type StepStatus } from "./step-checklist"
import { CollapsibleLog } from "./collapsible-log"
import appIcon from "../assets/app-icon.png"
import { WindowDragBar } from "./window-drag-bar"

interface Props {
  onSuccess: (configExists: boolean) => void
}

const INSTALL_CMD_MACOS =
  "curl -fsSL https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.sh | bash"
const INSTALL_CMD_WINDOWS =
  'powershell -c "irm https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.ps1 | iex"'

/** Parse CLI log lines into step progress. The install script emits patterns like [1/3], [2/3], [3/3]. */
function deriveSteps(lines: string[], overallStatus: "running" | "success" | "error"): Step[] {
  const stepDefs = [
    { pattern: /\[1\/3\]/, label: "Preparing environment" },
    { pattern: /\[2\/3\]/, label: "Installing OpenACP" },
    { pattern: /\[3\/3\]/, label: "Finalizing" },
  ]

  let lastMatchedIdx = -1
  for (const line of lines) {
    const stripped = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    for (let i = 0; i < stepDefs.length; i++) {
      if (stepDefs[i].pattern.test(stripped)) {
        lastMatchedIdx = Math.max(lastMatchedIdx, i)
      }
    }
  }

  return stepDefs.map((def, i): Step => {
    let status: StepStatus = "pending"
    if (overallStatus === "error" && i <= lastMatchedIdx) {
      status = i === lastMatchedIdx ? "error" : "done"
    } else if (overallStatus === "success") {
      status = "done"
    } else if (i < lastMatchedIdx) {
      status = "done"
    } else if (i === lastMatchedIdx) {
      status = "running"
    }
    return { label: def.label, status }
  })
}

export function InstallScreen(props: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<"running" | "success" | "error">("running")
  const [error, setError] = useState("")
  const [configExists, setConfigExists] = useState(false)

  const runInstall = useCallback(async () => {
    setLines([])
    setStatus("running")
    setError("")
    const unlisten = await listen<string>("install-output", (event) => {
      setLines((prev) => [...prev, event.payload])
    })
    try {
      await invoke("run_install_script")
      const exists = await invoke<boolean>("check_openacp_config").catch(() => false)
      setConfigExists(exists)
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setError(String(err))
    } finally {
      unlisten()
    }
  }, [])

  useEffect(() => {
    runInstall()
  }, [runInstall])

  const copyCommand = async () => {
    const os = await platform()
    await writeText(os === "windows" ? INSTALL_CMD_WINDOWS : INSTALL_CMD_MACOS)
  }

  const steps = deriveSteps(lines, status)
  const progressPercent =
    status === "success" ? 100 : status === "error" ? Math.min(95, lines.length * 3) : Math.min(95, lines.length * 3)

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-background-base p-8">
      <WindowDragBar />
      <div className="flex w-full max-w-[480px] flex-col items-center gap-5">
        {/* Header */}
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <img src={appIcon} alt="" className="h-12 w-12 rounded-xl" />
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-lg font-medium text-foreground">Installing OpenACP</h1>
            <p className="text-sm text-muted-foreground">Setting up the CLI on your system</p>
          </div>
        </motion.div>

        {/* Progress line */}
        <div className="w-full">
          <div className="h-px w-full overflow-hidden rounded-full bg-zinc-800">
            <motion.div
              className={`h-full ${
                status === "error"
                  ? "bg-destructive"
                  : status === "success"
                    ? "bg-emerald-400"
                    : "bg-foreground"
              }`}
              initial={{ width: "0%" }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Step checklist */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <StepChecklist steps={steps} />
        </motion.div>

        {/* Collapsible log output */}
        <CollapsibleLog lines={lines} isRunning={status === "running"} />

        {/* Success state */}
        {status === "success" && (
          <motion.div
            className="flex w-full items-center justify-between"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <span className="text-sm text-emerald-400">Installation complete</span>
            <button
              onClick={() => props.onSuccess(configExists)}
              className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Continue
            </button>
          </motion.div>
        )}

        {/* Error state */}
        {status === "error" && (
          <motion.div
            className="flex w-full flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <p className="text-sm text-destructive">{error}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={copyCommand}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                <Terminal size={14} />
                Copy command
              </button>
              <button
                onClick={runInstall}
                className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
              >
                <ArrowClockwise size={14} />
                Retry
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
