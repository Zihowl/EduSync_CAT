#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CREDENTIALS_FILE="$ROOT_DIR/.genesis-super-admin.json"

if [[ ! -f "$CREDENTIALS_FILE" ]]; then
  echo "[show-genesis-credentials] Credentials file not found: $CREDENTIALS_FILE"
  echo "[show-genesis-credentials] It is generated only when Genesis Protocol creates the first user."
  exit 1
fi

GENESIS_FILE="$CREDENTIALS_FILE" python3 <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ['GENESIS_FILE'])
data = json.loads(path.read_text())

print('SUPER ADMIN TEMPORARY CREDENTIALS')
print(f"Email: {data.get('email','')}")
print(f"Password: {data.get('password','')}")
print(f"GeneratedAtUtc: {data.get('generatedAtUtc','')}")
PY
