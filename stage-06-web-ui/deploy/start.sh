#!/usr/bin/env bash
# ============================================================================
# VibeCoding Web Manager - Startup Script
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

HOST="127.0.0.1"
PORT=8420

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  VibeCoding Web Manager${NC}"
echo -e "${CYAN}============================================${NC}"
echo

# ---------------------------------------------------------------------------
# Check dependencies
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[1/3] Checking dependencies...${NC}"

MISSING=0

python3 -c "import fastapi" 2>/dev/null || {
    echo -e "${RED}  [x] fastapi not found${NC}"
    MISSING=1
}

python3 -c "import uvicorn" 2>/dev/null || {
    echo -e "${RED}  [x] uvicorn not found${NC}"
    MISSING=1
}

python3 -c "import aiofiles" 2>/dev/null || {
    echo -e "${RED}  [x] aiofiles not found${NC}"
    MISSING=1
}

if [ "$MISSING" -eq 1 ]; then
    echo
    echo -e "${YELLOW}Installing missing dependencies...${NC}"
    pip3 install -r "$SCRIPT_DIR/requirements.txt"
    echo
fi

echo -e "${GREEN}  All dependencies satisfied.${NC}"
echo

# ---------------------------------------------------------------------------
# Set default auth token
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[2/3] Configuring...${NC}"

if [ -z "${VIBE_AUTH_TOKEN:-}" ]; then
    export VIBE_AUTH_TOKEN="vibecoding"
    echo -e "  VIBE_AUTH_TOKEN set to default: ${CYAN}vibecoding${NC}"
else
    echo -e "  VIBE_AUTH_TOKEN already set (using existing value)"
fi
echo

# ---------------------------------------------------------------------------
# Start server
# ---------------------------------------------------------------------------
echo -e "${YELLOW}[3/3] Starting server...${NC}"
echo
echo -e "  URL:   ${GREEN}http://${HOST}:${PORT}${NC}"
echo -e "  Token: ${GREEN}${VIBE_AUTH_TOKEN}${NC}"
echo
echo -e "${CYAN}--------------------------------------------${NC}"
echo -e "${CYAN}  SSH Tunnel (access from local machine):${NC}"
echo -e "${CYAN}  ssh -L ${PORT}:127.0.0.1:${PORT} user@remote${NC}"
echo -e "${CYAN}  Then open: http://localhost:${PORT}${NC}"
echo -e "${CYAN}--------------------------------------------${NC}"
echo

cd "$PROJECT_DIR"
exec python3 -m uvicorn server.app:app \
    --host "$HOST" \
    --port "$PORT" \
    --log-level info
