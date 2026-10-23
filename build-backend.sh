#!/usr/bin/env bash
set -euo pipefail
exec bash "${BUILD_WORKSPACE_DIRECTORY:?Run with bazel run}/wonop-packages/examples/design-bench/build-backend.sh" "${1:---write}" both
