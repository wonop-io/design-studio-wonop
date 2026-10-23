import { type CSSProperties, useEffect, useRef, useState } from "react";
import { ChevronDown, Crop, RefreshCw, SlidersHorizontal } from "lucide-react";
import { call } from "../../../design-bench/ui/src/native";
import {
  type Artifact,
  isWorkingControls,
} from "../../../design-bench/ui/src/artifacts/model";
import type { ReadyArtifacts } from "../../../design-bench/ui/src/artifacts/useArtifacts";
import { useNativeTheme } from "./useNativeTheme";
import {
  captureFrame,
  type LoadedFrame,
  prepareFrame,
  type RawContent,
  saveCapture,
} from "./capture";
import {
  createCrops,
  type Crops,
  loadImage,
  validArea,
} from "./comparisonPixels";
import {
  type Area,
  type Attempt,
  type Capture,
  errorText,
  stagePng,
  type StudioWorkspace,
  useStudioDraft,
} from "./studioApi";
export function Comparison({ b }: { b: ReadyArtifacts }) {
  const { node } = b, studio = (b.w as StudioWorkspace).studio;
  const saved = studio?.drafts[node.id + ":selection"];
  const draft = useStudioDraft(node.id, "selection", saved);
  const [refresh, setRefresh] = useState(0),
    [view, setView] = useState<"compare" | "live" | "capture">("live"),
    [mode, setMode] = useState<"select" | "reveal">(
      saved?.selection?.mode || "reveal",
    );
  const [reveal, setReveal] = useState(saved?.selection?.reveal ?? 50),
    [area, setArea] = useState<Area | undefined>(saved?.selection?.area);
  const [loaded, setLoaded] = useState<LoadedFrame>(),
    [capture, setCapture] = useState<Capture>(),
    [rendered, setRendered] = useState(""),
    [artwork, setArtwork] = useState("");
  const [sourceRatio, setSourceRatio] = useState(0),
    [fitWidth, setFitWidth] = useState<number>(),
    [crops, setCrops] = useState<Crops>(),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Preparing interactive HTML…"),
    [busy, setBusy] = useState(false),
    [tray, setTray] = useState(true),
    [fit, setFit] = useState(true);
  const [width, setWidth] = useState(1000),
    [height, setHeight] = useState(800),
    [frameReady, setFrameReady] = useState(false);
  const [captureTheme, setCaptureTheme] = useState<"light" | "dark">();
  const viewport = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement>(null),
    canvas = useRef<HTMLDivElement>(null),
    anchor = useRef<{ x: number; y: number } | undefined>(undefined),
    frameWait = useRef<(() => void) | undefined>(undefined),
    alive = useRef(true),
    locked = useRef(false);
  const operation = useRef(saved?.selection?.operationId || ""),
    attempt = useRef<Attempt | undefined>(saved?.selection?.attempt),
    sent = useRef(false);
  const theme = useNativeTheme(), frameTheme = captureTheme ?? theme;
  const selection = {
    area,
    reveal,
    mode,
    ...operation.current ? { operationId: operation.current } : {},
    ...attempt.current ? { attempt: attempt.current } : {},
  };
  function retain(
    patch: { area?: Area; reveal?: number; mode?: "select" | "reveal" },
    text = draft.draft.text,
  ) {
    draft.update({ text, selection: { ...selection, ...patch } });
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setStatus("Preparing interactive HTML…");
    setError("");
    setCapture(undefined);
    setRendered("");
    setCrops(undefined);
    void (async () => {
      const fresh = await prepareFrame(node);
      if (cancelled) return;
      setLoaded(fresh);
      setFrameReady(false);
      setStatus(
        "Interactive HTML ready. Capture the current controls to compare.",
      );
      const current = await call<{ capture?: Capture }>("studioEvidence", {
        artifactId: node.id,
      });
      if (cancelled) return;
      const stored = current.capture;
      const sourceId = stored?.sourceId || node.sources?.map((s) =>
        b.w.nodes.find((n) => n.id === s.id)
      ).find((n) =>
        n?.kind === "components" && !isWorkingControls(n)
      )?.id ||
        b.w.nodes.find((n) => n.id === node.parent && n.kind === "components")
          ?.id;
      if (!sourceId) {
        throw Error("The exact source component board is unavailable.");
      }
      const source = await call<RawContent>("benchContent", {
        artifactId: sourceId,
      });
      if (cancelled) return;
      let image = source.images?.[0];
      if (!image && source.imageIds?.[0]) {
        const page = await call<RawContent>("benchContent", {
          artifactId: sourceId,
          imageId: source.imageIds[0],
        });
        image = page.images[0];
      }
      if (cancelled) return;
      if (!image?.dataUrl) {
        throw Error("The source component board image could not load.");
      }
      setArtwork(image.dataUrl);
      if (
        stored &&
        (stored.contentHash === fresh.rawHash ||
          attempt.current?.captureId === stored.id)
      ) {
        const evidence = await call<{ image?: { dataUrl: string } }>(
          "studioEvidence",
          { artifactId: node.id, imageId: stored.imageId },
        );
        if (cancelled) return;
        if (evidence.image?.dataUrl) {
          setCapture(stored);
          setRendered(evidence.image.dataUrl);
          setWidth(stored.width);
          setHeight(Math.min(stored.height, 800));
          setView("compare");
          setStatus(
            stored.contentHash === fresh.rawHash
              ? "Stored capture matches the current HTML. Capture again after changing live controls."
              : "Pending send uses a previous HTML capture. Retry its original send or capture the current HTML.",
          );
        }
      }
    })().catch((e) => {
      if (!cancelled) setError(errorText(e));
    });
    return () => {
      cancelled = true;
    };
  }, [node.id, node.legacyVersion, node.html, refresh]);
  useEffect(() => {
    if (
      !capture || !loaded || capture.contentHash === loaded.rawHash ||
      attempt.current?.captureId === capture.id
    ) return;
    setCapture(undefined);
    setRendered("");
    setCrops(undefined);
  }, [capture, loaded]);
  useEffect(() => {
    let cancelled = false;
    setCrops(undefined);
    if (!area || !rendered || !artwork) return;
    void Promise.all([loadImage(artwork), loadImage(rendered)]).then(
      ([a, u]) => {
        if (!cancelled) {
          const next = createCrops(a, u, area);
          setCrops(next);
          setStatus(
            `Three images ready · ${next.bounds.width} × ${next.bounds.height} pixels each · Mean RGB difference ${
              next.mean.toFixed(1)
            } / 255 · Difference emphasis 3×.`,
          );
        }
      },
    ).catch((e) => {
      if (!cancelled) setError(errorText(e));
    });
    return () => {
      cancelled = true;
    };
  }, [area, artwork, rendered]);
  async function takeCapture() {
    if (locked.current || !frame.current) return;
    const previousView = view, snapshotTheme = theme;
    locked.current = true;
    setBusy(true);
    setCaptureTheme(snapshotTheme);
    setView("live");
    setError("");
    setStatus("Reading exact current HTML…");
    try {
      const fresh = await prepareFrame(node);
      if (!alive.current) return;
      let actual = loaded;
      if (
        !actual || actual.rawHash !== fresh.rawHash ||
        actual.html !== fresh.html
      ) {
        actual = fresh;
        setFrameReady(false);
        const ready = new Promise<void>((resolve) => {
          frameWait.current = resolve;
        });
        setLoaded(fresh);
        await Promise.race([
          ready,
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(Error("Preview did not become ready. Retry capture.")),
              10000,
            )
          ),
        ]);
      }
      if (!frame.current || !alive.current) {
        throw Error("Preview closed before capture.");
      }
      // Keep this same iframe on screen through a parent paint, so its child
      // animation frames run even when capture began in the Capture tab.
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Preview did not become visible. Retry capture.")),
          10000,
        );
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve();
          })
        );
      });
      if (!frame.current || !alive.current) {
        throw Error("Preview closed before capture.");
      }
      setStatus("Capturing actual controls, fonts and images…");
      const png = await captureFrame(frame.current, actual);
      const stored = await saveCapture(node, actual, png, snapshotTheme);
      if (!alive.current) return;
      attempt.current = undefined;
      operation.current = "";
      sent.current = false;
      draft.update({
        text: draft.draft.text,
        selection: { area, reveal, mode },
      });
      setLoaded(actual);
      setCapture(stored);
      setRendered(png.image);
      setCrops(undefined);
      setView("compare");
      setStatus(
        "Actual HTML capture saved. Select an area to send to the agent.",
      );
      await b.reload();
    } catch (e) {
      if (alive.current) {
        setError(errorText(e));
        setStatus("Capture failed. Your selection and comment are preserved.");
        setView(previousView);
      }
    } finally {
      locked.current = false;
      if (alive.current) {
        setBusy(false);
        setCaptureTheme(undefined);
      }
    }
  }
  async function send() {
    const retained = attempt.current,
      replay = retained && retained.comment === draft.draft.text &&
        JSON.stringify(retained.area) === JSON.stringify(area);
    if (locked.current || (!replay && (!crops || !capture || !area))) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setStatus("Saving comparison evidence…");
    try {
      let payload = attempt.current;
      const same = replay;
      if (!same) {
        if (!b.builderWindowId || b.sessionIssue) {
          throw Error("Choose a ready Wonop agent session.");
        }
        const fresh = await call<RawContent>("benchContent", {
          artifactId: node.id,
        });
        if (fresh.contentHash !== capture!.contentHash) {
          setCapture(undefined);
          setRendered("");
          throw Error(
            "HTML changed. Capture the current revision before sending.",
          );
        }
        operation.current = crypto.randomUUID();
        const images = { artwork: "", ui: "", difference: "" };
        for (const kind of ["artwork", "ui", "difference"] as const) {
          images[kind] = await stagePng(crops!.images[kind], kind + ".png");
        }
        payload = {
          builder: b.builder,
          builderWindowId: b.builderWindowId,
          operationId: operation.current,
          captureId: capture!.id,
          comment: draft.draft.text,
          area: area!,
          bounds: crops!.bounds,
          images,
        };
        attempt.current = payload;
      }
      // Persist the exact staged IDs before dispatch. A retry after an uncertain
      // reply or window recovery replays this immutable native request.
      await draft.save({
        text: draft.draft.text,
        selection: {
          ...selection,
          operationId: payload!.operationId,
          attempt: payload,
        },
      });
      const result = await call<
        { run: { id: string; status: string }; feedback: { id: string } }
      >("studioFeedback", { artifactId: node.id, ...payload });
      if (!result.run?.id || !result.feedback?.id) {
        throw Error(
          "Handoff acknowledgement is unavailable. Retry this same send.",
        );
      }
      sent.current = true;
      setStatus(
        `Evidence saved · Agent run ${result.run.status}. Output still requires publication and human review.`,
      );
      try {
        await draft.save({
          text: "",
          selection: {
            ...selection,
            operationId: undefined,
            attempt: undefined,
          },
        });
        attempt.current = undefined;
        operation.current = "";
      } catch (cleanupError) {
        setError(
          "Evidence was saved, but clearing the sent draft was not confirmed. Retry draft saving. " +
            errorText(cleanupError),
        );
      }
      await b.reload();
    } catch (e) {
      setError(errorText(e));
      setStatus(
        "Send was not confirmed. Your selection, comment and retry identity are preserved.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function point(event: { clientX: number; clientY: number }) {
    const rect = canvas.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }
  function move(event: { clientX: number; clientY: number }) {
    const p = point(event);
    if (mode === "reveal") setReveal(Math.round(p.x * 100));
    else if (anchor.current) {
      const next = {
        x: Math.min(anchor.current.x, p.x),
        y: Math.min(anchor.current.y, p.y),
        width: Math.abs(p.x - anchor.current.x),
        height: Math.abs(p.y - anchor.current.y),
      };
      setArea(next);
      return next;
    }
  }
  const canReplay = !!attempt.current &&
    attempt.current.comment === draft.draft.text &&
    JSON.stringify(attempt.current.area) === JSON.stringify(area);
  const ratio = Math.max(
    sourceRatio,
    capture ? capture.height / capture.width : height / width,
  );
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () =>
      setFitWidth(
        Math.max(
          1,
          Math.min(
            element.clientWidth - 32,
            (element.clientHeight - 32) / ratio,
          ),
        ),
      );
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [ratio, view]);
  const canvasStyle = {
    "--split": reveal + "%",
    aspectRatio: `1 / ${ratio || 1}`,
    ...fit && fitWidth ? { width: fitWidth } : {},
  } as CSSProperties;
  return (
    <>
      <div
        className="native-review-toolbar"
        role="toolbar"
        aria-label="Implementation review tools"
      >
        <div
          className="view-tabs"
          role="tablist"
          aria-label="Implementation views"
        >
          {(["compare", "live", "capture"] as const).map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              disabled={busy || (id !== "live" && !rendered)}
              onClick={() => setView(id)}
            >
              {id === "live"
                ? "Live controls"
                : id === "compare"
                ? "Compare"
                : "Capture"}
            </button>
          ))}
        </div>
        <span className="review-source">
          {capture
            ? `${capture.width} × ${capture.height} · ${capture.theme}${
              loaded && capture.contentHash !== loaded.rawHash
                ? " · Previous capture"
                : ""
            }`
            : "Actual interactive HTML"}
        </span>
        <div className="native-zoom">
          <button onClick={() => setFit(true)}>Fit board</button>
          <button onClick={() => setFit(false)}>Fit width</button>
        </div>
      </div>
      {view !== "compare" && (
        <div className="capture-tools">
          <label>
            Width{" "}
            <input
              type="number"
              min={320}
              max={2400}
              value={width}
              disabled={busy}
              onChange={(e) => {
                setWidth(
                  Math.max(320, Math.min(2400, Number(e.target.value) || 1000)),
                );
              }}
            />
          </label>
          <label>
            Height{" "}
            <input
              type="number"
              min={320}
              max={1600}
              value={height}
              disabled={busy}
              onChange={(e) =>
                setHeight(
                  Math.max(320, Math.min(1600, Number(e.target.value) || 800)),
                )}
            />
          </label>
          <span>{frameTheme} theme</span>
          <button
            disabled={busy || !frameReady || !loaded}
            onClick={() => void takeCapture()}
          >
            <RefreshCw size={13} />
            {busy ? "Working…" : "Capture current state"}
          </button>
        </div>
      )}
      {view === "compare" && rendered && (
        <div
          className="native-compare-toolbar"
          role="toolbar"
          aria-label="Comparison controls"
        >
          <div className="native-segment">
            {[[0, "Rendered"], [50, "Split"], [100, "Artwork"]].map((
              [value, label],
            ) => (
              <button
                key={value}
                aria-pressed={reveal === value}
                onClick={() => {
                  setReveal(Number(value));
                  retain({ reveal: Number(value) });
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="native-reveal">
            Reveal{" "}
            <input
              type="range"
              min={0}
              max={100}
              value={reveal}
              aria-label="Artwork reveal"
              onChange={(e) => {
                setReveal(Number(e.target.value));
                retain({ reveal: Number(e.target.value) });
              }}
            />
            <output>{reveal} / {100 - reveal}</output>
          </label>
          <div className="native-segment">
            <button
              aria-pressed={mode === "reveal"}
              onClick={() => {
                setMode("reveal");
                retain({ mode: "reveal" });
              }}
            >
              <SlidersHorizontal size={13} />Slide
            </button>
            <button
              aria-pressed={mode === "select"}
              onClick={() => {
                setMode("select");
                retain({ mode: "select" });
              }}
            >
              <Crop size={13} />Select area
            </button>
          </div>
          <button
            disabled={!area}
            onClick={() => {
              setArea(undefined);
              retain({ area: undefined });
              operation.current = "";
            }}
          >
            Clear
          </button>
          {area && (
            <button onClick={() => setTray(!tray)}>Selection tray</button>
          )}
          {mode === "select" && (
            <small>
              Enter selects center · arrows move · Shift arrows resize
            </small>
          )}
        </div>
      )}
      <div
        ref={viewport}
        className={"native-review-viewport " +
          (view === "live" ? "live-viewport" : "")}
      >
        <div
          className={view === "live" ? "live-container" : "capture-offscreen"}
          inert={view !== "live" || busy}
          aria-hidden={view !== "live"}
        >
          {loaded && (
            <iframe
              key={loaded.channel}
              ref={frame}
              title="Live implemented component controls"
              sandbox="allow-scripts"
              srcDoc={loaded.srcDoc}
              style={{ width, height, colorScheme: frameTheme }}
              onLoad={() => {
                setFrameReady(true);
                frameWait.current?.();
                frameWait.current = undefined;
              }}
            />
          )}
        </div>
        {view === "capture" && rendered && (
          <img
            className={"native-capture " + (fit ? "fit" : "")}
            src={rendered}
            alt="Actual rendered HTML capture"
          />
        )}
        {view === "compare" && rendered && artwork && (
          <div
            ref={canvas}
            className={"comparison " + (mode === "select" ? "selecting" : "") +
              (fit ? " fit" : "")}
            style={canvasStyle}
          >
            <div className="artwork">
              <img
                src={artwork}
                draggable={false}
                alt="Approved original component artwork"
                onLoad={(e) =>
                  setSourceRatio(
                    e.currentTarget.naturalHeight /
                      e.currentTarget.naturalWidth,
                  )}
              />
            </div>
            <div className="implementation">
              <img
                src={rendered}
                draggable={false}
                alt="Actual rendered component capture"
              />
            </div>
            {area && (
              <div
                className="selection-box"
                style={{
                  left: area.x * 100 + "%",
                  top: area.y * 100 + "%",
                  width: area.width * 100 + "%",
                  height: area.height * 100 + "%",
                }}
              />
            )}
            <div className="divider">
              <span className="handle" aria-hidden="true">↔</span>
            </div>
            <button
              className="drag"
              aria-label={mode === "select"
                ? "Select comparison area. Enter selects center; arrows move; Shift arrows resize."
                : "Move comparison divider with arrow keys."}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                anchor.current = point(e);
                move(e);
              }}
              onPointerMove={(e) => {
                if (anchor.current) move(e);
              }}
              onPointerUp={(e) => {
                if (!anchor.current) return;
                const next = move(e);
                anchor.current = undefined;
                setTray(true);
                retain(
                  mode === "select"
                    ? { area: next }
                    : { reveal: Math.round(point(e).x * 100) },
                );
                operation.current = "";
                sent.current = false;
              }}
              onPointerCancel={() => {
                anchor.current = undefined;
              }}
              onKeyDown={(e) => {
                if (
                  mode === "reveal" &&
                  ["ArrowLeft", "ArrowRight"].includes(e.key)
                ) {
                  e.preventDefault();
                  const next = Math.max(
                    0,
                    Math.min(
                      100,
                      reveal +
                        (e.key === "ArrowLeft" ? -1 : 1) *
                          (e.shiftKey ? 10 : 1),
                    ),
                  );
                  setReveal(next);
                  retain({ reveal: next });
                  return;
                }
                if (mode !== "select") return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  const next = { x: .25, y: .25, width: .5, height: .5 };
                  setArea(next);
                  retain({ area: next });
                  setTray(true);
                  return;
                }
                if (!e.key.startsWith("Arrow")) return;
                e.preventDefault();
                const next = {
                    ...(area || { x: .25, y: .25, width: .5, height: .5 }),
                  },
                  delta = e.altKey ? .001 : .01;
                const horizontal = e.key === "ArrowLeft" ||
                    e.key === "ArrowRight",
                  negative = e.key === "ArrowLeft" || e.key === "ArrowUp",
                  key = e.shiftKey
                    ? (horizontal ? "width" : "height")
                    : (horizontal ? "x" : "y");
                next[key] += negative ? -delta : delta;
                if (validArea(next)) {
                  setArea(next);
                  retain({ area: next });
                  setTray(true);
                  operation.current = "";
                  sent.current = false;
                }
              }}
            />
          </div>
        )}
      </div>
      <div className="native-review-status" role="status" aria-live="polite">
        {status}
      </div>
      {error && (
        <div className="native-error" role="alert">
          {error}
          <button
            disabled={busy}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry preview
          </button>
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {draft.error && (
        <p role="alert">
          Draft could not save: {draft.error}{" "}
          <button onClick={draft.retry}>Retry draft</button>
        </p>
      )}
      {(view === "compare" || canReplay) && area && tray && (
        <section
          className="native-selection-tray"
          aria-label="Selected area comparison"
        >
          <div className="selection-tray-heading">
            <strong>Selected area</strong>
            <span>
              {crops
                ? `x ${crops.bounds.x}, y ${crops.bounds.y} · ${crops.bounds.width} × ${crops.bounds.height}`
                : "Preparing matching crops…"}
            </span>
            <button
              className="icon-btn"
              aria-label="Collapse selection tray"
              onClick={() => setTray(false)}
            >
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="native-crop-grid">
            {(["artwork", "ui", "difference"] as const).map((key, i) => (
              <figure key={key}>
                <figcaption>
                  {[
                    "Original artwork",
                    "Rendered components",
                    "Pixel difference",
                  ][i]}
                </figcaption>
                <div className="crop-preview">
                  {crops && (
                    <img
                      src={crops.images[key]}
                      alt={[
                        "Original artwork in selected area",
                        "Rendered components in selected area",
                        "Pixel difference in selected area",
                      ][i]}
                    />
                  )}
                </div>
              </figure>
            ))}
          </div>
          <form
            className="selection-agent-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="selection-comment">
              Comment <span>(optional)</span>
            </label>
            <textarea
              id="selection-comment"
              value={draft.draft.text}
              maxLength={4000}
              disabled={busy}
              onChange={(e) => {
                retain({}, e.target.value);
                sent.current = false;
              }}
              placeholder="What should the agent change?"
            />
            <div className="selection-agent-actions">
              <button
                disabled={busy || sent.current ||
                  (!canReplay && (!crops || !capture)) ||
                  (!canReplay && (!b.builderWindowId || !!b.sessionIssue)) ||
                  !!b.storageError}
              >
                Send to agent
              </button>
            </div>
          </form>
          {canReplay && (
            <small>A pending send will retry its original agent session.</small>
          )}
          {!canReplay && !b.builderWindowId && (
            <small>Choose a Wonop agent session in the Agent panel.</small>
          )}
        </section>
      )}
    </>
  );
}
