import { ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <div
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
    />
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <div
      ref={props.ref as any}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
    />
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <div
      data-component="logo"
      classList={{ [props.class ?? ""]: !!props.class }}
    />
  )
}
