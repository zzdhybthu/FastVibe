#!/usr/bin/env bash
# platform_detect.sh - Mac/Linux 平台检测
# source 此文件后使用 $PLATFORM 变量

detect_platform() {
    local uname_out
    uname_out="$(uname -s)"
    case "$uname_out" in
        Darwin*) PLATFORM="mac" ;;
        Linux*)  PLATFORM="linux" ;;
        *)       PLATFORM="unknown" ;;
    esac
    export PLATFORM
}

is_mac() { [ "$PLATFORM" = "mac" ]; }
is_linux() { [ "$PLATFORM" = "linux" ]; }

# 自动检测
detect_platform
