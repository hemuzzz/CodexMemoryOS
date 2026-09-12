#!/bin/sh
set -eu
project_root=$(CDPATH= cd "$(dirname "$0")/.." && pwd -P)
cd "$project_root"
config_path=${1:-"$project_root/.desktop-local.json"}
if [ ! -f "$config_path" ]; then
  echo "缺少本机配置：$config_path；请先按 README 创建配置。" >&2
  exit 1
fi
echo "开始本地更新。请确保同库工程交付、Hook/CLI 已结束，更新期间不要重新打开旧 App。"
lock_path=/Applications/.CodexMemoryOS.update.lock
if ! mkdir "$lock_path"; then
  echo "无法取得更新锁：已有更新正在运行、残留锁或安装目录不可写。" >&2
  exit 1
fi
trap 'rm -f "$lock_path/shell-owner"; rmdir "$lock_path"' EXIT
CODEX_MEMORY_OS_UPDATE_LOCK_TOKEN=$(/usr/bin/uuidgen)
export CODEX_MEMORY_OS_UPDATE_LOCK_TOKEN
printf '%s\n' "$CODEX_MEMORY_OS_UPDATE_LOCK_TOKEN" > "$lock_path/shell-owner"
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm install --frozen-lockfile
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm build
npx -y -p node@22.16.0 -p pnpm@11.1.3 pnpm --filter @codex-memory-os/desktop update:mac "$config_path"
