import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Check,
  Ellipsis,
  History,
  Image as ImageIcon,
  Maximize2,
  Menu,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  type ReadyArtifacts,
  useArtifacts,
} from "../../../design-bench/ui/src/artifacts/useArtifacts";
import { Inputs } from "../../../design-bench/ui/src/artifacts/Inputs";
import { AgentPanel } from "../../../design-bench/ui/src/artifacts/AgentPanel";
import {
  type Artifact,
  reviewLabel,
} from "../../../design-bench/ui/src/artifacts/model";
import { call } from "../../../design-bench/ui/src/native";
import { Comparison } from "./Comparison";
import {
  dialogFocusables,
  keepDialogTab,
} from "../../../design-bench/ui/src/artifacts/dialogFocus";
import { errorText, type StudioWorkspace } from "./studioApi";
import { stageNames, stageOf, titles, when } from "./stages";
import {
  Activity,
  Assets,
  Details,
  Help,
  Instruction,
  NativeFeedback,
  Preferences,
} from "./StudioPanels";
function Modal(
  { title, children, onClose }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
  },
) {
  const element = useRef<HTMLDialogElement>(null),
    restore = useRef<HTMLElement | null>(document.activeElement as HTMLElement);
  useEffect(() => {
    element.current?.showModal();
    return () => {
      if (restore.current?.isConnected) restore.current.focus();
    };
  }, []);
  return (
    <dialog
      ref={element}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
export function StudioApp() {
  const b = useArtifacts();
  return b.w && b.node
    ? (
      <Project
        key={(b.w as StudioWorkspace).studio?.projectId || "project"}
        b={b as ReadyArtifacts}
      />
    )
    : (
      <div className="app">
        <header className="topbar" data-wm-drag>
          <h1 className="window-title">Design Studio</h1>
        </header>
        <main className="main initial-state">
          <h2>Opening your project</h2>
          <p>Loading the native project workspace…</p>
          {(b.storageError || b.error) && (
            <div className="native-error" role="alert">
              <p>
                {(b.storageError || b.error).replace(
                  "Design Bench",
                  "Design Studio",
                )}
              </p>
              <button
                disabled={b.storageRetrying}
                onClick={() =>
                  void (b.storageError ? b.retryStorage() : b.reload())}
              >
                {b.storageRetrying ? "Retrying…" : "Retry"}
              </button>
            </div>
          )}
        </main>
      </div>
    );
}
function Project({ b }: { b: ReadyArtifacts }) {
  const studio = (b.w as StudioWorkspace).studio,
    root = b.w.nodes.filter((n) => n.kind === "inputs").at(-1) ||
      b.path.find((n) => n.kind === "inputs");
  const [stage, setStage] = useState(Math.max(0, stageOf(b.node))),
    [page, setPage] = useState<"project" | "assets">("project"),
    [panel, setPanel] = useState("agent");
  const [rail, setRail] = useState(false),
    [inspector, setInspector] = useState(false),
    [mobile, setMobile] = useState(false),
    [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [fit, setFit] = useState(true),
    [zoom, setZoom] = useState<string>();
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(false),
    approval = useRef<{ id: string; stage: number } | undefined>(undefined),
    retainStage = useRef<number | null>(null);
  const [inputDirty, setInputDirty] = useState(false);
  const inputChanged = useCallback((dirty: boolean) => {
    setInputDirty(dirty);
    b.setDirty(dirty);
  }, [b.node.id]);
  const file = useRef<HTMLInputElement>(null),
    main = useRef<HTMLElement>(null),
    selected = stageOf(b.node),
    display = selected === stage && b.node.kind !== "inputs";
  const groups = stageNames.map((_, i) =>
      b.w.nodes.filter((n) => stageOf(n) === i)
    ),
    latest = groups.map((nodes) => nodes.at(-1));
  const canVisit = (i: number) =>
    i === 0 || !!latest[i] || groups[i - 1]?.some((n) => n.approved);
  function toggleAgent() {
    const compact = matchMedia("(max-width:1050px)").matches;
    if (page !== "project") {
      setPage("project");
      setPanel("agent");
      setInspector(false);
      setDrawer(compact);
    } else if (compact) setDrawer((value) => !value);
    else setInspector((value) => !value);
  }
  function go(i: number, from?: Artifact) {
    if (!canVisit(i)) return;
    setStage(i);
    setPage("project");
    setMobile(false);
    const target = from
      ? groups[i].findLast((n) =>
        (n.parent === from.id ||
          n.sources?.some((source) => source.id === from.id)) &&
        (from.kind !== "directions" ||
          n.variant === (b.w.directionChoices?.[from.id] ?? from.variant))
      )
      : groups[i].findLast((n) => b.path.some((p) => p.id === n.id)) ||
        latest[i];
    if (target && target.id !== b.node.id) b.select(target.id);
    else if (!target) {
      const source = from ||
        (i === 0 ? root : groups[i - 1].findLast((n) => n.approved));
      if (source && source.id !== b.node.id) {
        retainStage.current = i;
        b.select(source.id);
      }
    }
    main.current?.focus();
  }
  useEffect(() => {
    if (retainStage.current !== null) {
      setStage(retainStage.current);
      retainStage.current = null;
    } else if (b.node.kind === "inputs") setStage(0);
    else if (selected >= 0) setStage(selected);
  }, [b.node.id]);
  useEffect(() => {
    const requested = approval.current;
    if (requested && b.w.nodes.find((n) => n.id === requested.id)?.approved) {
      approval.current = undefined;
      if (studio?.preferences.autoAdvance && requested.stage < 3) {
        go(requested.stage + 1, b.w.nodes.find((n) => n.id === requested.id));
      }
    }
  }, [b.w]);
  useEffect(() => {
    document.title = (root?.name || "New project") + " — Design Studio";
  }, [root?.name]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const editable = (e.target as HTMLElement)?.closest(
        "input,textarea,select,[contenteditable=true]",
      );
      if (editable || modal) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal("commands");
        return;
      }
      if (e.key === "[") setRail((v) => !v);
      else if (e.key === "]") toggleAgent();
      else if (/^[1-4]$/.test(e.key)) go(Number(e.key) - 1);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [modal, b.w, stage, page]);
  async function action(command: string, args: unknown = {}, success?: string) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const out = await call<any>(command, args);
      if (success) setNotice(success);
      await b.reload();
      return out;
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  async function exportProject() {
    const out = await action("studioExport");
    if (out) setNotice(out.saved ? "Project exported." : "Export cancelled.");
  }
  function approve() {
    approval.current = { id: b.node.id, stage };
    b.approve();
  }
  const sourceForStage = stage === 0
    ? root
    : selected === stage - 1 && b.node.approved
    ? b.node
    : groups[stage - 1]?.findLast((n) => n.approved);
  const blocked = b.storageError || b.sourceNeedingReview || !b.previewReady ||
    b.busy;
  const canApprove = display && !b.node.approved && !blocked &&
    (stage !== 0 ||
      (b.directionChoice >= 0 && !b.directionSaving && !b.directionError));
  const inputReady = b.node.kind !== "inputs" ||
    (!inputDirty && !b.inputSaving && !b.inputReceipt &&
      !!b.node.brief.trim());
  const canGenerate = inputReady && b.previewReady && !b.busy &&
    !b.storageError &&
    (display ? b.node.approved : !!sourceForStage?.approved || stage === 0) &&
    ((stage === 3)
      ? !!b.builderWindowId && !b.sessionIssue
      : b.imageStatus.ready);
  function upload(revise: boolean) {
    if (!file.current) return;
    file.current.dataset.revise = String(revise);
    file.current.click();
  }
  function renderInputs() {
    return (
      <Inputs
        key={b.node.id + ":" + b.inputEpoch}
        node={b.node}
        draft={b.inputDraft}
        onDraft={b.retainInputDraft}
        recovery={b.inputRecovery}
        receipt={b.inputReceipt}
        saving={b.inputSaving}
        writePaused={!!b.storageError}
        saveMessage={b.inputSaveMessage}
        onCancelSave={b.cancelInputSave}
        onRetryPending={b.retryInputSave}
        onSave={(name, brief, references) =>
          void b.append("inputs", b.node, {
            name,
            brief,
            references,
            revises: b.node.id,
          })}
        onComment={b.saveComment}
        onRemove={b.removeComment}
        onDirty={inputChanged}
      />
    );
  }
  useEffect(() => {
    const isNavigation = mobile && matchMedia("(max-width:760px)").matches,
      isInspector = drawer && matchMedia("(max-width:1050px)").matches;
    if (!isNavigation && !isInspector) return;
    const target = document.querySelector<HTMLElement>(
      isNavigation ? ".sidebar" : ".inspector-shell",
    );
    if (!target) return;
    const previous = document.activeElement as HTMLElement;
    target.setAttribute("role", "dialog");
    target.setAttribute("aria-modal", "true");
    target.setAttribute(
      "aria-label",
      isNavigation ? "Workflow navigation" : "Agent panel",
    );
    target.tabIndex = -1;
    const hidden: HTMLElement[] = [];
    for (
      const region of document.querySelectorAll<HTMLElement>(
        ".topbar,.sidebar,.stage-main,.inspector-shell",
      )
    ) {
      if (region !== target) {
        region.inert = true;
        hidden.push(region);
      }
    }
    const media = matchMedia(
        isNavigation ? "(max-width:760px)" : "(max-width:1050px)",
      ),
      resize = () => {
        if (!media.matches) {
          setMobile(false);
          setDrawer(false);
        }
      };
    media.addEventListener("change", resize);
    dialogFocusables(target)[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobile(false);
        setDrawer(false);
      } else keepDialogTab(e, target);
    };
    target.addEventListener("keydown", key);
    return () => {
      media.removeEventListener("change", resize);
      target.removeEventListener("keydown", key);
      target.removeAttribute("role");
      target.removeAttribute("aria-modal");
      target.removeAttribute("aria-label");
      hidden.forEach((el) => el.inert = false);
      if (previous?.isConnected) previous.focus();
    };
  }, [mobile, drawer]);
  const setup = b.node.kind === "inputs" && !b.node.brief.trim() &&
    !b.node.references.length;
  return (
    <div
      className={`app editor-mode ${rail ? "rail-collapsed" : ""} ${
        inspector ? "inspector-hidden" : ""
      } ${mobile ? "menu-open" : ""} ${drawer ? "mobile-inspector-open" : ""}`}
    >
      <header className="topbar" data-wm-drag>
        <div className="window-tools">
          <button
            className="icon-btn menu-toggle"
            aria-label="Open navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <button
            className="icon-btn desktop-toggle"
            aria-label="Toggle workflow rail"
            onClick={() => setRail(!rail)}
          >
            <PanelLeft />
          </button>
        </div>
        <h1 className="window-title">
          <button onClick={() => setPage("project")}>
            {root?.name || "New project"}
          </button>
        </h1>
        <p className="context">Design Studio</p>
        <div className="top-actions">
          <button
            className="icon-btn"
            aria-label="Commands"
            title="Commands ⌘K"
            onClick={() => {
              setQuery("");
              setModal("commands");
            }}
          >
            <Search />
          </button>
          <button
            onClick={() => {
              if (root?.id !== b.node.id && root) b.select(root.id);
              setPage("project");
            }}
          >
            Brief
          </button>
          <button
            aria-label="Toggle agent panel"
            onClick={toggleAgent}
          >
            Agent
          </button>
          <button
            className="icon-btn"
            aria-label="Project menu"
            onClick={() => setModal("menu")}
          >
            <Ellipsis />
          </button>
        </div>
      </header>
      <button
        className="mobile-shade"
        aria-label="Close navigation"
        onClick={() => setMobile(false)}
      />
      <aside className="sidebar">
        <div className="workflow-label">Workflow</div>
        <nav className="stage-tree" aria-label="Design workflow">
          {stageNames.map((name, i) => {
            const artifact = i === selected ? b.node : latest[i];
            return (
              <button
                key={name}
                aria-label={name}
                title={name}
                className={`tree-step ${
                  stage === i && page === "project" ? "active" : ""
                } ${artifact?.approved ? "is-approved" : ""}`}
                disabled={!canVisit(i)}
                aria-current={stage === i && page === "project"
                  ? "step"
                  : undefined}
                onClick={() => go(i)}
              >
                <span className="tree-icon">
                  {artifact?.approved ? <Check /> : i + 1}
                </span>
                <span className="tree-copy">
                  {name}
                  <small>
                    {artifact
                      ? reviewLabel(artifact)
                      : canVisit(i)
                      ? "Ready to create"
                      : "Locked"}
                  </small>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <nav className="nav">
            <button
              className={page === "assets" ? "active" : ""}
              onClick={() => setPage("assets")}
            >
              Assets
            </button>
            <button
              onClick={() =>
                void action(
                  "studioNewWindow",
                  {},
                  "New project window opened.",
                )}
            >
              <Plus size={13} />New project window
            </button>
          </nav>
        </div>
      </aside>
      <main ref={main} className="main artifact-main" tabIndex={-1}>
        {b.storageError && (
          <div className="native-error" role="alert">
            <p>Project storage is unavailable. {b.storageError}</p>
            <button
              disabled={b.storageRetrying}
              onClick={() => void b.retryStorage()}
            >
              {b.storageRetrying ? "Retrying…" : "Retry storage"}
            </button>
          </div>
        )}
        {(b.error || error) && (
          <div className="native-error" role="alert">
            <p>{error || b.error}</p>
            <button
              onClick={() => {
                setError("");
                b.clearError();
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        {(notice || b.notice) && (
          <div className="studio-notice" role="status">
            {notice || b.notice}
            {b.noticeOutput && (
              <button onClick={() => b.select(b.noticeOutput!)}>
                Open output
              </button>
            )}
            <button
              aria-label="Dismiss notice"
              onClick={() => {
                setNotice("");
                b.setNotice("");
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}
        {page === "assets"
          ? (
            <Assets
              b={b}
              filter={filter}
              setFilter={setFilter}
              onOpen={(id) => {
                b.select(id);
                setPage("project");
              }}
              onExport={() => void exportProject()}
            />
          )
          : (
            <div className="stage-layout">
              <section
                className={"stage-main " +
                  (stage === 3 && display ? "native-review" : "")}
                aria-label={titles[stage]}
              >
                <div className="stage-heading">
                  <h2>{setup ? "Start a project" : titles[stage]}</h2>
                  <div className="heading-actions">
                    {display && (
                      <>
                        <button onClick={() => setModal("history")}>
                          <History size={14} />v{b.node.revision}
                        </button>
                        <button
                          disabled={b.busy}
                          onClick={() => {
                            setPanel("agent");
                            if (
                              matchMedia("(max-width:1050px)").matches
                            ) setDrawer(true);
                            else setInspector(false);
                            document.querySelector<HTMLTextAreaElement>(
                              "#agent-instruction",
                            )?.focus();
                          }}
                        >
                          <RefreshCw size={14} />New revision
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {b.sourceNeedingReview && (
                  <p className="version-status">
                    A source revision needs review before approval.{" "}
                    <button onClick={() => b.select(b.sourceNeedingReview!.id)}>
                      Open source
                    </button>
                  </p>
                )}
                {b.node.kind === "inputs"
                  ? (
                    <div className="canvas-area setup-area">
                      {renderInputs()}
                      {!b.node.brief.trim() && b.node.references.length > 0 && (
                        <p className="sample-note">
                          Add a brief and save an input revision before
                          generating directions.
                        </p>
                      )}
                      {b.inputReceipt && (
                        <button className="primary" onClick={b.openSavedInput}>
                          Open saved inputs
                        </button>
                      )}
                      {!b.inputSaving && !b.inputReceipt &&
                        (b.node.brief || b.node.references.length > 0) && (
                        <div className="actions">
                          <button
                            className="primary"
                            disabled={!canGenerate}
                            onClick={() => b.derive()}
                          >
                            Create four directions<ArrowRight size={14} />
                          </button>
                          <button onClick={() => upload(false)}>
                            Upload four directions
                          </button>
                        </div>
                      )}
                    </div>
                  )
                  : display && stage === 3
                  ? <Comparison key={b.node.id} b={b} />
                  : (
                    <div className="canvas-area">
                      {display
                        ? (
                          <>
                            {b.previewState === "error" && (
                              <div className="native-error" role="alert">
                                {b.previewError}
                                <button onClick={b.retryPreview}>
                                  Retry preview
                                </button>
                              </div>
                            )}
                            {!b.previewReady && !b.previewRetained
                              ? <p role="status">Loading this revision…</p>
                              : stage === 0
                              ? (
                                <div className="directions">
                                  {b.node.images?.map((src, i) => (
                                    <article
                                      className={"direction " +
                                        (b.directionChoice === i
                                          ? "selected"
                                          : "")}
                                      key={i}
                                    >
                                      <button
                                        className="select-card"
                                        aria-pressed={b.directionChoice === i}
                                        disabled={b.node.approved ||
                                          b.directionSaving ||
                                          !!b.storageError || !src}
                                        onClick={() =>
                                          void b.chooseDirection(i)}
                                      >
                                        {src
                                          ? (
                                            <img
                                              src={src}
                                              alt={`Direction ${i + 1} artwork`}
                                            />
                                          )
                                          : <p>Image unavailable</p>}
                                        <div className="direction-copy">
                                          <h3>Direction {i + 1}</h3>
                                          <p>
                                            {b.directionChoice === i
                                              ? "Selected direction"
                                              : "Choose a direction to develop"}
                                          </p>
                                        </div>
                                      </button>
                                      {b.directionChoice === i && (
                                        <span className="chosen-mark">
                                          <Check />
                                        </span>
                                      )}
                                      <button
                                        className="icon-btn zoom-card"
                                        aria-label={`Enlarge direction ${
                                          i + 1
                                        }`}
                                        onClick={() => setZoom(src)}
                                      >
                                        <Maximize2 />
                                      </button>
                                    </article>
                                  ))}
                                </div>
                              )
                              : (
                                <>
                                  <div className="canvas-toolbar">
                                    <span className="pill">
                                      <ImageIcon size={13} />Board v{b.node
                                        .revision}
                                    </span>
                                    <div className="right">
                                      <button onClick={() => setFit(!fit)}>
                                        Fit / fill width
                                      </button>
                                      <button
                                        className="icon-btn"
                                        aria-label="Enlarge board"
                                        onClick={() =>
                                          setZoom(b.node.images?.[0])}
                                      >
                                        <Maximize2 />
                                      </button>
                                    </div>
                                  </div>
                                  <div
                                    className={"artboard-wrap " +
                                      (!fit ? "full" : "")}
                                  >
                                    {b.node.images?.[0]
                                      ? (
                                        <img
                                          src={b.node.images[0]}
                                          alt={`${
                                            titles[stage]
                                          } v${b.node.revision}`}
                                        />
                                      )
                                      : (
                                        <p>
                                          No image is available for this
                                          revision.
                                        </p>
                                      )}
                                  </div>
                                </>
                              )}
                            {b.directionError && (
                              <p role="alert">{b.directionError}</p>
                            )}
                          </>
                        )
                        : (
                          <div className="empty">
                            <h2>
                              {[
                                "Start with four possibilities",
                                "Bring your direction to life",
                                "Make the system tangible",
                                "Put the design to the test",
                              ][stage]}
                            </h2>
                            <p>
                              {stage === 3
                                ? "Turn your approved component board into interactive HTML, then compare it with its source."
                                : `Create ${
                                  titles[stage].toLowerCase()
                                } from the exact approved source revision.`}
                            </p>
                            <div className="actions">
                              <button
                                className="primary"
                                disabled={!canGenerate}
                                onClick={() => b.derive()}
                              >
                                {stage === 3
                                  ? "Implement components"
                                  : "Create " + stageNames[stage].toLowerCase()}
                              </button>
                              <button
                                disabled={b.importing}
                                onClick={() => upload(false)}
                              >
                                <Upload size={14} />Upload{" "}
                                {stage === 3 ? "HTML" : "artwork"}
                              </button>
                            </div>
                            <small>
                              {stage === 3
                                ? "Choose or open an agent session in the Agent panel."
                                : "Configured Wonop image generation. Every output starts unapproved."}
                            </small>
                          </div>
                        )}
                    </div>
                  )}
                {stage !== 3 && (
                  <div className="canvas-bottom">
                    <button onClick={() => setFit(true)}>Fit to window</button>
                    <button
                      disabled={!display}
                      onClick={() =>
                        setZoom(
                          b.node.images?.[
                            stage === 0 ? Math.max(0, b.directionChoice) : 0
                          ],
                        )}
                    >
                      <Maximize2 size={14} />Open board
                    </button>
                  </div>
                )}
              </section>
              <div className="inspector-shell">
                <button
                  className="drawer-close"
                  onClick={() => setDrawer(false)}
                >
                  Close Agent panel<X size={14} />
                </button>
                <aside className="inspector">
                  <div
                    className="inspector-tabs"
                    role="tablist"
                    aria-label="Project panel"
                  >
                    {["agent", "details", "activity"].map((id) => (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={panel === id}
                        className={panel === id ? "active" : ""}
                        onClick={() => setPanel(id)}
                      >
                        {id[0].toUpperCase() + id.slice(1)}
                      </button>
                    ))}
                  </div>
                  {panel === "agent"
                    ? (
                      <>
                        <div className="agent-context">
                          <p
                            className={"agent-state " +
                              (b.node.approved ? "approved" : "needs-review")}
                          >
                            {b.busy
                              ? "Agent run in progress."
                              : display
                              ? b.node.approved
                                ? "Approved. Continue when you are ready."
                                : "This revision needs your review."
                              : "Describe what the agent should make."}
                          </p>
                          <p className="muted">
                            {stage === 0
                              ? "Your creative brief is the starting point."
                              : `Using ${stageNames[stage - 1].toLowerCase()} ${
                                sourceForStage
                                  ? "v" + sourceForStage.revision
                                  : ""
                              }.`}
                          </p>
                        </div>
                        <NativeFeedback b={b} />
                        <AgentPanel b={b} />
                        <Instruction
                          key={b.node.id}
                          b={b}
                          display={display}
                          canGenerate={canGenerate}
                        />
                      </>
                    )
                    : panel === "details"
                    ? <Details b={b} />
                    : <Activity b={b} />}
                </aside>
                <div className="approval-bar">
                  <div>
                    <strong>
                      {display
                        ? b.node.approved
                          ? "Approved revision"
                          : stage === 0 && b.directionChoice < 0
                          ? "Select a direction"
                          : "Ready for your review"
                        : "Create this stage first"}
                    </strong>
                    <p>
                      {display && b.node.approved
                        ? "Approval applies to this exact revision."
                        : "Every output requires human approval."}
                    </p>
                  </div>
                  <div className="approval-actions actions">
                    <button
                      disabled={b.importing || b.busy}
                      onClick={() => upload(display)}
                    >
                      Upload
                    </button>
                    {display && b.node.approved
                      ? stage < 3
                        ? (
                          <button
                            className="primary"
                            disabled={!!b.storageError}
                            onClick={() => go(stage + 1, b.node)}
                          >
                            Continue<ArrowRight size={14} />
                          </button>
                        )
                        : (
                          <button
                            className="primary"
                            onClick={() => void exportProject()}
                          >
                            Export project
                          </button>
                        )
                      : (
                        <button
                          className="primary"
                          disabled={!canApprove}
                          onClick={approve}
                        >
                          Approve revision
                        </button>
                      )}
                  </div>
                  {display && !b.node.approved && (
                    <button
                      className="quiet"
                      disabled={b.reviewing}
                      onClick={() => setModal("reject")}
                    >
                      Needs changes
                    </button>
                  )}
                  {display && b.node.approved && (
                    <button
                      className="quiet"
                      disabled={b.reviewing}
                      onClick={() => setModal("withdraw")}
                    >
                      Withdraw approval
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
      </main>
      <input
        ref={file}
        hidden
        type="file"
        multiple={stage === 0}
        accept={stage === 3
          ? "text/html,.html"
          : "image/png,image/jpeg,image/webp"}
        onChange={(e) => {
          const files = Array.from(e.target.files || []),
            revising = e.target.dataset.revise === "true";
          e.target.value = "";
          void b.importOwn(files, Math.max(0, b.directionChoice), revising);
        }}
      />
      {modal && (
        <Modal
          title={modal === "help"
            ? "How Design Studio works"
            : modal === "history"
            ? "Revision history"
            : modal === "settings"
            ? "Project settings"
            : modal === "commands"
            ? "Commands"
            : modal === "brief"
            ? "The project brief"
            : modal === "withdraw"
            ? "Withdraw approval"
            : modal === "reject"
            ? "Request changes"
            : root?.name || "Project"}
          onClose={() => setModal("")}
        >
          {modal === "help"
            ? <Help />
            : modal === "history"
            ? (
              <div className="command-list">
                {groups[stage].map((n) => (
                  <button
                    className="command-row"
                    key={n.id}
                    aria-current={n.id === b.node.id ? "true" : undefined}
                    onClick={() => {
                      b.select(n.id);
                      setModal("");
                    }}
                  >
                    <span>
                      v{n.revision} · {reviewLabel(n)}
                      <small>{when(n.created)}</small>
                    </span>
                    {n.id === b.node.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )
            : modal === "settings"
            ? (
              <Preferences
                studio={studio}
                onSave={async (values) => {
                  const out = await action(
                    "studioPreferences",
                    values,
                    "Preferences saved.",
                  );
                  if (out) setModal("");
                }}
                pending={pending}
              />
            )
            : modal === "brief"
            ? b.node.kind === "inputs"
              ? renderInputs()
              : <p>Opening the project brief…</p>
            : (modal === "withdraw" || modal === "reject")
            ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const reason = new FormData(e.currentTarget).get(
                    "reason",
                  ) as string;
                  b.review(
                    modal === "reject" ? "rejected" : "withdrawn",
                    reason,
                  );
                  setModal("");
                }}
              >
                <label>
                  Reason<textarea name="reason" required maxLength={2000} />
                </label>
                <button className="primary">
                  {modal === "reject"
                    ? "Request changes"
                    : "Withdraw this approval"}
                </button>
              </form>
            )
            : (
              <>
                <input
                  autoFocus
                  aria-label="Search commands"
                  placeholder="Find an action…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="command-list">
                  {[
                    ...stageNames.map((label, i) => ({
                      label,
                      disabled: !canVisit(i),
                      run: () => go(i),
                    })),
                    {
                      label: "Creative brief",
                      run: () => {
                        if (root) b.select(root.id);
                        setPage("project");
                      },
                    },
                    { label: "Project assets", run: () => setPage("assets") },
                    { label: "Settings", run: () => setModal("settings") },
                    {
                      label: "Export project",
                      run: () => void exportProject(),
                    },
                    {
                      label: "New project window",
                      run: () => void action("studioNewWindow"),
                    },
                    {
                      label: "Help",
                      run: () => setModal("help"),
                    },
                    {
                      label: "Focus canvas",
                      run: () => {
                        setPage("project");
                        setRail(true);
                        setInspector(true);
                        setMobile(false);
                        setDrawer(false);
                      },
                    },
                  ].filter((item) =>
                    item.label.toLowerCase().includes(query.toLowerCase())
                  ).map((item) => (
                    <button
                      key={item.label}
                      className="command-row"
                      disabled={"disabled" in item && item.disabled}
                      onClick={() => {
                        setModal("");
                        item.run();
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="shortcut-note">
                  ⌘ / Ctrl K: commands · 1–4: stages · [: workflow rail · ]:
                  inspector
                </p>
              </>
            )}
        </Modal>
      )}
      {zoom && (
        <Modal title={titles[stage]} onClose={() => setZoom(undefined)}>
          <img
            className="zoom-image"
            src={zoom}
            alt="Enlarged project artwork"
          />
        </Modal>
      )}
    </div>
  );
}
