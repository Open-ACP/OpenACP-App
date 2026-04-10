import React from "react"
import appIcon from "../assets/app-icon.png"

export function SplashScreen() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-background-base">
      <img
        src={appIcon}
        alt="OpenACP"
        className="h-16 w-16 rounded-2xl"
      />
      <span className="text-lg font-medium text-text-strong">OpenACP</span>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-weak [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-weak [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-weak" />
      </div>
      <span className="text-base font-normal text-text-weak">Checking environment...</span>
    </div>
  );
}
