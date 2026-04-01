/**
 * OpenACP App — Entry Point
 *
 * This is a standalone entry for the new OpenACP logic layer.
 * To test: update index.html to point to this file, or use as a route.
 *
 * For now, it can be mounted alongside the existing app for development.
 */
import { render } from "solid-js/web"
import "../ui/src/styles/tailwind/index.css"
import { OpenACPApp } from "./app"

// Default workspace directory — will be replaced by Tauri workspace selection
const DEFAULT_DIRECTORY = "/Users/liam/Data/Projects/OpenACP"

const root = document.getElementById("root")
if (root) {
  render(() => <OpenACPApp directory={DEFAULT_DIRECTORY} />, root)
}

export { OpenACPApp }
