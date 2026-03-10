import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

// Reset default browser styles
document.documentElement.style.margin = "0";
document.documentElement.style.padding = "0";
document.body.style.margin = "0";
document.body.style.padding = "0";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
