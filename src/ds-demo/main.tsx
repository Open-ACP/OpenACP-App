import React from "react"
import ReactDOM from "react-dom/client"
import "../openacp/styles/index.css"
import { DemoApp } from "./app"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DemoApp />
  </React.StrictMode>
)
