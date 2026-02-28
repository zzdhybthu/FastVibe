#!/usr/bin/env bash
# parallel-launch.sh - 一个任务一个 worktree，并行启动
# 为每个待处理任务创建独立的 git worktree，支持并行度限制
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/platform_detect.sh"

# ── 默认配置 ──────────────────────────────────────────────────────
MAX_PARALLEL=3
QUEUE_DIR="$SCRIPT_DIR/../stage-03-ralph-loop/task-queue"
DRY_RUN=false
TMUX_PREFIX="vibe-task"

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

    if ! command -v git &>/dev/null; then
        missing+=("git")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        _err "缺少依赖: ${missing[*]}"
        _err "请先安装: ${missing[*]}"
        exit 1
    fi
}

_resolve_queue_dir() {
    # 确保 queue_dir 是绝对路径
    if [[ "$QUEUE_DIR" != /* ]]; then
        QUEUE_DIR="$(cd "$SCRIPT_DIR" && cd "$(dirname "$QUEUE_DIR")" && pwd)/$(basename "$QUEUE_DIR")"
    fi
}

# 任务文件名 → 安全的 worktree 名称
_sanitize_name() {
    local name="$1"
    name="${name%.*}"                                         # 去掉扩展名
    name="$(echo "$name" | tr '[:upper:]' '[:lower:]')"      # 小写
    name="$(echo "$name" | tr ' ' '-')"                      # 空格→连字符
    name="$(echo "$name" | tr -cd 'a-z0-9_-')"              # 只保留安全字符
    name="$(echo "$name" | sed 's/^-//;s/-$//')"             # 去掉首尾连字符
    name="$(echo "$name" | sed 's/--*/-/g')"                 # 合并多个连字符
    if [ -z "$name" ]; then
        name="task-$(date +%s)"
    fi
    echo "$name"
}

# ── 跨平台锁机制 ─────────────────────────────────────────────────
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

    echo $$ > "$LOCK_DIR/pid"
    return 0
}

_lock_release() {
    if [ -n "$LOCK_DIR" ] && [ -d "$LOCK_DIR" ]; then
        rm -rf "$LOCK_DIR"
    fi
}

trap '_lock_release' EXIT

# ── 辅助: 获取 worktree 目录 ─────────────────────────────────────
_worktree_dir() {
    local root
    root="$(git rev-parse --show-toplevel 2>/dev/null)"
    echo "$root/.claude-worktrees"
}

# ── 获取 pending 任务列表 ────────────────────────────────────────
_get_pending_tasks() {
    local tasks=()
    local pending_dir="$QUEUE_DIR/pending"
    if [ ! -d "$pending_dir" ]; then
        echo ""
        return
    fi
    for f in "$pending_dir"/*.md "$pending_dir"/*.txt "$pending_dir"/*.task; do
        [ -f "$f" ] && tasks+=("$f")
    done
    # 输出每行一个，方便 readarray
    printf '%s\n' "${tasks[@]+"${tasks[@]}"}"
}

# ── 确保 worktree 名称唯一 ──────────────────────────────────────
_unique_name() {
    local base_name="$1"
    local name="$base_name"
    local suffix=0

    while [ -d "$(_worktree_dir)/$name" ] || \
          git show-ref --verify --quiet "refs/heads/worker-$name" 2>/dev/null; do
        suffix=$((suffix + 1))
        name="${base_name}-${suffix}"
    done
    echo "$name"
}

# ── 创建单任务 worker 脚本 ───────────────────────────────────────
_create_worker_script() {
    local task_name="$1"
    local wt_dir="$2"
    local task_file="$3"     # in-progress 中的绝对路径
    local queue_dir="$4"
    local script_path="${TMPDIR:-/tmp}/vibe-task-${task_name}-start.sh"

    # 计算 cc_wrapper 的绝对路径
    local cc_wrapper_path="$SCRIPT_DIR/../shared/cc_wrapper.sh"
    if [ -f "$cc_wrapper_path" ]; then
        cc_wrapper_path="$(cd "$(dirname "$cc_wrapper_path")" && pwd)/$(basename "$cc_wrapper_path")"
    fi

    cat > "$script_path" <<WORKER_SCRIPT
#!/usr/bin/env bash
# 单任务 worker 脚本 - task: ${task_name}
set -euo pipefail

TASK_NAME="$task_name"
WORKTREE_DIR="$wt_dir"
TASK_FILE="$task_file"
QUEUE_DIR="$queue_dir"

cd "\$WORKTREE_DIR"

task_basename="\$(basename "\$TASK_FILE")"
echo "[task-\$TASK_NAME] 启动于 \$(date '+%Y-%m-%d %H:%M:%S')"
echo "[task-\$TASK_NAME] 工作目录: \$WORKTREE_DIR"
echo "[task-\$TASK_NAME] 任务文件: \$TASK_FILE"

# 读取任务内容
local_prompt="\$(cat "\$TASK_FILE")"
echo "[task-\$TASK_NAME] 任务内容: \${local_prompt:0:100}..."
echo ""

# 执行任务
task_failed=false
if [ -f "$cc_wrapper_path" ]; then
    source "$cc_wrapper_path"
    cc_run_unsafe "\$local_prompt" || {
        echo "[task-\$TASK_NAME] 任务执行失败: \$task_basename"
        task_failed=true
    }
else
    echo "[task-\$TASK_NAME] WARNING: 找不到 cc_wrapper.sh，跳过执行"
    task_failed=true
fi

if [ "\$task_failed" = true ]; then
    mkdir -p "\$QUEUE_DIR/failed"
    mv "\$TASK_FILE" "\$QUEUE_DIR/failed/\$task_basename" 2>/dev/null || true
    echo "[task-\$TASK_NAME] 退出于 \$(date '+%Y-%m-%d %H:%M:%S')"
    exit 1
fi

# 自动提交变更
echo ""
cd "\$WORKTREE_DIR"
changed="\$(git status --porcelain 2>/dev/null || true)"
if [ -n "\$changed" ]; then
    echo "[task-\$TASK_NAME] 检测到变更，提交中..."
    echo "\$changed"
    git add -A 2>/dev/null || true
    if git -c user.email="task-\${TASK_NAME}@vibe.local" \\
           -c user.name="Vibe Task \${TASK_NAME}" \\
           commit -m "task-\$TASK_NAME: \$task_basename" --no-verify 2>&1; then
        echo "[task-\$TASK_NAME] 已提交"
    else
        echo "[task-\$TASK_NAME] WARNING: git commit 失败" >&2
    fi
else
    echo "[task-\$TASK_NAME] 无文件变更"
fi

# 移动到已完成
mkdir -p "\$QUEUE_DIR/done"
mv "\$TASK_FILE" "\$QUEUE_DIR/done/\$task_basename" 2>/dev/null || true
echo "[task-\$TASK_NAME] 完成于 \$(date '+%Y-%m-%d %H:%M:%S')"
WORKER_SCRIPT

    chmod +x "$script_path"
    echo "$script_path"
}

# ── 启动单个任务 ─────────────────────────────────────────────────
_launch_task() {
    local task_file="$1"
    local task_basename
    task_basename="$(basename "$task_file")"
    local task_name
    task_name="$(_sanitize_name "$task_basename")"
    task_name="$(_unique_name "$task_name")"
    local session_name="${TMUX_PREFIX}-${task_name}"

    _log "── 任务: $task_basename ──"

    # 创建 worktree (加锁串行化)
    _lock_acquire "worktree-create"

    local wt_dir
    wt_dir="$(bash "$SCRIPT_DIR/worktree-manager.sh" create "$task_name" 2>/dev/null | tail -1)"

    _lock_release

    if [ -z "$wt_dir" ] || [ ! -d "$wt_dir" ]; then
        _err "创建 worktree '$task_name' 失败"
        return 1
    fi

    # 移动任务到 in-progress
    mkdir -p "$QUEUE_DIR/in-progress"
    mv "$task_file" "$QUEUE_DIR/in-progress/$task_basename"
    local task_in_progress="$QUEUE_DIR/in-progress/$task_basename"

    _log "  Worktree: $wt_dir"
    _log "  分支: worker-$task_name"
    _log "  任务文件: $task_basename"
    _log "  tmux session: $session_name"

    # 创建单任务 worker 脚本
    local worker_script
    worker_script="$(_create_worker_script "$task_name" "$wt_dir" "$task_in_progress" "$QUEUE_DIR")"

    # 在 tmux 中启动
    if tmux has-session -t "$session_name" 2>/dev/null; then
        _log "  WARNING: tmux session '$session_name' 已存在，先关闭"
        tmux kill-session -t "$session_name" 2>/dev/null || true
    fi

    tmux new-session -d -s "$session_name" "bash '$worker_script'"

    _log "  任务已启动 (tmux: $session_name)"
}

# ── 主启动流程 ────────────────────────────────────────────────────
do_launch() {
    _check_deps
    _resolve_queue_dir

    _log "========================================"
    _log "  并行任务启动器 (一任务一Worktree)"
    _log "========================================"
    _log "最大并行数: $MAX_PARALLEL"
    _log "任务队列: $QUEUE_DIR"
    _log "平台: $PLATFORM"
    _log ""

    # 检查任务队列目录
    if [ ! -d "$QUEUE_DIR" ]; then
        _err "任务队列目录不存在: $QUEUE_DIR"
        _err "请先创建任务队列"
        exit 1
    fi

    # 收集 pending 任务
    local tasks=()
    local pending_dir="$QUEUE_DIR/pending"
    if [ -d "$pending_dir" ]; then
        for f in "$pending_dir"/*.md "$pending_dir"/*.txt "$pending_dir"/*.task; do
            [ -f "$f" ] && tasks+=("$f")
        done
    fi

    local total=${#tasks[@]}
    _log "待处理任务数: $total"

    if [ "$total" -eq 0 ]; then
        _log "没有待处理的任务"
        return
    fi

    # 受 MAX_PARALLEL 限制
    local launch_count=$total
    if [ "$launch_count" -gt "$MAX_PARALLEL" ]; then
        launch_count=$MAX_PARALLEL
        _log "受 --workers 限制，本次将启动 $launch_count 个任务"
    fi

    _log ""

    if [ "$DRY_RUN" = true ]; then
        _log "=== DRY RUN 模式 ==="
        _log ""
        for ((i = 0; i < launch_count; i++)); do
            local task_file="${tasks[$i]}"
            local task_basename
            task_basename="$(basename "$task_file")"
            local task_name
            task_name="$(_sanitize_name "$task_basename")"
            _log "任务 $((i + 1)):"
            _log "  文件: $task_basename"
            _log "  将创建 worktree: $task_name (分支: worker-$task_name)"
            _log "  将启动 tmux session: ${TMUX_PREFIX}-${task_name}"
            _log ""
        done
        if [ "$total" -gt "$launch_count" ]; then
            _log "剩余 $((total - launch_count)) 个任务等待下次启动"
        fi
        _log "=== DRY RUN 结束 (未执行任何操作) ==="
        return
    fi

    # 实际启动
    local launched=0
    for ((i = 0; i < launch_count; i++)); do
        _launch_task "${tasks[$i]}" && launched=$((launched + 1)) || {
            _err "任务启动失败: $(basename "${tasks[$i]}")"
            continue
        }
    done

    _log ""
    _log "========================================"
    _log "  已启动 $launched 个任务!"
    if [ "$total" -gt "$launch_count" ]; then
        _log "  剩余 $((total - launch_count)) 个任务等待下次启动"
    fi
    _log "========================================"
    _log ""
    _log "管理命令:"
    _log "  tmux ls                                  # 查看所有 session"
    _log "  tmux attach -t ${TMUX_PREFIX}-<task-name>  # 连接到任务"
    _log ""
    _log "Worktree 管理:"
    _log "  bash $SCRIPT_DIR/worktree-manager.sh list"
    _log "  bash $SCRIPT_DIR/worktree-manager.sh clean"
    _log ""
    _log "合并结果:"
    _log "  bash $SCRIPT_DIR/merge-helper.sh status"
    _log "  bash $SCRIPT_DIR/merge-helper.sh merge-all"
}

# ── 停止所有任务 ─────────────────────────────────────────────────
cmd_stop() {
    _log "停止所有任务..."
    local count=0
    for session in $(tmux ls -F '#{session_name}' 2>/dev/null | grep "^${TMUX_PREFIX}-" || true); do
        _log "  关闭 tmux session: $session"
        tmux kill-session -t "$session" 2>/dev/null || true
        count=$((count + 1))
    done
    if [ "$count" -eq 0 ]; then
        _log "没有运行中的任务"
    else
        _log "已停止 $count 个任务"
    fi
}

# ── 用法 ──────────────────────────────────────────────────────────
usage() {
    cat <<EOF
并行任务启动器 - 一个任务一个 worktree

每个待处理任务在独立的 git worktree 中运行，互不干扰。
通过 --workers 控制最大并行数。

用法: $(basename "$0") [options] [command]

命令:
  start (默认)    为每个待处理任务创建独立 worktree 并启动
  stop            停止所有运行中的任务

选项:
  --workers N     最大并行任务数 (默认: 3)
  --queue-dir P   任务队列目录 (默认: ../stage-03-ralph-loop/task-queue)
  --dry-run       只显示将要执行的操作，不实际执行
  -h, --help      显示此帮助

示例:
  $(basename "$0") --workers 5          # 最多 5 个任务并行
  $(basename "$0") --dry-run            # 预览模式
  $(basename "$0") --queue-dir /path    # 指定任务队列
  $(basename "$0") stop                 # 停止所有任务
EOF
}

# ── 参数解析 ──────────────────────────────────────────────────────
COMMAND="start"

while [ $# -gt 0 ]; do
    case "$1" in
        --workers)
            MAX_PARALLEL="${2:-}"
            if [ -z "$MAX_PARALLEL" ] || ! [[ "$MAX_PARALLEL" =~ ^[0-9]+$ ]] || [ "$MAX_PARALLEL" -lt 1 ]; then
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
