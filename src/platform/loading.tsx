import React, { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { createRoot } from "react-dom/client"
import "./styles.css"
import { commands, events, InitStep } from "./bindings"
import { Channel } from "@tauri-apps/api/core"
import { initI18n, t } from "./i18n"

const lines = [
  t("desktop.loading.status.initial"),
  t("desktop.loading.status.migrating"),
  t("desktop.loading.status.waiting"),
]
const delays = [3000, 9000]

void initI18n()

function LoadingScreen() {
  const [step, setStep] = useState<InitStep | null>(null)
  const [line, setLine] = useState(0)
  const [percent, setPercent] = useState(0)

  const phase = step?.phase

  const value = useMemo(() => {
    if (phase === "done") return 100
    return Math.max(25, Math.min(100, percent))
  }, [phase, percent])

  // Set up the initialization channel
  useEffect(() => {
    const channel = new Channel<InitStep>()
    channel.onmessage = (next) => setStep(next)
    commands.awaitInitialization(channel as any).catch(() => undefined)
  }, [])

  // Line rotation timers and migration progress listener
  useEffect(() => {
    setLine(0)
    setPercent(0)

    const timers = delays.map((ms, i) => setTimeout(() => setLine(i + 1), ms))

    const listener = events.sqliteMigrationProgress.listen((e: any) => {
      if (e.payload.type === "InProgress") setPercent(Math.max(0, Math.min(100, e.payload.value)))
      if (e.payload.type === "Done") setPercent(100)
    })

    return () => {
      listener.then((cb: any) => cb())
      timers.forEach(clearTimeout)
    }
  }, [])

  // Emit loading complete when done
  useEffect(() => {
    if (phase !== "done") return
    const timer = setTimeout(() => events.loadingWindowComplete.emit(null), 1000)
    return () => clearTimeout(timer)
  }, [phase])

  const status = useMemo(() => {
    if (phase === "done") return t("desktop.loading.status.done")
    if (phase === "sqlite_waiting") return lines[line]
    return t("desktop.loading.status.initial")
  }, [phase, line])

  return (
    <div className="w-screen h-screen bg-background-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-11">
        <div className="w-20 h-25 opacity-15" />
        <div className="w-60 flex flex-col items-center gap-4" aria-live="polite">
          <span className="w-full overflow-hidden text-center text-ellipsis whitespace-nowrap text-text-strong text-14-normal">
            {status}
          </span>
          <div
            className="w-20 h-1 bg-surface-weak rounded-none overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(value)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("desktop.loading.progressAria")}
          >
            <div
              className="h-full bg-icon-warning-base transition-[width] duration-200"
              style={{ width: `${value}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const root = document.getElementById("root")!
createRoot(root).render(<LoadingScreen />)
