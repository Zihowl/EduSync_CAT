#!/usr/bin/env bash
set -euo pipefail

# Always run from backend root regardless of current directory.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_PORT="${APP_PORT:-3000}"

# If the port is already in use by another backend process, stop it first.
if command -v lsof >/dev/null 2>&1; then
  mapfile -t pids < <(lsof -t -iTCP:"$APP_PORT" -sTCP:LISTEN 2>/dev/null | sort -u)
  if [ "${#pids[@]}" -gt 0 ]; then
    echo "[dev-up] Port $APP_PORT is in use. Stopping existing process(es): ${pids[*]}"
    kill "${pids[@]}" 2>/dev/null || true
    sleep 1

    mapfile -t stubborn < <(lsof -t -iTCP:"$APP_PORT" -sTCP:LISTEN 2>/dev/null | sort -u)
    if [ "${#stubborn[@]}" -gt 0 ]; then
      echo "[dev-up] Force stopping stubborn process(es): ${stubborn[*]}"
      kill -9 "${stubborn[@]}" 2>/dev/null || true
    fi
  fi
fi

echo "[dev-up] Starting backend on port $APP_PORT"
exec cargo run
