import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { MiniPlayer } from "./components/MiniPlayer";
import "./index.css";

// The same bundle drives both windows; render by window label.
const isMini = getCurrentWindow().label === "miniplayer";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isMini ? <MiniPlayer /> : <App />}</React.StrictMode>,
);
