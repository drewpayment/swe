#!/usr/bin/env bash
# Start the SWE Temporal worker on the host (not in Docker).
# This is required for OpenCode integration — the worker spawns OpenCode
# processes that need access to the host filesystem.
#
# Usage: ./scripts/worker-start.sh
#        ./scripts/worker-start.sh --background

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$ROOT_DIR/.worker.pid"

# Check if already running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Worker already running (PID $OLD_PID). Use scripts/worker-stop.sh to stop it."
    exit 1
  else
    rm -f "$PID_FILE"
  fi
fi

# Ensure the binary is built
echo "Building swe-worker..."
cd "$ROOT_DIR"
go build -o "$ROOT_DIR/bin/swe-worker" ./cmd/worker/

# Environment — points to Docker services on localhost
export DATABASE_URL="${DATABASE_URL:-postgres://swe:swe@localhost:5432/swe?sslmode=disable}"
export TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-localhost:7233}"
export LITELLM_URL="${LITELLM_URL:-http://localhost:4000}"
export LITELLM_API_KEY="${LITELLM_API_KEY:-sk-swe-dev-key}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://localhost:8080}"

echo "Starting swe-worker on host..."
echo "  DATABASE_URL:     $DATABASE_URL"
echo "  TEMPORAL_ADDRESS: $TEMPORAL_ADDRESS"
echo "  LITELLM_URL:      $LITELLM_URL"
echo "  REDIS_URL:        $REDIS_URL"
echo "  API_INTERNAL_URL: $API_INTERNAL_URL"

if [ "${1:-}" = "--background" ]; then
  nohup "$ROOT_DIR/bin/swe-worker" > "$ROOT_DIR/logs/worker.log" 2>&1 &
  WORKER_PID=$!
  echo "$WORKER_PID" > "$PID_FILE"
  mkdir -p "$ROOT_DIR/logs"
  echo "Worker started in background (PID $WORKER_PID)"
  echo "Logs: $ROOT_DIR/logs/worker.log"
  echo "Stop:  ./scripts/worker-stop.sh"
else
  echo ""
  echo "Worker running in foreground (Ctrl+C to stop)..."
  echo ""
  exec "$ROOT_DIR/bin/swe-worker"
fi
