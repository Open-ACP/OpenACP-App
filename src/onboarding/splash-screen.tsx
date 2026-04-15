import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import appIcon from "../assets/app-icon.png"
import { WindowDragBar } from "./window-drag-bar"

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
          <WindowDragBar />
          {/* Logo — clipped to rounded shape, breathing fade + scale */}
          <motion.div
            className="relative overflow-hidden rounded-3xl"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={
              mounted
                ? { opacity: [0.25, 1, 0.25], scale: [0.96, 1.02, 0.96] }
                : {}
            }
            transition={{
              opacity: { duration: 2, repeat: Infinity, ease: "easeInOut" },
              scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            <img
              src={appIcon}
              alt="OpenACP"
              className="relative block h-24 w-24"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
