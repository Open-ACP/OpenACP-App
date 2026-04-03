declare module "phosphor-solid-js/dist/icons/*.esm" {
  import { Component } from "solid-js"
  interface PhosphorIconProps {
    size?: number | string
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"
    color?: string
    class?: string
    mirrored?: boolean
  }
  const Icon: Component<PhosphorIconProps>
  export default Icon
}
