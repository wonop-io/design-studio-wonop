# Design Studio interface

The native shell converts the approved Relay prototype at `e3dbd97d94` into
production-owned React components. It composes Design Bench's canonical artifact,
input recovery, agent session, approval, and template owners through relative
build imports. No PoC or browser persistence is used at runtime.

- `Studio.tsx`: one project window, four stages, native panels and commands.
- `StudioPanels.tsx`: native agents, revision details, activity, assets and preferences.
- `stages.ts`: the four visible stage names and artifact mapping.
- `Comparison.tsx`: source/render split, keyboard/pointer selection and one handoff.
- `comparisonPixels.ts`: promoted aligned width-coordinate crop/difference algorithm.
- `capture.ts`: exact fresh HTML rendering and isolated actual DOM capture.
- `studioApi.ts`: typed native metadata and acknowledged draft persistence.
- `studio.css`: approved system-token shell, both themes and responsive drawers.

`../vendor` copies the existing Design Bench compiler/capture assets. The shared
lockfile pins the same React, Lucide, TypeScript, and esbuild versions. Build via
the package Bazel target, never through an untracked npm build path.

## Browser fixture

`../checks/fixture.html` is an explicit simulated native transport. Production
`index.html` never loads it. Its controls use the real isolated HTML capture,
image staging adapter, keyboard selection, and comparison implementation.
Use CUA against the served fixture for theme/responsive screenshots and
interaction verification. Native storage, provider accounting and agent dispatch
need separate host verification.

For approved-art shell comparison, extract the pinned source test image:
`mkdir -p ui/checks/evidence && git show e3dbd97d94:poc/relay-brand/03-components/components.png > ui/checks/evidence/approved-components.png`
from the package directory, then open `checks/fixture.html?approved`. This is
local verification data only, excluded from the shipped package source.
