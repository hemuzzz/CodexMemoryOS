#!/bin/sh
set -eu
integration_dir=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
project_root=$(CDPATH= cd "$integration_dir/../.." && pwd -P)
export CODEX_MEMORY_OS_CAPTURE_CACHE_PATH="$project_root/knowledge-base/runtime/capture"
exec '/Users/hemu/.npm/_npx/78120b5db7e8f750/node_modules/node/bin/node' "$project_root/apps/server/dist/hook/capture-cli.js" "$@"
