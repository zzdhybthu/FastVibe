#!/usr/bin/env bash
set -euo pipefail

# backup.sh - Backup project directory with rotation
# Usage: backup.sh [/path/to/project]
# Cron example: 0 * * * * /path/to/backup.sh /path/to/project

PROJECT_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_ROOT="$PROJECT_DIR/.backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
MAX_BACKUPS=24

# Validate project directory
if [[ ! -d "$PROJECT_DIR" ]]; then
    echo "Error: Project directory '$PROJECT_DIR' does not exist."
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "Backing up: $PROJECT_DIR"
echo "Destination: $BACKUP_DIR"

# Rsync with exclusions
rsync -a \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='__pycache__' \
    --exclude='.backups' \
    "$PROJECT_DIR/" "$BACKUP_DIR/"

# Calculate and display backup size
BACKUP_SIZE="$(du -sh "$BACKUP_DIR" | cut -f1)"
echo "Backup complete: $BACKUP_SIZE at $BACKUP_DIR"

# Rotate old backups: keep only the most recent MAX_BACKUPS
BACKUP_COUNT="$(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]]; then
    REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
    echo "Rotating backups: removing $REMOVE_COUNT old backup(s)..."
    ls -1d "$BACKUP_ROOT"/*/ | head -n "$REMOVE_COUNT" | while read -r old_backup; do
        echo "  Removing: $old_backup"
        rm -rf "$old_backup"
    done
fi

REMAINING="$(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | wc -l | tr -d ' ')"
echo "Backups retained: $REMAINING / $MAX_BACKUPS"
