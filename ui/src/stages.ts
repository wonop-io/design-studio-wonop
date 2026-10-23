import {
  type Artifact,
  isWorkingControls,
} from "../../../design-bench/ui/src/artifacts/model";
export const stageNames = ["Directions", "Artboard", "Components", "Review"];
export const titles = [
  "Brand directions",
  "Concept artboard",
  "Component board",
  "Implementation review",
];
export function stageOf(node: Artifact) {
  return node.kind === "directions"
    ? 0
    : node.kind === "artboard"
    ? 1
    : node.kind === "components"
    ? (isWorkingControls(node) ? 3 : 2)
    : -1;
}
export function when(value: string | number) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
