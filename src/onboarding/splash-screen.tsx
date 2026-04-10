import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { CircleNotch } from "@phosphor-icons/react"
import appIcon from "../assets/app-icon.png"

export function SplashScreen({ visible = true }: { visible?: boolean }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {/* Logo — clipped to rounded shape, no square black border */}
          <motion.div
            className="relative overflow-hidden rounded-3xl"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={mounted ? { opacity: 1, scale: 1 } : {}}
            transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.1 }}
          >
            <motion.div
              className="absolute inset-0 rounded-3xl"
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(255,255,255,0)",
                  "0 0 60px 12px rgba(255,255,255,0.06)",
                  "0 0 0 0 rgba(255,255,255,0)",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <img
              src={appIcon}
              alt="OpenACP"
              className="relative block h-24 w-24"
            />
          </motion.div>

          {/* Spinner — subtle, below logo */}
          <motion.div
            className="mt-6 text-zinc-600"
            initial={{ opacity: 0 }}
            animate={mounted ? { opacity: 1 } : {}}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <CircleNotch size={20} weight="bold" className="animate-spin" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
