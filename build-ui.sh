#!/usr/bin/env bash
set -euo pipefail
cd "${BUILD_WORKSPACE_DIRECTORY:?Run with bazel run}/wonop-packages/examples/design-studio/ui"
# Reuse the compiler/dependency versions pinned by Design Bench. Dependencies
# are build inputs only; the resulting package is self-contained.
trap 'if [ -d node_modules ]; then rm -r node_modules; fi' EXIT
npm ci --prefer-offline --ignore-scripts --no-audit --no-fund
./node_modules/.bin/tsc --noEmit
NODE_PATH="$PWD/node_modules" ./node_modules/.bin/esbuild src/main.tsx --bundle --minify --platform=browser --loader:.ttf=dataurl --loader:.woff2=dataurl --outfile=app.js
