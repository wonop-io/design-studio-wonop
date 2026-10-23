# Build and use Design Studio

From the repository root:

```sh
just design-studio-build
just design-studio-check
```

These recipes run Bazel-owned compiler/API/test entrypoints. The backend recipe
regenerates both native consumers of the shared workflow; the check also runs
the existing Design Bench contracts. Commit generated
`main.js`, `ui/app.js` and `ui/app.css` with their sources. The backend bundle
contains the shared workflow modules; running Studio does not require a second
installed package. The compiler reuses Design Bench’s existing pinned lockfile.

For development, use Wonop’s existing `wm.dev.link(ABSOLUTE_PACKAGE_DIRECTORY)`
and `wm.app.open("design-studio")`. Native QA uses `just wonop-isolated` with a
scratch profile; never install over or restart someone’s running Wonop. Freeze
linked files during each native verification run because the package watcher
reloads on source/test/document changes too.

Agent Store installation uses the listed version in the wonop.com registry.
Design Studio's release entry is in `wonop-packages/github-mirrors.json`;
the stable Wonop release job publishes its standalone GitHub snapshot and
submits the pinned version to the registry. Staff then review and list that
version before it appears in the Store. A local developer link is available
while those release gates are pending. See
`apps/desktop/wonop/docs/standalone-packages.md`, “Publishing the mirrors”, for
the existing publisher, credentials and review process.

Save the project brief and optional images/links. Generate four directions,
review the actual output, approve that revision, select one direction, and
continue. The next approved outputs are an artboard and a component board.
Choose a ready Codex or Claude session to convert the approved component board
into an interactive HTML component library. This final stage ends at component
review. **New project window** starts a distinct project; no project picker is
needed inside a window.

Image generation and source-linked edits use Wonop’s configured image tier and
ordered original references. Settings and permission errors remain visible.
Changing a stage produces a draft revision, never an implicit approval. Imports
use the same source/review gates: four images for directions, one for an
artboard/component board, or an HTML library from an approved component board.

Use **Compare** to reveal the actual rendered components against the approved
component board. **Select area** captures both crops and their pixel difference
on one width-coordinate grid, including height mismatches. Add a comment if
needed and **Send to agent**. Evidence is bound to the raw HTML hash, exact board
hash, render dimensions and theme. Recapture after changed output. Source
artwork keeps its original colors in either shell theme.

A queued run or a coding delivery receipt is not a completed revision. A coding
agent must publish its HTML through the exact run/source fence below. Native
validation and read-back must succeed before a draft appears. Stop requests
suppress late publication; an interrupt acknowledgement does not prove remote
work ended. Recovery reports uncertainty and preserves drafts and attempted
sends rather than silently creating another dispatch.

## Agent recipe

Start by reading `wm.call("app.help",{appId:"design-studio"})` to discover the installed
strict command shapes. Native calls may be window-bound by Wonop; a direct
agent read identifies the project explicitly:

```ts
const studio = wm.apps["design-studio"];
const window = await studio.studioNewWindow({});
const tabId = window.windowId; // Native content identity, not an artwork ID.
const state = await studio.benchState({tabId});
// If projectId is null, wait for native opening and retry this exact tab.
// The person may also save/edit the fresh brief in the window.
const input = state.workspace.nodes.find(n => n.id === state.workspace.selected);
const saved = await studio.benchSaveInputs({
  tabId, name: "Relay", brief: "Turn YouTube live streams into editable shorts",
  references: [], revises: input.id, operationId: "brief-save-0001"
});
await studio.benchOpen({tabId, artifactId: saved.artifact.id});
const exploration = await studio.benchGenerate({tabId, artifactId: saved.artifact.id});
```

A new-window receipt contains native window identity, not a project graph. Pass its exact `tabId` to native package calls; do not rely on whichever
project window was focused last. `projectId` is optional for an explicit project
read, but cannot redirect a command from another bound window. Human review happens in the app.
There is deliberately no agent approval command. After actual approval, select
an available direction with `benchChooseDirection({artifactId,variant})` (0–3)
and generate from that exact artifact. Artboard → components is direct here.

Saving creates an immutable revision and leaves the current selection unchanged.
Open the returned artifact with `benchOpen({tabId, artifactId: saved.artifact.id})`
before generating from it. Read input brief, revision, lineage and hashes from
`benchState({tabId}).workspace.nodes`; `benchContent` returns asset/HTML content,
not input metadata.

For original images, `benchContent({artifactId})` returns `imageIds` and the first
image. Read the rest individually with `benchContent({artifactId,imageId})` and
consume each response before reading another. No composite sheet substitutes for
original image references. `benchTargets({})` lists native session readiness;
`benchOpenCoder({builder:"codex"})` requests the existing separately approved
companion opening path, then refresh targets before using its window ID.

To create working components:

```ts
const {run} = await studio.benchGenerate({
  tabId, artifactId: APPROVED_COMPONENT_BOARD_ID, format: "html",
  builder: "codex", builderWindowId: READY_CODING_WINDOW_ID
});
```

The coding session receives owned source/evidence file paths and the captured
hashes. Produce one complete HTML document, then publish exactly:

```ts
await studio.publishBuild({
  tabId, runId: RUN_ID, screen: "bench-build", version: RUN_ID,
  html: COMPLETE_HTML_DOCUMENT, sourceHashes: CAPTURED_RUN_SOURCES
});
```

Do not alter the captured hashes, publish a canceled/stale run, or approve on the
person’s behalf. A freeform `benchGenerate({artifactId:WORKING_HTML_ID,note,...})`
revises the HTML library rather than generating an image. The new revision must
be reviewed separately.

## Capture, feedback and recovery contracts

[interface-contract.md](interface-contract.md) specifies `studioCapture`,
`studioEvidence`, `studioFeedback`, acknowledged drafts and preferences. Stage
each PNG through `benchStageInput`, then retain the returned owned asset ID.
Persist an attempted feedback payload with `studioDraft` before sending; reuse
its exact operation ID, image IDs, session identity and payload on an uncertain
reply. Identical retries return the existing run; changed payload conflicts.
Use `benchRetry` for an explicit new attempt after a failed/interrupted run.
A closed project can be reopened in a new native window through the existing
host API: `wm.tabs.open({appId:"design-studio",params:{artifactId:ARTIFACT_ID}})`.
That host API returns `tabId`; use it on subsequent package commands. Reopening
preserves the artifact family instead of creating another project. Background
publication remains authorized by its exact run and hashes, independent of
which project later gained focus.

`workspace.studio.feedback` indexes immutable feedback snapshots from native
runs. Read one image through `studioEvidence` at a time; omitting `imageId`
returns the capture PNG. For capture metadata without image bytes, read
`benchState({tabId}).workspace.studio.captures[artifactId]`. The shared annotation
store preserves comparison comments; resolving/reopening/replying uses the
existing `bench*` annotation commands. Project export saves a JSON graph and
provenance manifest with asset references; it does not claim to embed original
asset bytes. Canceled export is reported as canceled.
