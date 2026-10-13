import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Aplica o tema salvo antes do primeiro render (evita flash de tema).
try {
  if (JSON.parse(localStorage.getItem("rc:theme") ?? '"dark"') === "light") {
    document.documentElement.classList.replace("dark", "light");
  }
} catch {
  // storage indisponível
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
