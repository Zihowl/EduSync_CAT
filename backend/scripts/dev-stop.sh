#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${APP_PORT:-3000}"

if ! command -v lsof >/dev/null 2>&1; then
  echo "[dev-stop] lsof is required to detect processes by port."
  exit 1
fi

mapfile -t pids < <(lsof -t -iTCP:"$APP_PORT" -sTCP:LISTEN 2>/dev/null | sort -u)

if [ "${#pids[@]}" -eq 0 ]; then
  echo "[dev-stop] No process listening on port $APP_PORT"
  exit 0
fi

echo "[dev-stop] Stopping process(es) on port $APP_PORT: ${pids[*]}"
kill "${pids[@]}" 2>/dev/null || true
sleep 1

mapfile -t stubborn < <(lsof -t -iTCP:"$APP_PORT" -sTCP:LISTEN 2>/dev/null | sort -u)
if [ "${#stubborn[@]}" -gt 0 ]; then
  echo "[dev-stop] Force stopping stubborn process(es): ${stubborn[*]}"
  kill -9 "${stubborn[@]}" 2>/dev/null || true
fi

echo "[dev-stop] Done"
