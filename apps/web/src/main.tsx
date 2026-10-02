import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./workspace.css";
import "./billing.css";
import "./analytics.css";
import "./landing.css";
import "./connections.css";
import "./launch.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
