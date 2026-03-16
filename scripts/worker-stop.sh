#!/usr/bin/env bash
# Stop the host-based SWE Temporal worker.
#
# Usage: ./scripts/worker-stop.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$ROOT_DIR/.worker.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No worker PID file found. Worker may not be running."
  exit 0
fi

WORKER_PID=$(cat "$PID_FILE")

if kill -0 "$WORKER_PID" 2>/dev/null; then
  echo "Stopping worker (PID $WORKER_PID)..."
  kill "$WORKER_PID"
  # Wait for graceful shutdown
  for i in $(seq 1 10); do
    if ! kill -0 "$WORKER_PID" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if kill -0 "$WORKER_PID" 2>/dev/null; then
    echo "Worker didn't stop gracefully, forcing..."
    kill -9 "$WORKER_PID" 2>/dev/null || true
  fi
  echo "Worker stopped."
else
  echo "Worker (PID $WORKER_PID) is not running."
fi

rm -f "$PID_FILE"
