import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { call } from "../../../design-bench/ui/src/native";
import {
  type Artifact,
  isWorkingControls,
  reviewLabel,
} from "../../../design-bench/ui/src/artifacts/model";
import type { ReadyArtifacts } from "../../../design-bench/ui/src/artifacts/useArtifacts";
import { errorText, type StudioWorkspace, useStudioDraft } from "./studioApi";
import { stageNames, stageOf, when } from "./stages";
export function Instruction(
  { b, display, canGenerate }: {
    b: ReadyArtifacts;
    display: boolean;
    canGenerate: boolean;
  },
) {
  const studio = (b.w as StudioWorkspace).studio,
    draft = useStudioDraft(
      b.node.id,
      "instruction",
      studio?.drafts[b.node.id + ":instruction"],
    );
  return (
    <form
      className="agent-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (display && draft.draft.text.trim()) b.revise(draft.draft.text);
        else if (canGenerate) b.derive();
      }}
    >
      <label htmlFor="agent-instruction">Instruction for this stage</label>
      <textarea
        id="agent-instruction"
        placeholder="Describe what to make or change…"
        maxLength={2000}
        rows={3}
        value={draft.draft.text}
        disabled={b.busy || !!b.storageError}
        onChange={(e) => draft.update({ text: e.target.value })}
      />
      <div className="agent-composer-actions">
        <span>
          {draft.error
            ? "Draft not saved"
            : draft.status || "Configured in Wonop"}
        </span>
        <button
          disabled={b.busy || !!b.storageError ||
            (display
              ? !draft.draft.text.trim() || !b.canCorrect
              : !canGenerate)}
        >
          {display ? "Run revision" : "Create stage"}
        </button>
      </div>
      {draft.error && (
        <p role="alert">
          {draft.error}
          <button type="button" onClick={draft.retry}>Retry draft</button>
        </p>
      )}
    </form>
  );
}
export function Details({ b }: { b: ReadyArtifacts }) {
  return (
    <>
      <div className="brief-chunk">
        <h3>Creative brief</h3>
        <p>
          {b.node.brief || b.path.find((n) => n.kind === "inputs")?.brief ||
            "No brief yet."}
        </p>
      </div>
      <div className="review-note">
        <h3>Revision details</h3>
        <p>Version {b.node.revision} · {reviewLabel(b.node)}</p>
        <small>{when(b.node.created)}</small>
        {b.node.sources?.map((source) => {
          const n = b.w.nodes.find((n) => n.id === source.id);
          return (
            <p key={source.id}>
              Source: {n
                ? `${stageNames[stageOf(n)] || "Brief"} v${n.revision}`
                : "Unavailable"}
              <small className="hash">{source.hash}</small>
            </p>
          );
        })}
      </div>
      <div className="sample-note">
        Approval applies to this exact revision and its captured sources.
        Changes require a new revision.
      </div>
    </>
  );
}
export function Activity({ b }: { b: ReadyArtifacts }) {
  const items = [
    ...b.w.nodes.map((n) => ({
      id: n.id,
      at: n.created,
      text: `${stageNames[stageOf(n)] || "Brief"} v${n.revision} created · ${
        reviewLabel(n)
      }`,
    })),
    ...b.runs.map((r) => ({
      id: r.id,
      at: r.created || r.started,
      text: `Agent run · ${r.status}${r.error ? " · " + r.error : ""}`,
    })),
  ];
  return (
    <div>
      {items.sort((a, b) => String(b.at).localeCompare(String(a.at))).map(
        (item) => (
          <div className="activity-item" key={item.id}>
            {item.text}
            {item.at && <small>{when(item.at)}</small>}
          </div>
        ),
      )}
    </div>
  );
}
export function Preferences(
  { studio, onSave, pending }: {
    studio?: StudioWorkspace["studio"];
    onSave: (
      values: { reviewer: string; autoAdvance: boolean },
    ) => Promise<void>;
    pending: boolean;
  },
) {
  const [reviewer, setReviewer] = useState(
      studio?.preferences.reviewer || "You",
    ),
    [autoAdvance, setAutoAdvance] = useState(
      studio?.preferences.autoAdvance ?? false,
    );
  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ reviewer: reviewer.trim() || "You", autoAdvance });
      }}
    >
      <label>
        Reviewer name<input
          value={reviewer}
          maxLength={80}
          onChange={(e) => setReviewer(e.target.value)}
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={autoAdvance}
          onChange={(e) => setAutoAdvance(e.target.checked)}
        />Move to the next stage after I approve
      </label>
      <p className="muted">
        Generation and approval always remain separate actions.
      </p>
      <button className="primary" disabled={pending}>Save preferences</button>
    </form>
  );
}
type OriginalAsset = {
  imageId: string;
  node: Artifact;
  name: string;
  sources: {
    node: Artifact;
    referenceId: string;
    name: string;
    position: number;
  }[];
};
function inputOriginals(nodes: Artifact[]): OriginalAsset[] {
  const originals = new Map<string, OriginalAsset>();
  for (const node of nodes) {
    if (node.kind !== "inputs") continue;
    node.references.forEach((reference, index) => {
      if (reference.kind !== "image" || !reference.value.startsWith("asset:")) {
        return;
      }
      const imageId = reference.value.slice(6);
      let original = originals.get(imageId);
      if (!original) {
        original = { imageId, node, name: reference.name, sources: [] };
        originals.set(imageId, original);
      }
      original.sources.push({
        node,
        referenceId: reference.id,
        name: reference.name,
        position: index + 1,
      });
    });
  }
  return [...originals.values()];
}
export function Assets(
  { b, filter, setFilter, onOpen, onExport }: {
    b: ReadyArtifacts;
    filter: string;
    setFilter: (value: string) => void;
    onOpen: (id: string) => void;
    onExport: () => void;
  },
) {
  const originals = filter === "all" || filter === "originals"
    ? inputOriginals(b.w.nodes)
    : [];
  const nodes = b.w.nodes.filter((n) =>
    filter !== "originals" && n.kind !== "inputs" &&
    (filter === "all" || (filter === "approved" ? n.approved : !n.approved))
  );
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Project assets</h1>
          <p>Original inputs, boards and revisions from this project.</p>
        </div>
        <button onClick={onExport}>
          <Download size={14} />Export project
        </button>
      </div>
      <div className="view-tabs">
        {["all", "originals", "approved", "review"].map((id) => (
          <button
            key={id}
            className={filter === id ? "active" : ""}
            onClick={() => setFilter(id)}
          >
            {id === "all"
              ? "All assets"
              : id === "originals"
              ? "Originals"
              : id === "approved"
              ? "Approved"
              : "In review"}
          </button>
        ))}
      </div>
      <div className="asset-grid">
        {originals.map((original) => (
          <Asset
            key={"original:" + original.imageId}
            node={original.node}
            original={original}
            onOpen={() => onOpen(original.node.id)}
          />
        ))}
        {nodes.map((n) => (
          <Asset
            key={n.id}
            node={n}
            onOpen={() => onOpen(n.id)}
          />
        ))}
      </div>
      {!nodes.length && !originals.length && <p>No assets in this view yet.</p>}
    </div>
  );
}
function Asset(
  { node, original, onOpen }: {
    node: Artifact;
    original?: OriginalAsset;
    onOpen: () => void;
  },
) {
  const [image, setImage] = useState(""), [error, setError] = useState("");
  const [metadata, setMetadata] = useState<{ mime?: string; hash?: string }>(
      {},
    ),
    [retry, setRetry] = useState(0);
  const title = original?.name ||
    `${stageNames[stageOf(node)]} v${node.revision}`;
  useEffect(() => {
    let alive = true;
    setError("");
    void (async () => {
      const data = await call<any>("benchContent", {
        artifactId: node.id,
        ...original ? { imageId: original.imageId } : {},
      });
      let img = original
        ? data.images?.find((image: any) => image.id === original.imageId)
        : data.images?.[0];
      if (!original && !img && data.imageIds?.[0]) {
        const page = await call<any>("benchContent", {
          artifactId: node.id,
          imageId: data.imageIds[0],
        });
        img = page.images?.[0];
      }
      if (original && !img?.dataUrl) {
        throw Error(
          "The original image is unavailable. Restore its source or retry.",
        );
      }
      if (alive) {
        setImage(img?.dataUrl || "");
        setMetadata({ mime: img?.mime, hash: img?.hash });
      }
    })().catch((e) => {
      if (alive) setError(errorText(e));
    });
    return () => {
      alive = false;
    };
  }, [node.id, original?.imageId, retry]);
  return (
    <article className="asset">
      <button
        className="asset-open"
        aria-label={original ? `Open original ${title}` : title}
        onClick={onOpen}
      >
        {image ? <img src={image} alt={title} loading="lazy" /> : (
          <span>
            {isWorkingControls(node)
              ? "Interactive HTML"
              : error || "Loading artwork…"}
          </span>
        )}
      </button>
      <h3>
        {original ? title : `${stageNames[stageOf(node)]} / v${node.revision}`}
      </h3>
      <p>{original ? "Original input image" : reviewLabel(node)}</p>
      {original && (
        <details className="asset-provenance">
          <summary>Source details</summary>
          <p>{metadata.mime || "Image"}</p>
          <span className="hash">Owned image: {original.imageId}</span>
          {metadata.hash && (
            <span className="hash">SHA-256: {metadata.hash}</span>
          )}
          <ol>
            {original.sources.map((source) => (
              <li key={`${source.node.id}:${source.referenceId}`}>
                {source.node.name} · Inputs v{source.node.revision} · Reference
                {" "}
                {source.position}: {source.name}
                <small className="hash">
                  {source.node.id} / {source.referenceId}
                </small>
              </li>
            ))}
          </ol>
        </details>
      )}
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => setRetry((value) => value + 1)}>
            Retry image
          </button>
        </p>
      )}
    </article>
  );
}
export function NativeFeedback({ b }: { b: ReadyArtifacts }) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    const feedback = (b.w as any).studio?.feedback || [];
    if (active) {
      setItems(
        Array.isArray(feedback)
          ? feedback.filter((f: any) => f.artifactId === b.node.id)
          : [],
      );
    }
    return () => {
      active = false;
    };
  }, [b.w, b.node.id]);
  return (
    <div className="agent-conversation">
      {b.node.note && (
        <div className="agent-note">
          <span>You</span>
          <p>{b.node.note}</p>
        </div>
      )}
      {items.map((item) => (
        <Feedback key={item.id} artifactId={b.node.id} item={item} />
      ))}
      {!items.length && !b.node.note && (
        <p className="agent-hint">
          Inspect the output, add a revision instruction, or approve it to
          continue.
        </p>
      )}
    </div>
  );
}
function Feedback({ artifactId, item }: { artifactId: string; item: any }) {
  const [images, setImages] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      for (const [kind, imageId] of Object.entries(item.images || {})) {
        const out = await call<any>("studioEvidence", {
          artifactId,
          feedbackId: item.id,
          imageId,
        });
        if (active && out.image?.dataUrl) {
          setImages((previous) => ({ ...previous, [kind]: out.image.dataUrl }));
        }
      }
    })().catch((e) => {
      if (active) setError(errorText(e));
    });
    return () => {
      active = false;
    };
  }, [artifactId, item.id]);
  return (
    <div className="agent-note">
      <span>You · comparison feedback</span>
      <p>{item.comment}</p>
      <div className="agent-attachment-grid">
        {Object.entries(images).map(([kind, src]) => (
          <figure key={kind}>
            <img src={src} alt={kind + " comparison evidence"} />
            <figcaption>{kind}</figcaption>
          </figure>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <small>Evidence saved · {item.runId || "Native agent handoff"}</small>
    </div>
  );
}

export function Help() {
  return (
    <div className="studio-help">
      <p>
        Work through four reviewable stages. Every output starts as a draft.
      </p>
      <ol>
        <li>
          <strong>Directions.</strong>{" "}
          Create or upload four directions, choose one and approve the revision.
        </li>
        <li>
          <strong>Artboard.</strong>{" "}
          Develop the exact approved direction into a concept board.
        </li>
        <li>
          <strong>Components.</strong>{" "}
          Derive the visual controls and states from your approved artboard.
        </li>
        <li>
          <strong>Review.</strong>{" "}
          Open a Wonop coding session to implement the component board. Test the
          live controls, capture their actual state, and compare it with the
          artwork.
        </li>
      </ol>
      <p>
        Select an area with the pointer, or use Enter and arrow keys on the
        comparison canvas. Shift + arrows resize it. Send the three images and
        an optional comment with one action.
      </p>
      <p>
        Agent handoff is not completion. A new HTML revision must be published
        and reviewed before you approve it.
      </p>
      <p>
        Keyboard: ⌘ / Ctrl K opens commands; 1–4 select stages; [ toggles
        workflow; ] toggles Agent. Shortcuts pause while typing or inside a
        dialog.
      </p>
    </div>
  );
}
