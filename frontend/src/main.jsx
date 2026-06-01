import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

function isDesktopRuntime() {
  if (typeof window === "undefined") return false;
  return Boolean(window.printeaseDesktop?.isDesktop) || window.location.protocol === "file:";
}

const Router = isDesktopRuntime() ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
