#!/usr/bin/env bash
set -euo pipefail

# ralph-loop.sh - Bash 版任务队列循环
# 监控 task-queue/pending/ 目录，逐个执行 .md 任务文件
# 使用 cc_wrapper.sh 的 cc_run_unsafe 调用 Claude Code

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/cc_wrapper.sh"

# ---------- 默认配置 ----------
QUEUE_DIR="${SCRIPT_DIR}/task-queue"
RUN_ONCE=false
SLEEP_INTERVAL=30
LOCK_FILE=""
RUNNING=true

# ---------- 日志辅助 ----------
log() {
    echo "[ralph-loop] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

# ---------- 用法 ----------
usage() {
    cat >&2 <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --queue-dir DIR   自定义队列根目录 (默认: $QUEUE_DIR)
  --once            只执行一个任务后退出
  --sleep N         空队列时的睡眠秒数 (默认: $SLEEP_INTERVAL)
  -h, --help        显示帮助
EOF
    exit 0
}

# ---------- 参数解析 ----------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --queue-dir)
            QUEUE_DIR="$2"
            shift 2
            ;;
        --once)
            RUN_ONCE=true
            shift
            ;;
        --sleep)
            SLEEP_INTERVAL="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            log "ERROR: 未知参数: $1"
            usage
            ;;
    esac
done

# ---------- 目录验证 ----------
PENDING_DIR="${QUEUE_DIR}/pending"
IN_PROGRESS_DIR="${QUEUE_DIR}/in-progress"
DONE_DIR="${QUEUE_DIR}/done"
FAILED_DIR="${QUEUE_DIR}/failed"

for d in "$PENDING_DIR" "$IN_PROGRESS_DIR" "$DONE_DIR" "$FAILED_DIR"; do
    if [[ ! -d "$d" ]]; then
        log "ERROR: 目录不存在: $d"
        exit 1
    fi
done

LOCK_FILE="${QUEUE_DIR}/.ralph-loop.lock"

# ---------- 优雅退出 ----------
cleanup() {
    log "收到退出信号，正在清理..."
    RUNNING=false
    # 释放 flock (fd 会在进程退出时自动关闭)
    if [[ -n "$LOCK_FILE" && -f "$LOCK_FILE" ]]; then
        rm -f "$LOCK_FILE"
    fi
    log "已退出"
    exit 0
}
trap cleanup SIGTERM SIGINT SIGHUP

# ---------- 获取下一个待处理任务 ----------
# 返回文件名（不含路径），若无任务返回空
pick_next_task() {
    # 按文件名排序取第一个 .md 文件
    local task_file
    task_file=$(ls -1 "$PENDING_DIR"/*.md 2>/dev/null | head -n 1 || true)
    if [[ -n "$task_file" ]]; then
        basename "$task_file"
    fi
}

# ---------- 执行单个任务 ----------
process_task() {
    local task_name="$1"
    local src="${PENDING_DIR}/${task_name}"
    local dst="${IN_PROGRESS_DIR}/${task_name}"

    # 使用 flock 防止多 worker 竞争
    (
        flock -n 200 || {
            log "WARN: 无法获取锁，跳过: $task_name"
            return 1
        }

        # 再次检查文件是否仍在 pending (可能被其他 worker 拿走)
        if [[ ! -f "$src" ]]; then
            log "WARN: 任务已被其他 worker 拿走: $task_name"
            return 1
        fi

        # 移至 in-progress
        mv "$src" "$dst"
        log "任务移入 in-progress: $task_name"

    ) 200>"$LOCK_FILE"

    # 检查任务文件是否已在 in-progress
    if [[ ! -f "$dst" ]]; then
        return 1
    fi

    # 读取任务文件内容作为 prompt
    local prompt
    prompt=$(<"$dst")

    if [[ -z "$prompt" ]]; then
        log "ERROR: 任务文件为空: $task_name"
        mv "$dst" "${FAILED_DIR}/${task_name}"
        log "空任务移至 failed: $task_name"
        return 1
    fi

    log "开始执行任务: $task_name"
    log "Prompt 前 100 字符: ${prompt:0:100}..."

    local exit_code=0
    cc_run_unsafe "$prompt" || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        mv "$dst" "${DONE_DIR}/${task_name}"
        log "任务完成: $task_name -> done/"
    else
        mv "$dst" "${FAILED_DIR}/${task_name}"
        log "任务失败 (exit=$exit_code): $task_name -> failed/"
    fi

    return 0
}

# ---------- 主循环 ----------
main() {
    log "Ralph Loop 启动"
    log "队列目录: $QUEUE_DIR"
    log "单次模式: $RUN_ONCE"

    while $RUNNING; do
        local task_name
        task_name=$(pick_next_task)

        if [[ -z "$task_name" ]]; then
            if $RUN_ONCE; then
                log "单次模式且无待处理任务，退出"
                break
            fi
            log "队列为空，等待 ${SLEEP_INTERVAL}s..."
            sleep "$SLEEP_INTERVAL" &
            wait $! 2>/dev/null || true   # 让 sleep 可被 signal 中断
            continue
        fi

        process_task "$task_name" || true

        if $RUN_ONCE; then
            log "单次模式，执行完毕，退出"
            break
        fi
    done

    log "Ralph Loop 结束"
}

main
