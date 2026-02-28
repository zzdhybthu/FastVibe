#!/usr/bin/env bash
# worktree-manager.sh - Git worktree 管理器
# 用于创建、列出、删除 Claude Code 并行工作的 worktree
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/platform_detect.sh"

# ── 配置 ──────────────────────────────────────────────────────────
WORKTREE_BASE=".claude-worktrees"

# ── 辅助函数 ──────────────────────────────────────────────────────
_git_root() {
    git rev-parse --show-toplevel 2>/dev/null || {
        echo "[worktree-manager] ERROR: 不在 git 仓库中" >&2
        exit 1
    }
}

_worktree_dir() {
    local root
    root="$(_git_root)"
    echo "$root/$WORKTREE_BASE"
}

_log() {
    echo "[worktree-manager] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

_err() {
    echo "[worktree-manager] ERROR: $*" >&2
}

_ensure_gitignore() {
    local root
    root="$(_git_root)"
    local gitignore="$root/.gitignore"

    if [ ! -f "$gitignore" ]; then
        echo "$WORKTREE_BASE/" > "$gitignore"
        _log "创建 .gitignore 并添加 $WORKTREE_BASE/"
        return
    fi

    if ! grep -qxF "$WORKTREE_BASE/" "$gitignore" && \
       ! grep -qxF "$WORKTREE_BASE" "$gitignore" && \
       ! grep -qxF "/$WORKTREE_BASE/" "$gitignore" && \
       ! grep -qxF "/$WORKTREE_BASE" "$gitignore"; then
        echo "$WORKTREE_BASE/" >> "$gitignore"
        _log "已将 $WORKTREE_BASE/ 添加到 .gitignore"
    fi
}

# ── 子命令: create ────────────────────────────────────────────────
cmd_create() {
    local name="${1:-}"
    if [ -z "$name" ]; then
        _err "用法: $0 create <name>"
        exit 1
    fi

    local root
    root="$(_git_root)"
    local wt_dir
    wt_dir="$(_worktree_dir)/$name"
    local branch="worker-$name"

    # 检查 worktree 是否已存在
    if [ -d "$wt_dir" ]; then
        _err "Worktree '$name' 已存在于: $wt_dir"
        exit 1
    fi

    # 检查分支是否已存在
    if git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
        _err "分支 '$branch' 已存在。请先删除或使用其他名称。"
        exit 1
    fi

    # 确保 .gitignore 包含 worktree 目录
    _ensure_gitignore

    # 创建 worktree 基础目录
    mkdir -p "$(_worktree_dir)"

    # 从当前 HEAD 创建 worktree + 新分支
    _log "创建 worktree: $name (分支: $branch)"
    git worktree add -b "$branch" "$wt_dir" HEAD

    # 复制 CLAUDE.md 和 PROGRESS.md 到 worktree（如果存在）
    local copied_files=()
    if [ -f "$root/CLAUDE.md" ]; then
        cp "$root/CLAUDE.md" "$wt_dir/CLAUDE.md"
        copied_files+=("CLAUDE.md")
    fi
    if [ -f "$root/PROGRESS.md" ]; then
        cp "$root/PROGRESS.md" "$wt_dir/PROGRESS.md"
        copied_files+=("PROGRESS.md")
    fi

    if [ ${#copied_files[@]} -gt 0 ]; then
        _log "已复制文件到 worktree: ${copied_files[*]}"
    fi

    _log "Worktree 创建成功!"
    _log "  路径: $wt_dir"
    _log "  分支: $branch"
    echo "$wt_dir"
}

# ── 子命令: list ──────────────────────────────────────────────────
cmd_list() {
    local root
    root="$(_git_root)"
    local wt_base
    wt_base="$(_worktree_dir)"

    echo "========================================"
    echo "  Git Worktree 列表"
    echo "========================================"

    if [ ! -d "$wt_base" ]; then
        echo "(无活跃的 worktree)"
        return
    fi

    local count=0
    # 使用 git worktree list 获取所有 worktree 信息
    while IFS= read -r line; do
        local wt_path branch_info commit_info
        wt_path="$(echo "$line" | awk '{print $1}')"
        commit_info="$(echo "$line" | awk '{print $2}')"
        branch_info="$(echo "$line" | sed 's/.*\[\(.*\)\].*/\1/' 2>/dev/null || echo "N/A")"

        # 只显示属于 .claude-worktrees 的
        if [[ "$wt_path" == *"$WORKTREE_BASE"* ]]; then
            local name
            name="$(basename "$wt_path")"
            local status="active"

            # 检查目录是否存在
            if [ ! -d "$wt_path" ]; then
                status="missing"
            fi

            # 检查是否有未提交的更改
            if [ -d "$wt_path" ]; then
                local changes
                changes="$(git -C "$wt_path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
                if [ "$changes" -gt 0 ]; then
                    status="active (${changes} 个未提交更改)"
                fi
            fi

            printf "  %-20s %-25s %-15s %s\n" "$name" "$branch_info" "$commit_info" "$status"
            count=$((count + 1))
        fi
    done < <(git worktree list)

    if [ "$count" -eq 0 ]; then
        echo "(无活跃的 worktree)"
    else
        echo "----------------------------------------"
        echo "共 $count 个 worktree"
    fi
}

# ── 子命令: remove ────────────────────────────────────────────────
cmd_remove() {
    local name="${1:-}"
    if [ -z "$name" ]; then
        _err "用法: $0 remove <name>"
        exit 1
    fi

    local wt_dir
    wt_dir="$(_worktree_dir)/$name"
    local branch="worker-$name"

    if [ ! -d "$wt_dir" ]; then
        _err "Worktree '$name' 不存在: $wt_dir"
        # 尝试强制清理
        _log "尝试清理可能残留的 worktree 引用..."
        git worktree prune 2>/dev/null || true
        # 也尝试删除分支
        if git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
            _log "删除残留分支: $branch"
            git branch -D "$branch" 2>/dev/null || true
        fi
        exit 1
    fi

    # 检查是否有未提交的更改
    local changes
    changes="$(git -C "$wt_dir" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    if [ "$changes" -gt 0 ]; then
        _log "WARNING: worktree '$name' 有 $changes 个未提交的更改"
        read -rp "确定要删除吗? (y/N): " confirm
        if [[ "$confirm" != [yY] ]]; then
            _log "已取消"
            return
        fi
    fi

    _log "删除 worktree: $name"

    # 移除 worktree
    git worktree remove "$wt_dir" --force 2>/dev/null || {
        _log "git worktree remove 失败，尝试手动清理..."
        rm -rf "$wt_dir"
        git worktree prune
    }

    # 删除分支
    if git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
        _log "删除分支: $branch"
        git branch -D "$branch" 2>/dev/null || {
            _err "无法删除分支 $branch (可能有未合并的提交)"
            _log "使用 'git branch -D $branch' 强制删除"
        }
    fi

    _log "Worktree '$name' 已删除"
}

# ── 子命令: clean ─────────────────────────────────────────────────
cmd_clean() {
    local wt_base
    wt_base="$(_worktree_dir)"

    if [ ! -d "$wt_base" ]; then
        _log "没有 worktree 需要清理"
        return
    fi

    # 收集所有 worktree 名称
    local worktrees=()
    for d in "$wt_base"/*/; do
        [ -d "$d" ] || continue
        worktrees+=("$(basename "$d")")
    done

    if [ ${#worktrees[@]} -eq 0 ]; then
        _log "没有 worktree 需要清理"
        return
    fi

    echo "将删除以下 worktree:"
    for name in "${worktrees[@]}"; do
        echo "  - $name (分支: worker-$name)"
    done

    read -rp "确定要删除所有 worktree 吗? (y/N): " confirm
    if [[ "$confirm" != [yY] ]]; then
        _log "已取消"
        return
    fi

    for name in "${worktrees[@]}"; do
        # 在 clean 流程中跳过单个 remove 的确认提示
        local wt_dir="$wt_base/$name"
        local branch="worker-$name"

        _log "删除 worktree: $name"
        git worktree remove "$wt_dir" --force 2>/dev/null || {
            rm -rf "$wt_dir"
            git worktree prune
        }

        if git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
            git branch -D "$branch" 2>/dev/null || true
        fi
    done

    # 清理基础目录（如果为空）
    rmdir "$wt_base" 2>/dev/null || true

    _log "所有 worktree 已清理完毕"
}

# ── 用法 ──────────────────────────────────────────────────────────
usage() {
    cat <<EOF
Git Worktree 管理器 - 用于 Claude Code 并行化

用法: $(basename "$0") <command> [args]

命令:
  create <name>   从当前 HEAD 创建 worktree + 分支 worker-<name>
  list            列出所有 worktree 及其分支和状态
  remove <name>   删除指定 worktree 和分支
  clean           删除所有 worktree

环境:
  WORKTREE_BASE   worktree 基础目录名 (默认: .claude-worktrees)

示例:
  $(basename "$0") create feature-auth
  $(basename "$0") list
  $(basename "$0") remove feature-auth
  $(basename "$0") clean
EOF
}

# ── 主入口 ────────────────────────────────────────────────────────
main() {
    local cmd="${1:-}"
    shift || true

    case "$cmd" in
        create)  cmd_create "$@" ;;
        list)    cmd_list "$@" ;;
        remove)  cmd_remove "$@" ;;
        clean)   cmd_clean "$@" ;;
        -h|--help|help|"")
            usage
            ;;
        *)
            _err "未知命令: $cmd"
            usage
            exit 1
            ;;
    esac
}

main "$@"
