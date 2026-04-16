import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "src/lib/utils"

function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none select-none items-center disabled:opacity-40 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-primary"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className="block size-4 rounded-full border-2 border-primary bg-background shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
