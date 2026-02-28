#!/usr/bin/env bash
#
# fill-templates.sh - Interactive (or automatic) template filler for CLAUDE.md and PROGRESS.md
#
# Usage:
#   ./fill-templates.sh              # interactive mode
#   ./fill-templates.sh --auto       # auto-detect via project-scanner.py
#   ./fill-templates.sh --auto --project-dir /path/to/project

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_TEMPLATE="${SCRIPT_DIR}/CLAUDE.md.template"
PROGRESS_TEMPLATE="${SCRIPT_DIR}/PROGRESS.md.template"

OUTPUT_DIR="$(pwd)"
AUTO_MODE=false
PROJECT_DIR="$(pwd)"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --auto)
            AUTO_MODE=true
            shift
            ;;
        --project-dir)
            PROJECT_DIR="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--auto] [--project-dir DIR] [--output-dir DIR]"
            echo ""
            echo "Options:"
            echo "  --auto           Use project-scanner.py to auto-detect project info"
            echo "  --project-dir    Directory to scan (default: current directory)"
            echo "  --output-dir     Where to write CLAUDE.md and PROGRESS.md (default: current directory)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
escape_for_sed() {
    # Escape characters that are special in sed replacement strings
    printf '%s' "$1" | sed -e 's/[&/\]/\\&/g'
}

today() {
    date +%Y-%m-%d
}

# ---------------------------------------------------------------------------
# Collect values
# ---------------------------------------------------------------------------
if $AUTO_MODE; then
    echo "==> Running project-scanner.py on ${PROJECT_DIR} ..."
    SCANNER="${SCRIPT_DIR}/project-scanner.py"
    if [[ ! -f "$SCANNER" ]]; then
        echo "Error: project-scanner.py not found at ${SCANNER}" >&2
        exit 1
    fi

    JSON=$(uv run python "$SCANNER" --project-dir "$PROJECT_DIR")

    # Extract fields with python (avoids jq dependency)
    field() {
        uv run python -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" <<< "$JSON"
    }

    PROJECT_NAME="$(field project_name)"
    PROJECT_DESCRIPTION="$(field description)"
    TECH_STACK="$(field tech_stack)"
    ARCHITECTURE="$(field architecture)"
    CODE_STYLE="$(field code_style)"
    KNOWN_ISSUES="$(field known_issues)"
    CUSTOM_RULES="$(field custom_rules)"
    CURRENT_STATUS="$(field current_status)"

    # Provide sensible defaults for fields the scanner may not fill
    : "${PROJECT_NAME:=my-project}"
    : "${PROJECT_DESCRIPTION:=_No description detected._}"
    : "${TECH_STACK:=_Not detected._}"
    : "${ARCHITECTURE:=_Not detected. Describe the high-level architecture here._}"
    : "${CODE_STYLE:=_Not detected. Define code-style rules here._}"
    : "${KNOWN_ISSUES:=- _None yet._}"
    : "${CUSTOM_RULES:=- _Add project-specific rules here._}"
    : "${CURRENT_STATUS:=Project scanned. Ready for development.}"

    echo "==> Detected project: ${PROJECT_NAME}"
else
    # Interactive mode
    echo "============================================"
    echo "  CLAUDE.md + PROGRESS.md Template Filler"
    echo "============================================"
    echo ""

    read -rp "Project name: " PROJECT_NAME
    : "${PROJECT_NAME:=my-project}"

    read -rp "Project description: " PROJECT_DESCRIPTION
    : "${PROJECT_DESCRIPTION:=_No description provided._}"

    read -rp "Tech stack (e.g. Python 3.12, FastAPI, PostgreSQL): " TECH_STACK
    : "${TECH_STACK:=_Not specified._}"

    read -rp "Architecture summary (or press Enter to skip): " ARCHITECTURE
    : "${ARCHITECTURE:=_Describe the high-level architecture here._}"

    read -rp "Code style notes (or press Enter to skip): " CODE_STYLE
    : "${CODE_STYLE:=_Define code-style rules here._}"

    read -rp "Known issues (or press Enter to skip): " KNOWN_ISSUES
    : "${KNOWN_ISSUES:=- _None yet._}"

    read -rp "Custom workflow rules (or press Enter to skip): " CUSTOM_RULES
    : "${CUSTOM_RULES:=- _Add project-specific rules here._}"

    read -rp "Current project status (or press Enter to skip): " CURRENT_STATUS
    : "${CURRENT_STATUS:=Project initialized. Ready for development.}"
fi

# ---------------------------------------------------------------------------
# Generate CLAUDE.md
# ---------------------------------------------------------------------------
echo "==> Generating ${OUTPUT_DIR}/CLAUDE.md ..."

sed \
    -e "s|{{PROJECT_NAME}}|$(escape_for_sed "$PROJECT_NAME")|g" \
    -e "s|{{PROJECT_DESCRIPTION}}|$(escape_for_sed "$PROJECT_DESCRIPTION")|g" \
    -e "s|{{TECH_STACK}}|$(escape_for_sed "$TECH_STACK")|g" \
    -e "s|{{ARCHITECTURE}}|$(escape_for_sed "$ARCHITECTURE")|g" \
    -e "s|{{CODE_STYLE}}|$(escape_for_sed "$CODE_STYLE")|g" \
    -e "s|{{KNOWN_ISSUES}}|$(escape_for_sed "$KNOWN_ISSUES")|g" \
    -e "s|{{CUSTOM_RULES}}|$(escape_for_sed "$CUSTOM_RULES")|g" \
    "$CLAUDE_TEMPLATE" > "${OUTPUT_DIR}/CLAUDE.md"

echo "    -> ${OUTPUT_DIR}/CLAUDE.md written."

# ---------------------------------------------------------------------------
# Generate PROGRESS.md
# ---------------------------------------------------------------------------
echo "==> Generating ${OUTPUT_DIR}/PROGRESS.md ..."

sed \
    -e "s|{{CURRENT_STATUS}}|$(escape_for_sed "$CURRENT_STATUS")|g" \
    -e "s|{{TODAY}}|$(today)|g" \
    "$PROGRESS_TEMPLATE" > "${OUTPUT_DIR}/PROGRESS.md"

echo "    -> ${OUTPUT_DIR}/PROGRESS.md written."

echo ""
echo "Done. Review the generated files and customize as needed."
