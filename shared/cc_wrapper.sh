#!/usr/bin/env bash
# cc_wrapper.sh - Claude Code 统一调用包装器
# 解决 CLAUDECODE 环境变量导致的嵌套阻止问题
set -euo pipefail

_CC_WRAPPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_CC_WRAPPER_DIR/platform_detect.sh"

# 默认配置
CC_CMD="claude"
CC_TIMEOUT="${CC_TIMEOUT:-300}"
CC_OUTPUT_FORMAT="${CC_OUTPUT_FORMAT:-stream-json}"
CC_LOG_DIR="${CC_LOG_DIR:-/tmp/cc-logs}"

mkdir -p "$CC_LOG_DIR"

cc_run() {
    local prompt="$1"
    shift
    local extra_args=("$@")
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    local log_file="$CC_LOG_DIR/cc_${timestamp}_$$.log"

    echo "[cc_wrapper] $(date '+%Y-%m-%d %H:%M:%S') Starting CC task" | tee -a "$log_file"
    echo "[cc_wrapper] Prompt: ${prompt:0:100}..." >> "$log_file"

    # 关键: 清除 CLAUDECODE 环境变量以允许子进程调用
    local exit_code=0
    env -u CLAUDECODE "$CC_CMD" -p "$prompt" \
        --output-format "$CC_OUTPUT_FORMAT" \
        --verbose \
        "${extra_args[@]}" 2>>"$log_file" || exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo "[cc_wrapper] ERROR: CC exited with code $exit_code" | tee -a "$log_file"
    else
        echo "[cc_wrapper] SUCCESS" | tee -a "$log_file"
    fi

    return $exit_code
}

# 带超时的 CC 运行
cc_run_with_timeout() {
    local timeout="${1:-$CC_TIMEOUT}"
    local prompt="$2"
    shift 2
    local extra_args=("$@")

    if command -v timeout &>/dev/null; then
        timeout "$timeout" bash -c "$(declare -f cc_run); cc_run '$prompt' ${extra_args[*]}"
    elif command -v gtimeout &>/dev/null; then
        # macOS with coreutils
        gtimeout "$timeout" bash -c "$(declare -f cc_run); cc_run '$prompt' ${extra_args[*]}"
    else
        echo "[cc_wrapper] WARNING: timeout command not available, running without timeout"
        cc_run "$prompt" "${extra_args[@]}"
    fi
}

# 带 --dangerously-skip-permissions 的 CC 运行 (仅限沙箱内)
cc_run_unsafe() {
    local prompt="$1"
    shift
    cc_run "$prompt" --dangerously-skip-permissions "$@"
}

# 如果直接执行脚本
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [ $# -lt 1 ]; then
        echo "Usage: $0 <prompt> [extra-args...]"
        echo "  或 source 此脚本后调用 cc_run / cc_run_unsafe / cc_run_with_timeout"
        exit 1
    fi
    cc_run "$@"
fi
