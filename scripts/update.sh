#!/bin/bash
# git-hit-archive: daily update script
# Fetches new repos (last 7 days), scores, enriches, embeds, exports

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/data"
LOG_FILE="$LOG_DIR/update-$(date +%Y%m%d-%H%M%S).log"
LOCK_DIR="$PROJECT_DIR/data/.pipeline.lock"

# Prevent concurrent runs (mkdir is atomic and POSIX-compatible)
cleanup_lock() { rmdir "$LOCK_DIR" 2>/dev/null || true; }
trap cleanup_lock EXIT

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  # Check if the lock is stale (older than 4 hours)
  if [ -d "$LOCK_DIR" ]; then
    lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR") ))
    if [ "$lock_age" -gt 14400 ]; then
      echo "Removing stale lock (age: ${lock_age}s)" | tee -a "$LOG_FILE"
      rmdir "$LOCK_DIR" 2>/dev/null || true
      mkdir "$LOCK_DIR" 2>/dev/null || { echo "Pipeline already running, skipping" | tee -a "$LOG_FILE"; exit 0; }
    else
      echo "Pipeline already running, skipping" | tee -a "$LOG_FILE"
      exit 0
    fi
  fi
fi

cd "$PROJECT_DIR"

# Load .env
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

echo "=== git-hit-archive update started at $(date) ===" | tee "$LOG_FILE"

# Run full pipeline with --days=7 (fetch only last 7 days, not 365)
npx tsx src/pipeline.ts --days=7 2>&1 | tee -a "$LOG_FILE"

echo "=== Update completed at $(date) ===" | tee -a "$LOG_FILE"

# Cleanup old logs (keep last 30)
ls -t "$LOG_DIR"/update-*.log 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
