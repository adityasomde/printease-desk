import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

const isDesktop =
  typeof window !== "undefined" &&
  !!window.printeaseDesktop &&
  !!window.printeaseDesktop.isDesktop;

const Router = isDesktop ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
