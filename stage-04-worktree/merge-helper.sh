#!/usr/bin/env bash
# merge-helper.sh - 辅助合并 worker 分支到 main
# 提供 diff 预览、冲突检测和交互式合并
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/platform_detect.sh"

# ── 配置 ──────────────────────────────────────────────────────────
MAIN_BRANCH="main"

# ── 辅助函数 ──────────────────────────────────────────────────────
_git_root() {
    git rev-parse --show-toplevel 2>/dev/null || {
        echo "[merge-helper] ERROR: 不在 git 仓库中" >&2
        exit 1
    }
}

_log() {
    echo "[merge-helper] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

_err() {
    echo "[merge-helper] ERROR: $*" >&2
}

_current_branch() {
    git rev-parse --abbrev-ref HEAD 2>/dev/null
}

_ensure_on_main() {
    local current
    current="$(_current_branch)"
    if [ "$current" != "$MAIN_BRANCH" ]; then
        _err "当前不在 $MAIN_BRANCH 分支上 (当前: $current)"
        _err "请先切换: git checkout $MAIN_BRANCH"
        exit 1
    fi
}

_ensure_clean_working_tree() {
    local changes
    changes="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    if [ "$changes" -gt 0 ]; then
        _err "工作区有未提交的更改，请先提交或 stash"
        git status --short
        exit 1
    fi
}

# 获取所有 worker-* 分支
_get_worker_branches() {
    git branch --list 'worker-*' --format='%(refname:short)' 2>/dev/null | sort
}

# 从分支名提取 worker 名称
_branch_to_name() {
    echo "$1" | sed 's/^worker-//'
}

# 检查分支是否存在
_branch_exists() {
    git show-ref --verify --quiet "refs/heads/$1" 2>/dev/null
}

# 检查合并是否会有冲突
_check_conflicts() {
    local branch="$1"

    # 使用 merge-tree 进行冲突检测（不修改工作区）
    # 如果 git 版本支持 merge-tree --write-tree (2.38+)
    if git merge-tree --write-tree "$MAIN_BRANCH" "$branch" >/dev/null 2>&1; then
        return 0  # 无冲突
    fi

    # 回退方法: 尝试 merge --no-commit 然后 abort
    local result=0
    git merge --no-commit --no-ff "$branch" >/dev/null 2>&1 || result=$?
    git merge --abort 2>/dev/null || true

    return $result
}

# ── 子命令: status ────────────────────────────────────────────────
cmd_status() {
    echo "========================================"
    echo "  Worker 分支状态"
    echo "========================================"
    echo "  基准分支: $MAIN_BRANCH"
    echo ""

    local branches
    branches="$(_get_worker_branches)"

    if [ -z "$branches" ]; then
        echo "(没有 worker-* 分支)"
        return
    fi

    printf "  %-25s %-10s %-10s %-15s %s\n" "分支" "领先" "落后" "状态" "最后提交"
    printf "  %-25s %-10s %-10s %-15s %s\n" "────" "────" "────" "─────" "────────"

    while IFS= read -r branch; do
        [ -z "$branch" ] && continue

        local name
        name="$(_branch_to_name "$branch")"

        # 计算领先/落后 main 的提交数
        local ahead behind
        ahead="$(git rev-list --count "$MAIN_BRANCH".."$branch" 2>/dev/null || echo "?")"
        behind="$(git rev-list --count "$branch".."$MAIN_BRANCH" 2>/dev/null || echo "?")"

        # 检查是否已合并
        local status="pending"
        if git merge-base --is-ancestor "$branch" "$MAIN_BRANCH" 2>/dev/null; then
            status="已合并"
        elif [ "$ahead" = "0" ]; then
            status="无变更"
        else
            # 简单冲突检测 (v2 fix)
            local conflict_result=0
            local merge_base=""
            merge_base="$(git merge-base "$MAIN_BRANCH" "$branch" 2>/dev/null)" || merge_base="$MAIN_BRANCH"
            conflict_result="$(git merge-tree "$merge_base" "$MAIN_BRANCH" "$branch" 2>/dev/null | grep -c '<<<<<<<')" || conflict_result=0
            if [ "$conflict_result" -gt 0 ]; then
                status="有冲突"
            else
                status="可合并"
            fi
        fi

        # 最后提交时间
        local last_commit
        last_commit="$(git log -1 --format='%cr' "$branch" 2>/dev/null || echo "N/A")"

        printf "  %-25s %-10s %-10s %-15s %s\n" "$branch" "+$ahead" "-$behind" "$status" "$last_commit"
    done <<< "$branches"

    echo ""
    echo "----------------------------------------"
    local total
    total="$(echo "$branches" | wc -l | tr -d ' ')"
    echo "共 $total 个 worker 分支"
}

# ── 子命令: preview ───────────────────────────────────────────────
cmd_preview() {
    local name="${1:-}"
    if [ -z "$name" ]; then
        _err "用法: $0 preview <name>"
        exit 1
    fi

    local branch="worker-$name"

    if ! _branch_exists "$branch"; then
        _err "分支 '$branch' 不存在"
        exit 1
    fi

    echo "========================================"
    echo "  预览: $branch vs $MAIN_BRANCH"
    echo "========================================"
    echo ""

    # diff 统计
    echo "── 变更统计 ──"
    git diff --stat "$MAIN_BRANCH"..."$branch" 2>/dev/null || {
        _err "无法获取 diff"
        exit 1
    }

    echo ""
    echo "── 提交历史 ──"
    git log --oneline "$MAIN_BRANCH".."$branch" 2>/dev/null

    echo ""
    echo "── 详细 diff ──"
    git diff "$MAIN_BRANCH"..."$branch" 2>/dev/null
}

# ── 子命令: merge ─────────────────────────────────────────────────
cmd_merge() {
    local name="${1:-}"
    if [ -z "$name" ]; then
        _err "用法: $0 merge <name>"
        exit 1
    fi

    local branch="worker-$name"

    if ! _branch_exists "$branch"; then
        _err "分支 '$branch' 不存在"
        exit 1
    fi

    _ensure_on_main
    _ensure_clean_working_tree

    # 显示变更信息
    echo "========================================"
    echo "  合并: $branch -> $MAIN_BRANCH"
    echo "========================================"
    echo ""

    # diff 统计
    local ahead
    ahead="$(git rev-list --count "$MAIN_BRANCH".."$branch" 2>/dev/null)"
    echo "提交数: $ahead"
    echo ""
    echo "变更统计:"
    git diff --stat "$MAIN_BRANCH"..."$branch" 2>/dev/null
    echo ""

    # 检查是否已合并
    if git merge-base --is-ancestor "$branch" "$MAIN_BRANCH" 2>/dev/null; then
        _log "分支 '$branch' 已经合并到 $MAIN_BRANCH"
        return 0
    fi

    # 冲突检测
    _log "检查合并冲突..."
    local merge_test_result=0
    # 使用临时合并测试冲突
    git merge --no-commit --no-ff "$branch" >/dev/null 2>&1 || merge_test_result=$?
    local has_conflicts=false
    if [ "$merge_test_result" -ne 0 ]; then
        has_conflicts=true
        echo ""
        _log "WARNING: 检测到合并冲突!"
        echo "冲突文件:"
        git diff --name-only --diff-filter=U 2>/dev/null || true
    else
        _log "无冲突"
    fi
    # 取消测试合并
    git merge --abort 2>/dev/null || git reset --merge 2>/dev/null || true

    if [ "$has_conflicts" = true ]; then
        echo ""
        _err "存在冲突，无法自动合并"
        _log "建议手动合并: git merge $branch"
        return 1
    fi

    # 用户确认
    echo ""
    read -rp "确认合并 $branch 到 $MAIN_BRANCH? (y/N): " confirm
    if [[ "$confirm" != [yY] ]]; then
        _log "已取消"
        return 0
    fi

    # 执行合并
    _log "执行合并..."
    if git merge "$branch" --no-ff -m "Merge $branch into $MAIN_BRANCH"; then
        _log "合并成功!"

        # 询问是否删除分支
        read -rp "删除已合并的分支 $branch? (y/N): " del_confirm
        if [[ "$del_confirm" == [yY] ]]; then
            git branch -d "$branch" 2>/dev/null && _log "分支 $branch 已删除" || _err "无法删除分支 $branch"
        fi
    else
        _err "合并失败!"
        _log "请手动解决冲突后提交"
        return 1
    fi
}

# ── 子命令: merge-all ─────────────────────────────────────────────
cmd_merge_all() {
    _ensure_on_main
    _ensure_clean_working_tree

    local branches
    branches="$(_get_worker_branches)"

    if [ -z "$branches" ]; then
        _log "没有 worker-* 分支需要合并"
        return
    fi

    echo "========================================"
    echo "  批量合并所有 Worker 分支"
    echo "========================================"
    echo ""

    # 先显示状态总览
    local merge_candidates=()
    local already_merged=()
    local has_conflicts=()

    while IFS= read -r branch; do
        [ -z "$branch" ] && continue
        local name
        name="$(_branch_to_name "$branch")"

        if git merge-base --is-ancestor "$branch" "$MAIN_BRANCH" 2>/dev/null; then
            already_merged+=("$branch")
            continue
        fi

        local ahead
        ahead="$(git rev-list --count "$MAIN_BRANCH".."$branch" 2>/dev/null)"
        if [ "$ahead" = "0" ]; then
            already_merged+=("$branch")
            continue
        fi

        # 冲突测试: 尝试合并，检查是否有真正的冲突文件 (unmerged entries)
        git merge --no-commit --no-ff "$branch" >/dev/null 2>&1 || true
        local unmerged
        unmerged="$(git diff --name-only --diff-filter=U 2>/dev/null | wc -l | tr -d ' ')"
        git merge --abort 2>/dev/null || git reset --merge 2>/dev/null || true

        if [ "$unmerged" -gt 0 ]; then
            has_conflicts+=("$branch")
        else
            merge_candidates+=("$branch")
        fi
    done <<< "$branches"

    # 显示摘要
    if [ ${#already_merged[@]} -gt 0 ]; then
        echo "已合并 (跳过):"
        for b in "${already_merged[@]}"; do
            echo "  - $b"
        done
        echo ""
    fi

    if [ ${#has_conflicts[@]} -gt 0 ]; then
        echo "有冲突 (需手动处理):"
        for b in "${has_conflicts[@]}"; do
            echo "  - $b"
        done
        echo ""
    fi

    if [ ${#merge_candidates[@]} -eq 0 ]; then
        _log "没有可自动合并的分支"
        return
    fi

    echo "可合并:"
    for b in "${merge_candidates[@]}"; do
        local ahead
        ahead="$(git rev-list --count "$MAIN_BRANCH".."$b" 2>/dev/null)"
        echo "  - $b (+$ahead commits)"
    done
    echo ""

    # 逐个合并
    local merged=0
    local failed=0

    for branch in "${merge_candidates[@]}"; do
        local name
        name="$(_branch_to_name "$branch")"

        echo "----------------------------------------"
        echo "合并 $branch (+$(git rev-list --count "$MAIN_BRANCH".."$branch") commits)"
        git diff --stat "$MAIN_BRANCH"..."$branch" 2>/dev/null
        echo ""

        read -rp "合并 $branch? (y/N/q=退出): " confirm
        case "$confirm" in
            [yY])
                if git merge "$branch" --no-ff -m "Merge $branch into $MAIN_BRANCH"; then
                    _log "$branch 合并成功"
                    merged=$((merged + 1))
                else
                    _err "$branch 合并失败"
                    git merge --abort 2>/dev/null || git reset --merge 2>/dev/null || true
                    failed=$((failed + 1))
                fi
                ;;
            [qQ])
                _log "用户中止批量合并"
                break
                ;;
            *)
                _log "跳过 $branch"
                ;;
        esac
        echo ""
    done

    echo "========================================"
    echo "  合并完成"
    echo "  成功: $merged"
    echo "  失败: $failed"
    echo "  冲突: ${#has_conflicts[@]} (需手动处理)"
    echo "========================================"
}

# ── 用法 ──────────────────────────────────────────────────────────
usage() {
    cat <<EOF
Worker 分支合并辅助工具

用法: $(basename "$0") <command> [args]

命令:
  status          显示所有 worker 分支相对于 $MAIN_BRANCH 的 diff 统计
  preview <name>  显示 worker-<name> 相对于 $MAIN_BRANCH 的完整 diff
  merge <name>    将 worker-<name> 合并到 $MAIN_BRANCH (需确认)
  merge-all       依次合并所有 worker 分支 (逐个确认)

注意:
  - merge 和 merge-all 命令需要在 $MAIN_BRANCH 分支上执行
  - 合并前会自动检查冲突
  - 有冲突的分支不会自动合并

示例:
  $(basename "$0") status
  $(basename "$0") preview feature-auth
  $(basename "$0") merge feature-auth
  $(basename "$0") merge-all
EOF
}

# ── 主入口 ────────────────────────────────────────────────────────
main() {
    local cmd="${1:-}"
    shift || true

    case "$cmd" in
        status)     cmd_status "$@" ;;
        preview)    cmd_preview "$@" ;;
        merge)      cmd_merge "$@" ;;
        merge-all)  cmd_merge_all "$@" ;;
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
