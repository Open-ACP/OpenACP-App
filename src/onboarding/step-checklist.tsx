import React from "react"
import { motion, AnimatePresence } from "motion/react"
import { Check, CircleNotch, X } from "@phosphor-icons/react"

export type StepStatus = "pending" | "running" | "done" | "error"

export interface Step {
  label: string
  status: StepStatus
  duration?: string
}

interface Props {
  steps: Step[]
}

export function StepChecklist({ steps }: Props) {
  return (
    <div className="flex flex-col gap-0.5">
      <AnimatePresence initial={false}>
        {steps.map((step, i) => (
          <motion.div
            key={step.label}
            className="flex items-center gap-3 rounded-lg px-3 py-2"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 24,
              delay: i * 0.06,
            }}
          >
            <StepIcon status={step.status} />
            <span
              className={`flex-1 text-sm ${
                step.status === "pending"
                  ? "text-muted-foreground/50"
                  : step.status === "error"
                    ? "text-destructive"
                    : "text-foreground"
              }`}
            >
              {step.label}
            </span>
            {step.duration && step.status === "done" && (
              <motion.span
                className="text-xs tabular-nums text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
              >
                {step.duration}
              </motion.span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "pending":
      return (
        <div className="flex h-5 w-5 items-center justify-center">
          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
        </div>
      )
    case "running":
      return (
        <div className="flex h-5 w-5 items-center justify-center text-foreground">
          <CircleNotch size={16} weight="bold" className="animate-spin" />
        </div>
      )
    case "done":
      return (
        <motion.div
          className="flex h-5 w-5 items-center justify-center text-emerald-400"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
        >
          <Check size={16} weight="bold" />
        </motion.div>
      )
    case "error":
      return (
        <motion.div
          className="flex h-5 w-5 items-center justify-center text-destructive"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
        >
          <X size={16} weight="bold" />
        </motion.div>
      )
  }
}
