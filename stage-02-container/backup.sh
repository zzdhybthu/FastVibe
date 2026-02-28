#!/usr/bin/env bash
set -euo pipefail

# backup.sh - Git WIP 快照保护
# 将未提交的修改保存为 git stash，防止 CC 崩溃丢失工作进度
# 如果没有未提交修改则跳过，不产生垃圾
#
# Usage: backup.sh [/path/to/project]
# Cron example: */15 * * * * /path/to/backup.sh /path/to/project

PROJECT_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"

# Validate
if [[ ! -d "$PROJECT_DIR/.git" ]]; then
    echo "Error: '$PROJECT_DIR' is not a git repository."
    exit 1
fi

cd "$PROJECT_DIR"

# 检查是否有未提交的修改 (tracked + untracked)
if git diff --quiet HEAD 2>/dev/null && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
    # 工作区干净，无需快照
    exit 0
fi

TIMESTAMP="$(date +%Y-%m-%d_%H:%M:%S)"

# 保存 WIP 快照 (包含 untracked 文件)
git stash push --include-untracked -m "WIP auto-snapshot $TIMESTAMP" >/dev/null 2>&1

# 立刻恢复工作区 (stash 留存为安全网)
git stash apply --index >/dev/null 2>&1 || git stash apply >/dev/null 2>&1

echo "WIP snapshot saved: $TIMESTAMP"

# 清理旧 stash: 只保留最近 24 个 auto-snapshot
MAX_STASH=24
STASH_LIST=$(git stash list --grep="WIP auto-snapshot" 2>/dev/null || true)
STASH_COUNT=$(echo "$STASH_LIST" | grep -c "WIP auto-snapshot" 2>/dev/null || true)

if [[ "$STASH_COUNT" -gt "$MAX_STASH" ]]; then
    # 从最旧的开始删 (stash 是栈结构，最旧的 index 最大)
    echo "$STASH_LIST" | tail -n +"$((MAX_STASH + 1))" | while IFS= read -r line; do
        STASH_REF=$(echo "$line" | cut -d: -f1)
        git stash drop "$STASH_REF" >/dev/null 2>&1 || true
    done
    echo "Rotated: kept $MAX_STASH snapshots"
fi
