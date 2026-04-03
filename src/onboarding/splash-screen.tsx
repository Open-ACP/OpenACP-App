import React from "react"

export function SplashScreen() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-background-base">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-text-strong">
        <img
          src="/icons/icon.png"
          alt="OpenACP"
          className="h-8 w-8"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
            e.currentTarget.parentElement!.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--background-stronger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>';
          }}
        />
      </div>
      <span className="text-16-medium text-text-strong">OpenACP</span>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-weak [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-weak [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-weak" />
      </div>
      <span className="text-14-regular text-text-weak">Checking environment...</span>
    </div>
  );
}
