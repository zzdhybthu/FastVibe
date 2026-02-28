#!/usr/bin/env bash
# setup-linux.sh - Linux (apt-based) 环境检查及安装脚本
# 检查 VibeCoding 项目所需工具，提供安装命令
# 工具偏好: fnm 管理 node, pnpm 替代 npm, brew 管理全局 CLI (如 claude)
set -euo pipefail

# ── 颜色定义 ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# ── 平台检查 ─────────────────────────────────────────────
if [[ "$(uname -s)" != "Linux" ]]; then
    echo -e "${RED}ERROR: 此脚本仅适用于 Linux。macOS 请使用 setup-mac.sh${NC}"
    exit 1
fi

# 检查是否为 apt-based 发行版
if ! command -v apt-get &>/dev/null; then
    echo -e "${RED}ERROR: 此脚本仅支持 apt-based Linux 发行版 (Debian/Ubuntu 等)${NC}"
    echo -e "${YELLOW}如果你使用其他发行版，请手动安装对应工具。${NC}"
    exit 1
fi

echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  VibeCoding - Linux 环境检查及安装${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

# ── 工具列表 ─────────────────────────────────────────────
TOOLS=(claude git tmux docker python3 fnm node pnpm)

# ── 检查函数 ─────────────────────────────────────────────
MISSING_COUNT=0
OK_COUNT=0
MISSING_LIST=()

check_tool() {
    local tool="$1"
    printf "  %-12s" "$tool"
    if command -v "$tool" &>/dev/null; then
        local ver=""
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
}

# ── 逐项检查 ─────────────────────────────────────────────
echo -e "${BOLD}[工具检查]${NC}"
echo "--------------------------------------------"

for tool in "${TOOLS[@]}"; do
    check_tool "$tool"
done

echo "--------------------------------------------"
echo ""

# ── 汇总报告 ─────────────────────────────────────────────
echo -e "${BOLD}[汇总报告]${NC}"
echo -e "  通过: ${GREEN}${OK_COUNT}${NC}  缺失: ${RED}${MISSING_COUNT}${NC}"
echo ""

if [ ${MISSING_COUNT} -eq 0 ]; then
    echo -e "${GREEN}所有工具已安装，环境检查通过!${NC}"
    exit 0
fi

# ── 安装建议 ─────────────────────────────────────────────
echo -e "${YELLOW}以下工具缺失，提供安装建议:${NC}"
echo ""

# 收集安装类别
APT_PACKAGES=()
NEED_FNM=false
NEED_NODE=false
NEED_PNPM=false
NEED_DOCKER=false
NEED_CLAUDE=false

for tool in "${MISSING_LIST[@]}"; do
    case "$tool" in
        claude)  NEED_CLAUDE=true ;;
        fnm)     NEED_FNM=true ;;
        node)    NEED_NODE=true ;;
        pnpm)    NEED_PNPM=true ;;
        docker)  NEED_DOCKER=true ;;
        *)       APT_PACKAGES+=("$tool") ;;
    esac
done

STEP=1

