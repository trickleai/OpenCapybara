#!/bin/bash
ROOT="$(dirname "$0")"

# Change to project root directory (same as scripts/code.sh)
cd "$ROOT"

NAME="Capybara"
CODE="./.build/electron/$NAME.app/Contents/MacOS/Electron"

# Clear environment variables that affect Electron
unset ELECTRON_RUN_AS_NODE
unset VSCODE_ESM_ENTRYPOINT

export NODE_ENV=development
export VSCODE_DEV=1
export VSCODE_CLI=1

# Pass . as working directory (same as scripts/code.sh)
exec "$CODE" . "$@"
