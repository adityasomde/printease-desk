import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

const isDesktopFileRuntime =
  typeof window !== "undefined" &&
  (window.location.protocol === "file:" || window.printeaseDesktop?.isDesktop);

const Router = isDesktopFileRuntime ? HashRouter : BrowserRouter;

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    console.error("[PrintEase renderer error]", event.error || event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("[PrintEase renderer promise rejection]", event.reason);
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
