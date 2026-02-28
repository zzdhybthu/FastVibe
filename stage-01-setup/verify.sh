#!/usr/bin/env bash
# verify.sh - 统一验证脚本
# 检查所有依赖版本并测试 Claude Code API 连通性
set -euo pipefail

# ── 定位项目根目录并 source 共享脚本 ─────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/platform_detect.sh"

# ── 颜色定义 ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# ── 结果收集 ─────────────────────────────────────────────
TOTAL=0
PASSED=0
FAILED=0
RESULTS=()  # 存储 "工具|版本|状态" 格式

# ── 检查单个工具 ──────────────────────────────────────────
check_tool() {
    local tool="$1"
    local ver=""
    local status=""
    ((TOTAL++)) || true

    if command -v "$tool" &>/dev/null; then
        case "$tool" in
            claude)
                ver="$($tool --version 2>/dev/null || echo 'unknown')"
                ;;
            git)
                ver="$(git --version 2>/dev/null | awk '{print $3}')"
                ;;
            tmux)
                ver="$(tmux -V 2>/dev/null | awk '{print $2}')"
                ;;
            docker)
                ver="$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')"
                ;;
            uv)
                ver="$(uv --version 2>/dev/null | awk '{print $2}')"
                ;;
            node)
                ver="$(node --version 2>/dev/null | tr -d 'v')"
                ;;
            fnm)
                ver="$(fnm --version 2>/dev/null | awk '{print $2}')"
                ;;
            pnpm)
                ver="$(pnpm --version 2>/dev/null)"
                ;;
            *)
                ver="$($tool --version 2>/dev/null | head -1 || echo 'unknown')"
                ;;
        esac
        status="OK"
        ((PASSED++)) || true
    else
        ver="-"
        status="FAIL"
        ((FAILED++)) || true
    fi

    RESULTS+=("${tool}|${ver}|${status}")
}

# ── 输出表格 ─────────────────────────────────────────────
print_table() {
    # 表头
    printf "${BOLD}  %-14s %-22s %-8s${NC}\n" "Tool" "Version" "Status"
    printf "  %-14s %-22s %-8s\n" "--------------" "----------------------" "--------"

    for entry in "${RESULTS[@]}"; do
        IFS='|' read -r tool ver status <<< "$entry"
        if [ "$status" = "OK" ]; then
            printf "  %-14s %-22s ${GREEN}%-8s${NC}\n" "$tool" "$ver" "$status"
        else
            printf "  %-14s %-22s ${RED}%-8s${NC}\n" "$tool" "$ver" "$status"
        fi
    done
}

# ── 主流程 ───────────────────────────────────────────────
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  VibeCoding - 环境验证${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

# 平台信息
echo -e "${BOLD}[平台信息]${NC}"
echo -e "  Platform: ${YELLOW}${PLATFORM}${NC}"
echo -e "  Kernel:   $(uname -r)"
echo -e "  Arch:     $(uname -m)"
echo ""

# ── 检查所有工具 ─────────────────────────────────────────
echo -e "${BOLD}[依赖检查]${NC}"

TOOLS=(claude git tmux docker uv fnm node pnpm)
for tool in "${TOOLS[@]}"; do
    check_tool "$tool"
done

echo ""
print_table
echo ""

# ── 测试 Claude Code API 连通性 ──────────────────────────
echo -e "${BOLD}[Claude Code API 连通性测试]${NC}"

CC_STATUS="FAIL"
CC_MESSAGE=""

if ! command -v claude &>/dev/null; then
    CC_MESSAGE="claude 命令未找到，跳过 API 测试"
    echo -e "  ${RED}SKIP${NC} - $CC_MESSAGE"
else
    echo -e "  测试中... (env -u CLAUDECODE claude -p \"say hello\" --output-format json)"
    echo ""

    # 带超时的 API 测试
    CC_OUTPUT=""
    CC_EXIT_CODE=0

    # 选择超时命令
    TIMEOUT_CMD=""
    if command -v timeout &>/dev/null; then
        TIMEOUT_CMD="timeout"
    elif command -v gtimeout &>/dev/null; then
        TIMEOUT_CMD="gtimeout"
    fi

    if [ -n "$TIMEOUT_CMD" ]; then
        CC_OUTPUT=$($TIMEOUT_CMD 30 env -u CLAUDECODE claude -p "say hello" --output-format json 2>&1) || CC_EXIT_CODE=$?
    else
        # 无 timeout 命令，直接运行
        CC_OUTPUT=$(env -u CLAUDECODE claude -p "say hello" --output-format json 2>&1) || CC_EXIT_CODE=$?
    fi

    if [ $CC_EXIT_CODE -eq 0 ] && [ -n "$CC_OUTPUT" ]; then
        CC_STATUS="OK"
        CC_MESSAGE="API 连通正常"
        echo -e "  ${GREEN}OK${NC} - $CC_MESSAGE"
        # 截取部分输出展示
        PREVIEW=$(echo "$CC_OUTPUT" | head -3)
        echo -e "  响应预览:"
        echo "$PREVIEW" | while IFS= read -r line; do
            echo -e "    ${YELLOW}$line${NC}"
        done
    elif [ $CC_EXIT_CODE -eq 124 ]; then
        CC_MESSAGE="API 请求超时 (30s)"
        echo -e "  ${RED}FAIL${NC} - $CC_MESSAGE"
    else
        CC_MESSAGE="API 请求失败 (exit code: $CC_EXIT_CODE)"
        echo -e "  ${RED}FAIL${NC} - $CC_MESSAGE"
        if [ -n "$CC_OUTPUT" ]; then
            echo -e "  错误输出:"
            echo "$CC_OUTPUT" | head -5 | while IFS= read -r line; do
                echo -e "    ${RED}$line${NC}"
            done
        fi
    fi
fi

echo ""

# ── API 状态计入总计 ─────────────────────────────────────
((TOTAL++)) || true
if [ "$CC_STATUS" = "OK" ]; then
    ((PASSED++)) || true
    RESULTS+=("cc-api|connected|OK")
else
    ((FAILED++)) || true
    RESULTS+=("cc-api|-|FAIL")
fi

# ── 最终报告 ─────────────────────────────────────────────
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}[最终报告]${NC}"
echo -e "  检查项: ${TOTAL}  通过: ${GREEN}${PASSED}${NC}  失败: ${RED}${FAILED}${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}>>> PASS <<<${NC}"
    echo -e "  ${GREEN}所有环境检查通过，可以开始 VibeCoding!${NC}"
    echo ""

    # 平台相关提示
    if is_mac; then
        echo -e "  ${YELLOW}提示: macOS 用户可运行 setup-mac.sh 查看更多信息${NC}"
    elif is_linux; then
        echo -e "  ${YELLOW}提示: Linux 用户可运行 setup-linux.sh 进行自动安装${NC}"
    fi

    exit 0
else
    echo -e "  ${RED}${BOLD}>>> FAIL <<<${NC}"
    echo -e "  ${RED}有 ${FAILED} 项检查未通过，请修复后重新验证。${NC}"
    echo ""

    # 平台相关提示
    if is_mac; then
        echo -e "  ${YELLOW}运行 ./setup-mac.sh 获取安装建议${NC}"
    elif is_linux; then
        echo -e "  ${YELLOW}运行 ./setup-linux.sh 进行自动安装${NC}"
    else
        echo -e "  ${YELLOW}未识别的平台，请手动安装缺失工具${NC}"
    fi

    exit 1
fi
