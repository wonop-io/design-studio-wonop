# Design Studio

A native Wonop package for developing and reviewing a visual identity with agents.
Each window represents one project. Approve directions, the concept artboard,
the component board, then the working component library. Revisions preserve
source hashes, earlier outputs, comments and human review decisions.

The shell follows Wonop’s runtime light/dark tokens. Artwork retains its own
palette. Comparison, selection, capture and feedback are native app tools around
the artwork. Send a selected original/rendered/difference triplet and an optional
comment to an existing Codex or Claude session with **Send to agent**.

Build with `just design-studio-build` (regenerates both shared workflow entries); verify with `just design-studio-check`.
Link/open the package through Wonop’s existing developer tools, as described in
[usage](docs/usage.md). A plain browser has no native agent or checkpoint bridge;
it reports that limitation. Explicit test fixtures are isolated from the app entry.

The package composes the existing Design Bench checkpoint, annotation, image,
draft recovery, agent session and validated publication owners. It adds a
four-stage profile, project/window policy and comparison evidence metadata.
It never holds provider credentials or implements another agent runtime.

## Install it in Wonop

Design Studio is a package for [Wonop](https://wonop.com), the macOS app that runs your AI
agents side by side in one workbench. Get Wonop at [wonop.com](https://wonop.com),
then install Design Studio from the Store, or from this repository:

    await wm.app.installFromGit("https://github.com/wonop-io/design-studio-wonop.git")

## Where it is developed

This repository is a mirror. Design Studio is built and tested in the Wonop
repository and published here with every release, so pull requests and issues
opened here are not watched. Send questions and bug reports through
[wonop.com](https://wonop.com).

## License

MIT. See [LICENSE](LICENSE).