# apt 基础包
if [ ${#APT_PACKAGES[@]} -gt 0 ]; then
    echo -e "${BOLD}${STEP}) 基础工具 (apt):${NC}"
    echo -e "   ${YELLOW}sudo apt-get update && sudo apt-get install -y ${APT_PACKAGES[*]}${NC}"
    echo ""
    ((STEP++))
fi

# fnm (Fast Node Manager)
if $NEED_FNM; then
    echo -e "${BOLD}${STEP}) fnm (Fast Node Manager):${NC}"
    echo -e "   ${YELLOW}curl -fsSL https://fnm.vercel.app/install | bash${NC}"
    echo -e "   然后重启 shell 或 source 配置文件"
    echo ""
    ((STEP++))
fi

# Node.js (通过 fnm)
if $NEED_NODE; then
    echo -e "${BOLD}${STEP}) Node.js (通过 fnm):${NC}"
    echo -e "   ${YELLOW}fnm install --lts && fnm default lts-latest${NC}"
    if $NEED_FNM; then
        echo -e "   (需要先安装 fnm)"
    fi
    echo ""
    ((STEP++))
fi

# pnpm
if $NEED_PNPM; then
    echo -e "${BOLD}${STEP}) pnpm:${NC}"
    echo -e "   ${YELLOW}curl -fsSL https://get.pnpm.io/install.sh | sh -${NC}"
    echo -e "   或: ${YELLOW}corepack enable && corepack prepare pnpm@latest --activate${NC}"
    echo ""
    ((STEP++))
fi

# Docker (官方安装方式)
if $NEED_DOCKER; then
    echo -e "${BOLD}${STEP}) Docker (官方安装方式):${NC}"
    echo -e "   ${YELLOW}# 卸载旧版本${NC}"
    echo -e "   ${YELLOW}sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true${NC}"
    echo ""
    echo -e "   ${YELLOW}# 安装依赖${NC}"
    echo -e "   ${YELLOW}sudo apt-get update${NC}"
    echo -e "   ${YELLOW}sudo apt-get install -y ca-certificates curl gnupg${NC}"
    echo ""
    echo -e "   ${YELLOW}# 添加 Docker GPG key 和仓库${NC}"
    echo -e "   ${YELLOW}sudo install -m 0755 -d /etc/apt/keyrings${NC}"
    echo -e "   ${YELLOW}curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg${NC}"
    echo -e "   ${YELLOW}sudo chmod a+r /etc/apt/keyrings/docker.gpg${NC}"
    echo -e "   ${YELLOW}echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \$(. /etc/os-release && echo \"\$VERSION_CODENAME\") stable\" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null${NC}"
    echo ""
    echo -e "   ${YELLOW}# 安装 Docker${NC}"
    echo -e "   ${YELLOW}sudo apt-get update${NC}"
    echo -e "   ${YELLOW}sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin${NC}"
    echo ""
    echo -e "   ${YELLOW}# 将当前用户加入 docker 组 (免 sudo)${NC}"
    echo -e "   ${YELLOW}sudo usermod -aG docker \$USER${NC}"
    echo -e "   ${YELLOW}# 重新登录后生效${NC}"
    echo ""
    ((STEP++))
fi

# Claude Code CLI (通过 brew 或 npm 作为后备)
if $NEED_CLAUDE; then
    echo -e "${BOLD}${STEP}) Claude Code CLI:${NC}"
    echo -e "   推荐 (brew): ${YELLOW}brew install claude-code${NC}"
    echo -e "   后备 (npm):  ${YELLOW}npm install -g @anthropic-ai/claude-code${NC}"
    echo ""
    ((STEP++))
fi

# ── 自动安装提示 ──────────────────────────────────────────
echo "--------------------------------------------"
echo ""
read -rp "是否尝试自动安装缺失的基础工具? (y/N) " answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${BOLD}开始安装...${NC}"

    # apt 基础包
    if [ ${#APT_PACKAGES[@]} -gt 0 ]; then
        echo -e "${YELLOW}>> 安装 apt 包: ${APT_PACKAGES[*]}${NC}"
        sudo apt-get update
        sudo apt-get install -y "${APT_PACKAGES[@]}"
    fi

    # fnm
    if $NEED_FNM; then
        echo -e "${YELLOW}>> 安装 fnm...${NC}"
        curl -fsSL https://fnm.vercel.app/install | bash
        # 尝试加载 fnm
        export PATH="$HOME/.local/share/fnm:$PATH"
        eval "$(fnm env 2>/dev/null)" || true
    fi

    # Node.js
    if $NEED_NODE; then
        if command -v fnm &>/dev/null; then
            echo -e "${YELLOW}>> 通过 fnm 安装 Node.js LTS...${NC}"
            fnm install --lts
            fnm default lts-latest
        else
            echo -e "${RED}fnm 不可用，请先安装 fnm 后再安装 Node.js${NC}"
        fi
    fi

    # pnpm
    if $NEED_PNPM; then
        echo -e "${YELLOW}>> 安装 pnpm...${NC}"
        curl -fsSL https://get.pnpm.io/install.sh | sh -
    fi

    # Docker
    if $NEED_DOCKER; then
        echo -e "${YELLOW}>> 安装 Docker...${NC}"
        sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
        sudo apt-get update
        sudo apt-get install -y ca-certificates curl gnupg
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get update
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        sudo usermod -aG docker "$USER"
        echo -e "${YELLOW}注意: 需要重新登录才能免 sudo 使用 docker${NC}"
    fi

    # Claude Code CLI
    if $NEED_CLAUDE; then
        if command -v brew &>/dev/null; then
            echo -e "${YELLOW}>> 通过 brew 安装 Claude Code CLI...${NC}"
            brew install claude-code
        elif command -v npm &>/dev/null; then
            echo -e "${YELLOW}>> 通过 npm 安装 Claude Code CLI (brew 不可用)...${NC}"
            npm install -g @anthropic-ai/claude-code
        else
            echo -e "${RED}brew 和 npm 都不可用，请手动安装 Claude Code CLI${NC}"
        fi
    fi

    echo ""
    echo -e "${GREEN}安装完成! 请重新运行此脚本验证。${NC}"
else
    echo -e "${YELLOW}请按照上述建议手动安装缺失工具后重新运行此脚本。${NC}"
fi

exit "${MISSING_COUNT}"
