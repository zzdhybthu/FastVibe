#!/usr/bin/env bash
# parallel-launch.sh - 启动 N 个并行 worker
# 每个 worker 在独立的 git worktree 中运行 ralph-loop
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/platform_detect.sh"

# ── 默认配置 ──────────────────────────────────────────────────────
WORKERS=3
QUEUE_DIR="$SCRIPT_DIR/../stage-03-ralph-loop/task-queue"
DRY_RUN=false
RALPH_LOOP=""  # ralph-loop.sh 路径，自动检测
TMUX_PREFIX="vibe-worker"

# ── 辅助函数 ──────────────────────────────────────────────────────
_log() {
    echo "[parallel-launch] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

_err() {
    echo "[parallel-launch] ERROR: $*" >&2
}

_check_deps() {
    local missing=()

    if ! command -v tmux &>/dev/null; then
        missing+=("tmux")
    fi

    if ! command -v flock &>/dev/null && ! command -v shlock &>/dev/null; then
        # macOS 没有 flock，检查是否有替代
        if is_mac; then
            _log "macOS 检测到: 将使用 mkdir 锁代替 flock"
        else
            missing+=("flock")
        fi
    fi

    if ! command -v git &>/dev/null; then
        missing+=("git")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        _err "缺少依赖: ${missing[*]}"
        _err "请先安装: ${missing[*]}"
        exit 1
    fi
}

_find_ralph_loop() {
    # 在常见位置搜索 ralph-loop.sh
    local search_paths=(
        "$SCRIPT_DIR/../stage-03-ralph-loop/ralph-loop.sh"
        "$SCRIPT_DIR/../ralph-loop.sh"
    )
    for p in "${search_paths[@]}"; do
        if [ -f "$p" ]; then
            RALPH_LOOP="$(cd "$(dirname "$p")" && pwd)/$(basename "$p")"
            return
        fi
    done
    # 如果找不到，使用默认路径（可能需要用户创建）
    RALPH_LOOP="$SCRIPT_DIR/../stage-03-ralph-loop/ralph-loop.sh"
}

_resolve_queue_dir() {
    # 确保 queue_dir 是绝对路径
    if [[ "$QUEUE_DIR" != /* ]]; then
        QUEUE_DIR="$(cd "$SCRIPT_DIR" && cd "$(dirname "$QUEUE_DIR")" && pwd)/$(basename "$QUEUE_DIR")"
    fi
}

# ── 跨平台锁机制 ─────────────────────────────────────────────────
# 使用 mkdir 原子性实现跨平台文件锁
LOCK_DIR=""

_lock_acquire() {
    local lock_name="${1:-parallel-launch}"
    LOCK_DIR="${TMPDIR:-/tmp}/.${lock_name}.lock"

    local retries=0
    local max_retries=30

    while ! mkdir "$LOCK_DIR" 2>/dev/null; do
        retries=$((retries + 1))
        if [ "$retries" -ge "$max_retries" ]; then
            _err "无法获取锁 (超时 ${max_retries}s): $LOCK_DIR"
            return 1
        fi
        sleep 1
    done

    # 记录 PID 方便调试
    echo $$ > "$LOCK_DIR/pid"
    return 0
}

_lock_release() {
    if [ -n "$LOCK_DIR" ] && [ -d "$LOCK_DIR" ]; then
        rm -rf "$LOCK_DIR"
    fi
}

# 确保退出时释放锁
trap '_lock_release' EXIT

# ── 创建 worker 启动脚本 ──────────────────────────────────────────
_create_worker_script() {
    local worker_id="$1"
    local wt_dir="$2"
    local queue_dir="$3"
    local script_path="${TMPDIR:-/tmp}/vibe-worker-${worker_id}-start.sh"

    cat > "$script_path" <<WORKER_SCRIPT
#!/usr/bin/env bash
# Auto-generated worker script for worker-${worker_id}
set -euo pipefail

WORKER_ID="$worker_id"
WORKTREE_DIR="$wt_dir"
QUEUE_DIR="$queue_dir"
LOCK_DIR="\${TMPDIR:-/tmp}/.vibe-task-queue.lock"

cd "\$WORKTREE_DIR"

echo "[worker-\$WORKER_ID] 启动于 \$(date '+%Y-%m-%d %H:%M:%S')"
echo "[worker-\$WORKER_ID] 工作目录: \$WORKTREE_DIR"
echo "[worker-\$WORKER_ID] 任务队列: \$QUEUE_DIR"

# 使用 mkdir 锁来安全地获取任务
acquire_task_lock() {
    local retries=0
    while ! mkdir "\$LOCK_DIR" 2>/dev/null; do
        retries=\$((retries + 1))
        if [ "\$retries" -ge 30 ]; then
            return 1
        fi
        sleep 0.\$(( RANDOM % 5 + 1 ))
    done
    echo \$\$ > "\$LOCK_DIR/pid"
    return 0
}

release_task_lock() {
    rm -rf "\$LOCK_DIR"
}

# 从 pending 队列获取下一个任务（带锁）
get_next_task() {
    local task_file=""

    if ! acquire_task_lock; then
        echo ""
        return
    fi

    # 在锁内安全地获取任务
    for f in "\$QUEUE_DIR/pending"/*.md "\$QUEUE_DIR/pending"/*.txt "\$QUEUE_DIR/pending"/*.task; do
        if [ -f "\$f" ]; then
            task_file="\$f"
            local basename_f
            basename_f="\$(basename "\$f")"
            # 移动到 in-progress
            mkdir -p "\$QUEUE_DIR/in-progress"
            mv "\$f" "\$QUEUE_DIR/in-progress/\$basename_f"
            task_file="\$QUEUE_DIR/in-progress/\$basename_f"
            break
        fi
    done

    release_task_lock
    echo "\$task_file"
}

# 主循环
while true; do
    task="\$(get_next_task)"

    if [ -z "\$task" ]; then
        echo "[worker-\$WORKER_ID] 没有更多任务，退出"
        break
    fi

    task_name="\$(basename "\$task")"
    echo "[worker-\$WORKER_ID] 处理任务: \$task_name"

    # 读取任务内容并直接调用 cc_wrapper
    local_prompt="\$(cat "\$task")"
    if [ -f "$SCRIPT_DIR/../shared/cc_wrapper.sh" ]; then
        source "$SCRIPT_DIR/../shared/cc_wrapper.sh"
        cc_run_unsafe "\$local_prompt" || {
            echo "[worker-\$WORKER_ID] 任务失败: \$task_name"
            mkdir -p "\$QUEUE_DIR/failed"
            mv "\$task" "\$QUEUE_DIR/failed/\$task_name"
            continue
        }
    else
        echo "[worker-\$WORKER_ID] WARNING: 找不到 cc_wrapper.sh，跳过任务"
        mkdir -p "\$QUEUE_DIR/failed"
        mv "\$task" "\$QUEUE_DIR/failed/\$task_name"
        continue
    fi

    # 任务完成，自动提交变更
    echo "[worker-\$WORKER_ID] 任务完成: \$task_name"
    cd "\$WORKTREE_DIR"
    changed="\$(git status --porcelain 2>/dev/null || true)"
    if [ -n "\$changed" ]; then
        echo "[worker-\$WORKER_ID] 检测到变更，提交中..."
        echo "\$changed"
        git add -A 2>/dev/null || true
        # 使用 -c 确保 git identity 可用，避免静默失败
        if git -c user.email="worker-\${WORKER_ID}@vibe.local" \
               -c user.name="Vibe Worker \${WORKER_ID}" \
               commit -m "worker-\$WORKER_ID: \$task_name" --no-verify 2>&1; then
            echo "[worker-\$WORKER_ID] 已提交"
        else
            echo "[worker-\$WORKER_ID] WARNING: git commit 失败" >&2
        fi
    else
        echo "[worker-\$WORKER_ID] 无文件变更"
    fi
    mkdir -p "\$QUEUE_DIR/done"
    mv "\$task" "\$QUEUE_DIR/done/\$task_name"
done

echo "[worker-\$WORKER_ID] Worker 退出于 \$(date '+%Y-%m-%d %H:%M:%S')"
WORKER_SCRIPT

    chmod +x "$script_path"
    echo "$script_path"
}

# ── 启动单个 worker ───────────────────────────────────────────────
_launch_worker() {
    local worker_id="$1"
    local name="w${worker_id}"
    local session_name="${TMUX_PREFIX}-${worker_id}"

    _log "── Worker $worker_id ──"

    # 使用锁确保 worktree 创建的串行化
    _lock_acquire "worktree-create"

    # 创建 worktree
    local wt_dir
    wt_dir="$(bash "$SCRIPT_DIR/worktree-manager.sh" create "$name" 2>/dev/null | tail -1)"

    _lock_release

    if [ -z "$wt_dir" ] || [ ! -d "$wt_dir" ]; then
        _err "创建 worktree '$name' 失败"
        return 1
    fi

    _log "  Worktree: $wt_dir"
    _log "  分支: worker-$name"
    _log "  tmux session: $session_name"

    # 创建 worker 启动脚本
    local worker_script
    worker_script="$(_create_worker_script "$worker_id" "$wt_dir" "$QUEUE_DIR")"

    # 在 tmux 中启动
    if tmux has-session -t "$session_name" 2>/dev/null; then
        _log "  WARNING: tmux session '$session_name' 已存在，先关闭"
        tmux kill-session -t "$session_name" 2>/dev/null || true
    fi

    tmux new-session -d -s "$session_name" "bash '$worker_script'"

    _log "  Worker $worker_id 已启动 (tmux: $session_name)"
}

# ── 主启动流程 ────────────────────────────────────────────────────
do_launch() {
    _check_deps
    _find_ralph_loop
    _resolve_queue_dir

    _log "========================================"
    _log "  并行 Worker 启动器"
    _log "========================================"
    _log "Workers 数量: $WORKERS"
    _log "任务队列: $QUEUE_DIR"
    _log "Ralph Loop: $RALPH_LOOP"
    _log "平台: $PLATFORM"
    _log ""

    # 检查任务队列目录
    if [ ! -d "$QUEUE_DIR" ]; then
        _err "任务队列目录不存在: $QUEUE_DIR"
        _err "请先创建任务队列"
        exit 1
    fi

    # 统计 pending 任务数
    local pending_count=0
    if [ -d "$QUEUE_DIR/pending" ]; then
        pending_count="$(find "$QUEUE_DIR/pending" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')"
    fi
    _log "待处理任务数: $pending_count"

    if [ "$pending_count" -eq 0 ]; then
        _log "WARNING: 没有待处理的任务"
    fi

    _log ""

    if [ "$DRY_RUN" = true ]; then
        _log "=== DRY RUN 模式 ==="
        _log ""
        for i in $(seq 1 "$WORKERS"); do
            local name="w${i}"
            local session_name="${TMUX_PREFIX}-${i}"
            _log "Worker $i:"
            _log "  将创建 worktree: $name (分支: worker-$name)"
            _log "  将启动 tmux session: $session_name"
            _log "  工作目录: $(_worktree_dir 2>/dev/null || echo '<git-root>/.claude-worktrees')/$name"
            _log "  任务队列: $QUEUE_DIR"
            _log ""
        done
        _log "=== DRY RUN 结束 (未执行任何操作) ==="
        return
    fi

    # 实际启动
    for i in $(seq 1 "$WORKERS"); do
        _launch_worker "$i" || {
            _err "Worker $i 启动失败"
            continue
        }
    done

    _log ""
    _log "========================================"
    _log "  所有 Worker 已启动!"
    _log "========================================"
    _log ""
    _log "管理命令:"
    _log "  tmux ls                        # 查看所有 session"
    _log "  tmux attach -t ${TMUX_PREFIX}-1  # 连接到 worker 1"
    _log "  tmux kill-session -t ${TMUX_PREFIX}-1  # 停止 worker 1"
    _log ""
    _log "Worktree 管理:"
    _log "  bash $SCRIPT_DIR/worktree-manager.sh list"
    _log "  bash $SCRIPT_DIR/worktree-manager.sh clean"
    _log ""
    _log "合并结果:"
    _log "  bash $SCRIPT_DIR/merge-helper.sh status"
    _log "  bash $SCRIPT_DIR/merge-helper.sh merge-all"
}

# ── 辅助: 获取 worktree 目录 (用于 dry-run) ──────────────────────
_worktree_dir() {
    local root
    root="$(git rev-parse --show-toplevel 2>/dev/null)"
    echo "$root/.claude-worktrees"
}

# ── 停止所有 worker ───────────────────────────────────────────────
cmd_stop() {
    _log "停止所有 worker..."
    local count=0
    for session in $(tmux ls -F '#{session_name}' 2>/dev/null | grep "^${TMUX_PREFIX}-" || true); do
        _log "  关闭 tmux session: $session"
        tmux kill-session -t "$session" 2>/dev/null || true
        count=$((count + 1))
    done
    if [ "$count" -eq 0 ]; then
        _log "没有运行中的 worker"
    else
        _log "已停止 $count 个 worker"
    fi
}

# ── 用法 ──────────────────────────────────────────────────────────
usage() {
    cat <<EOF
并行 Worker 启动器 - 同时运行多个 Claude Code 实例

用法: $(basename "$0") [options] [command]

命令:
  start (默认)    启动 N 个 worker
  stop            停止所有运行中的 worker

选项:
  --workers N     Worker 数量 (默认: 3)
  --queue-dir P   任务队列目录 (默认: ../stage-03-ralph-loop/task-queue)
  --dry-run       只显示将要执行的操作，不实际执行
  -h, --help      显示此帮助

示例:
  $(basename "$0") --workers 5
  $(basename "$0") --dry-run --workers 3
  $(basename "$0") --queue-dir /path/to/queue
  $(basename "$0") stop
EOF
}

# ── 参数解析 ──────────────────────────────────────────────────────
COMMAND="start"

while [ $# -gt 0 ]; do
    case "$1" in
        --workers)
            WORKERS="${2:-}"
            if [ -z "$WORKERS" ] || ! [[ "$WORKERS" =~ ^[0-9]+$ ]] || [ "$WORKERS" -lt 1 ]; then
                _err "--workers 需要正整数参数"
                exit 1
            fi
            shift 2
            ;;
        --queue-dir)
            QUEUE_DIR="${2:-}"
            if [ -z "$QUEUE_DIR" ]; then
                _err "--queue-dir 需要路径参数"
                exit 1
            fi
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        start)
            COMMAND="start"
            shift
            ;;
        stop)
            COMMAND="stop"
            shift
            ;;
        -h|--help|help)
            usage
            exit 0
            ;;
        *)
            _err "未知参数: $1"
            usage
            exit 1
            ;;
    esac
done

# ── 执行 ──────────────────────────────────────────────────────────
case "$COMMAND" in
    start) do_launch ;;
    stop)  cmd_stop ;;
esac
