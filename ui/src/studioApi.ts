import { useEffect, useRef, useState } from "react";
import { call } from "../../../design-bench/ui/src/native";
import type { Workspace } from "../../../design-bench/ui/src/artifacts/model";
export type Area = { x: number; y: number; width: number; height: number };
export type Attempt = {
  builder: "codex" | "claude";
  builderWindowId: string;
  operationId: string;
  captureId: string;
  comment: string;
  area: Area;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
    totalWidth: number;
    totalHeight: number;
  };
  images: { artwork: string; ui: string; difference: string };
};
export type Selection = {
  area?: Area;
  reveal?: number;
  mode?: "select" | "reveal";
  operationId?: string;
  attempt?: Attempt;
};
export type Draft = { text: string; selection?: Selection };
export type Capture = {
  id: string;
  artifactId: string;
  contentHash: string;
  sourceId: string;
  sourceHash: string;
  imageId: string;
  width: number;
  height: number;
  theme: "light" | "dark";
  created: string | number;
};
export type Studio = {
  projectId: string;
  preferences: { reviewer: string; autoAdvance: boolean };
  drafts: Record<string, Draft>;
  captures: Record<string, Capture>;
  feedback?: {
    id: string;
    artifactId: string;
    comment: string;
    images: { artwork: string; ui: string; difference: string };
    runId: string;
    captureId: string;
    area: Area;
    created: string;
  }[];
};
export type StudioWorkspace = Workspace & { studio?: Studio };
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
export async function stagePng(dataUrl: string, name: string): Promise<string> {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) throw Error("Capture did not return a PNG.");
  const receipt = await call<{ id: string }>("benchStageInput", {
    mime: "image/png",
    base64: match[1],
    name,
  });
  if (!receipt?.id) throw Error("Image storage was not acknowledged.");
  return receipt.id;
}
// A serialized write lane only; durable ownership is the native graph checkpoint.
// The lane outlives a component so navigation cannot reorder older draft writes.
const pending = new Map<string, Promise<unknown>>();
function writeDraft(artifactId: string, kind: string, draft: Draft) {
  const key = artifactId + ":" + kind,
    previous = pending.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() =>
    call("studioDraft", { artifactId, kind, ...draft })
  );
  pending.set(key, next);
  void next.finally(() => {
    if (pending.get(key) === next) pending.delete(key);
  }).catch(() => {});
  return next;
}
export function useStudioDraft(
  artifactId: string,
  kind: "instruction" | "selection",
  saved?: Draft,
) {
  const key = artifactId + ":" + kind,
    identity = useRef(key),
    version = useRef(0);
  const [draft, setDraft] = useState<Draft>(saved || { text: "" }),
    current = useRef(draft);
  const [status, setStatus] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    if (identity.current === key) return;
    identity.current = key;
    version.current++;
    current.current = saved || { text: "" };
    setDraft(current.current);
    setStatus("");
    setError("");
  }, [key, saved]);
  function update(next: Draft) {
    current.current = next;
    setDraft(next);
    setStatus("Saving…");
    setError("");
    const token = ++version.current;
    return writeDraft(artifactId, kind, next).then(() => {
      if (version.current === token) {
        setStatus("Saved");
        setError("");
      }
    }, (e) => {
      if (version.current === token) {
        setStatus("");
        setError(errorText(e));
      }
      throw e;
    });
  }
  return {
    draft,
    status,
    error,
    update: (next: Draft) => {
      void update(next).catch(() => {});
    },
    save: update,
    retry: () => {
      void update(current.current).catch(() => {});
    },
  };
}
