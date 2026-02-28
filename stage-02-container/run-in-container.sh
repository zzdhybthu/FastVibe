#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# shellcheck source=../shared/platform_detect.sh
source "$SCRIPT_DIR/../shared/platform_detect.sh"

IMAGE_NAME="claude-dev"
FORCE_BUILD=false
CUSTOM_CMD=""
UNSAFE_FLAG=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --build)
            FORCE_BUILD=true
            shift
            ;;
        --cmd)
            CUSTOM_CMD="$2"
            shift 2
            ;;
        --unsafe)
            UNSAFE_FLAG="--dangerously-skip-permissions"
            shift
            ;;
        *)
            echo "Usage: $0 [--build] [--cmd \"...\"] [--unsafe]"
            echo "  --build   Force rebuild the Docker image"
            echo "  --cmd     Run a specific command instead of interactive bash"
            echo "  --unsafe  Add --dangerously-skip-permissions flag"
            exit 1
            ;;
    esac
done

# Check if image exists
IMAGE_EXISTS=$(docker images -q "$IMAGE_NAME" 2>/dev/null)

if [[ "$FORCE_BUILD" == true ]] || [[ -z "$IMAGE_EXISTS" ]]; then
    echo "Building Docker image '$IMAGE_NAME'..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" build
    echo "Build complete."
fi

echo "Platform detected: $PLATFORM"

# Determine the command to run
if [[ -n "$CUSTOM_CMD" ]]; then
    if [[ -n "$UNSAFE_FLAG" ]]; then
        CUSTOM_CMD="$CUSTOM_CMD $UNSAFE_FLAG"
    fi
    echo "Running command: $CUSTOM_CMD"
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" run --rm claude-dev bash -c "$CUSTOM_CMD"
else
    if [[ -n "$UNSAFE_FLAG" ]]; then
        echo "Starting interactive bash (unsafe mode enabled)..."
        echo "Use: claude $UNSAFE_FLAG"
    else
        echo "Starting interactive bash..."
    fi
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" run --rm claude-dev bash
fi
