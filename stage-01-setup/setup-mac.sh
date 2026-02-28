#!/usr/bin/env bash
# setup-mac.sh - Mac 环境检查脚本
# 检查 VibeCoding 项目所需工具是否已安装，给出安装建议
# 工具偏好: fnm 管理 node, pnpm 替代 npm, brew 管理全局 CLI (如 claude)
set -euo pipefail

# ── 颜色定义 ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── 平台检查 ─────────────────────────────────────────────
if [[ "$(uname -s)" != "Darwin" ]]; then
    echo -e "${RED}ERROR: 此脚本仅适用于 macOS。Linux 请使用 setup-linux.sh${NC}"
    exit 1
fi

echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  VibeCoding - Mac 环境检查${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

# ── 检查 Homebrew ────────────────────────────────────────
echo -e "${BOLD}[前置] 检查 Homebrew...${NC}"
if command -v brew &>/dev/null; then
    echo -e "  Homebrew: ${GREEN}OK${NC} ($(brew --version | head -1))"
else
    echo -e "  Homebrew: ${RED}MISSING${NC}"
    echo -e "  ${YELLOW}安装命令: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"${NC}"
    echo ""
    echo -e "${RED}Homebrew 是 macOS 的包管理器，请先安装 Homebrew 再继续。${NC}"
    exit 1
fi
echo ""

# ── 逐项检查工具 ──────────────────────────────────────────
MISSING_COUNT=0
OK_COUNT=0
MISSING_LIST=()

echo -e "${BOLD}[工具检查]${NC}"
echo "--------------------------------------------"

# 检查工具列表: claude, git, tmux, docker, python3, fnm, node, pnpm
for tool in claude git tmux docker python3 fnm node pnpm; do
    printf "  %-12s" "$tool"
    if command -v "$tool" &>/dev/null; then
        case "$tool" in
            claude)  ver="$($tool --version 2>/dev/null || echo 'unknown')" ;;
            git)     ver="$(git --version 2>/dev/null | awk '{print $3}')" ;;
            tmux)    ver="$(tmux -V 2>/dev/null | awk '{print $2}')" ;;
            docker)  ver="$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')" ;;
            python3) ver="$(python3 --version 2>/dev/null | awk '{print $2}')" ;;
            fnm)     ver="$(fnm --version 2>/dev/null | awk '{print $2}')" ;;
            node)    ver="$(node --version 2>/dev/null)" ;;
            pnpm)    ver="$(pnpm --version 2>/dev/null)" ;;
            *)       ver="unknown" ;;
        esac
        echo -e "${GREEN}OK${NC}  (v${ver})"
        ((OK_COUNT++))
    else
        echo -e "${RED}MISSING${NC}"
        MISSING_LIST+=("$tool")
        ((MISSING_COUNT++))
    fi
done

echo "--------------------------------------------"
echo ""

# ── 汇总报告 ─────────────────────────────────────────────
echo -e "${BOLD}[汇总报告]${NC}"
echo -e "  通过: ${GREEN}${OK_COUNT}${NC}  缺失: ${RED}${MISSING_COUNT}${NC}"
echo ""

if [ ${MISSING_COUNT} -gt 0 ]; then
    echo -e "${YELLOW}以下工具缺失，请按建议安装:${NC}"
    echo ""
    for tool in "${MISSING_LIST[@]}"; do
        case "$tool" in
            claude)
                echo -e "  ${BOLD}$tool${NC} (Claude Code CLI):"
                echo -e "    ${YELLOW}brew install claude-code${NC}"
                ;;
            fnm)
                echo -e "  ${BOLD}$tool${NC} (Fast Node Manager):"
                echo -e "    ${YELLOW}brew install fnm${NC}"
                echo -e "    然后在 shell 配置中添加: eval \"\$(fnm env --use-on-cd)\""
                ;;
            node)
                echo -e "  ${BOLD}$tool${NC} (Node.js, 通过 fnm 管理):"
                echo -e "    ${YELLOW}fnm install --lts && fnm default lts-latest${NC}"
                echo -e "    (需要先安装 fnm)"
                ;;
            pnpm)
                echo -e "  ${BOLD}$tool${NC} (pnpm 包管理器):"
                echo -e "    ${YELLOW}brew install pnpm${NC}"
                ;;
            docker)
                echo -e "  ${BOLD}$tool${NC}:"
                echo -e "    ${YELLOW}brew install --cask docker${NC}"
                ;;
            *)
                echo -e "  ${BOLD}$tool${NC}:"
                echo -e "    ${YELLOW}brew install $tool${NC}"
                ;;
        esac
    done
    echo ""
    echo -e "${RED}环境检查未通过，请安装缺失工具后重新运行此脚本。${NC}"
    exit 1
else
    echo -e "${GREEN}所有工具已安装，环境检查通过!${NC}"
    exit 0
fi
