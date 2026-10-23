import { createRoot } from "react-dom/client";
import { startTemplateRenderer } from "../../../design-bench/ui/src/TemplateRenderer";
import { StudioApp } from "./Studio";
import "./studio.css";
startTemplateRenderer();
createRoot(document.getElementById("app")!).render(<StudioApp />);
