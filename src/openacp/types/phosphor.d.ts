declare module "phosphor-solid-js/dist/icons/*.esm" {
  import React from "react"
  interface PhosphorIconProps {
    size?: number | string
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"
    color?: string
    class?: string
    mirrored?: boolean
  }
  const Icon: React.FC<PhosphorIconProps>
  export default Icon
}
