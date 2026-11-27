#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

# Check the optional Python test dependency before running any tests.
if ! python3 -c 'import yaml' >/dev/null 2>&1; then
  echo "OGF fixture tests need PyYAML." >&2
  echo "Install it from the project root with:" >&2
  echo "  python3 -m pip install -r requirements-test.txt" >&2
  exit 2
fi

node "$SCRIPT_DIR/test-regressions.js"
python3 "$SCRIPT_DIR/test-fixtures.py"
