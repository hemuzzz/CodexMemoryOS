#!/bin/sh
set -eu
integration_dir=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
project_root=$(CDPATH= cd "$integration_dir/../.." && pwd -P)
knowledge_base="$project_root/knowledge-base"
export CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH="$knowledge_base/repository"
export CODEX_MEMORY_OS_DATABASE_PATH="$knowledge_base/runtime/codex-memory.sqlite"
export CODEX_MEMORY_OS_WORKSPACES_PATH="$knowledge_base/config/workspaces.json"
export CODEX_MEMORY_OS_LOG_PATH="$knowledge_base/logs/hook.log"
export CODEX_MEMORY_OS_CAPTURE_COMMAND="/bin/sh '$integration_dir/capture-hook.sh' --record"
exec '/Users/hemu/.npm/_npx/78120b5db7e8f750/node_modules/node/bin/node' "$project_root/apps/server/dist/hook/user-prompt-submit.js"
