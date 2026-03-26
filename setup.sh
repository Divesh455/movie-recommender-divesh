#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ ! -d ".venv" ]; then
    if command -v python3 >/dev/null 2>&1; then
        python3 -m venv .venv
    elif command -v python >/dev/null 2>&1; then
        python -m venv .venv
    else
        echo "Python is required to create the virtual environment." >&2
        exit 1
    fi
fi

if [ -x ".venv/bin/python" ]; then
    VENV_PYTHON=".venv/bin/python"
elif [ -x ".venv/Scripts/python.exe" ]; then
    VENV_PYTHON=".venv/Scripts/python.exe"
else
    echo "Could not find the virtualenv Python executable." >&2
    exit 1
fi

"$VENV_PYTHON" -m pip install --upgrade pip
"$VENV_PYTHON" -m pip install -r requirements.txt

cat <<'EOF'
Setup complete.

Run the app with:
  .venv/Scripts/python.exe -m uvicorn app.app:app --reload

If you are on macOS/Linux, use:
  .venv/bin/python -m uvicorn app.app:app --reload
EOF
