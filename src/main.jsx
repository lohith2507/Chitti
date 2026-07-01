import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Chitti from "./Chitti.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Chitti />
  </StrictMode>
);
