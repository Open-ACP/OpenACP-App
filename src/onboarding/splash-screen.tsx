import React from "react"
import appIcon from "../assets/app-icon.png"

export function SplashScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <img src={appIcon} alt="OpenACP" className="size-32 rounded-3xl animate-in fade-in zoom-in-95 duration-500" />
    </div>
  )
}
