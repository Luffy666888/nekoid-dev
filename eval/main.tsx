import React from "react";
import { createRoot } from "react-dom/client";
import { PersonaEval } from "./PersonaEval";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PersonaEval />
  </React.StrictMode>,
);
