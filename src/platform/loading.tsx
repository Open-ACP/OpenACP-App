import React, { useState, useEffect, useMemo } from "react"
import { createRoot } from "react-dom/client"
import { Channel } from "@tauri-apps/api/core"
import { commands, events, InitStep } from "./bindings"
import { initI18n, t } from "./i18n"
import "./styles.css"

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

  const phase = step?.phase ?? null

  const value = useMemo(() => {
    if (phase === "done") return 100
    return Math.max(25, Math.min(100, percent))
  }, [phase, percent])

  const status = useMemo(() => {
    if (phase === "done") return t("desktop.loading.status.done")
    if (phase === "sqlite_waiting") return lines[line]
    return t("desktop.loading.status.initial")
  }, [phase, line])

  useEffect(() => {
    const channel = new Channel<InitStep>()
    channel.onmessage = (next) => setStep(next)
    commands.awaitInitialization(channel as any).catch(() => undefined)
  }, [])

  useEffect(() => {
    setLine(0)
    setPercent(0)

    const timers = delays.map((ms, i) => setTimeout(() => setLine(i + 1), ms))

    const listenerPromise = events.sqliteMigrationProgress.listen((e: any) => {
      if (e.payload.type === "InProgress") setPercent(Math.max(0, Math.min(100, e.payload.value)))
      if (e.payload.type === "Done") setPercent(100)
    })

    return () => {
      listenerPromise.then((cb: any) => cb())
      timers.forEach(clearTimeout)
    }
  }, [])

  useEffect(() => {
    if (phase !== "done") return
    const timer = setTimeout(() => events.loadingWindowComplete.emit(null), 1000)
    return () => clearTimeout(timer)
  }, [phase])

  return (
    <div className="w-screen h-screen bg-background-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-11">
        <div className="w-20 h-25 opacity-15 flex items-center justify-center text-4xl text-foreground">
          &#x2B21;
        </div>
        <div className="w-60 flex flex-col items-center gap-4" aria-live="polite">
          <span className="w-full overflow-hidden text-center text-ellipsis whitespace-nowrap text-text-strong text-sm">
            {status}
          </span>
          <div className="w-20 h-1 bg-surface-weak rounded-none overflow-hidden">
            <div
              className="h-full bg-icon-warning-base rounded-none transition-[width] duration-300"
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
