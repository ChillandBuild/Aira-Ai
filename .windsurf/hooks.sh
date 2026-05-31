#!/bin/bash
# Windsurf Cascade Hooks — Aira AI
# Runs after Cascade edits files

FILE="$1"
EVENT="$2"

if [[ "$EVENT" == "after_edit" ]]; then
  # TypeScript check
  if [[ "$FILE" == *.tsx || "$FILE" == *.ts ]]; then
    echo "[hook] TypeScript check..."
    cd "$(git rev-parse --show-toplevel)/frontend" && npx tsc --noEmit --pretty false 2>&1 | head -20
  fi

  # Python syntax check
  if [[ "$FILE" == *.py ]]; then
    echo "[hook] Python syntax check..."
    python -m py_compile "$FILE" && echo "syntax OK: $FILE"
  fi

  # Tenant audit on routes
  if [[ "$FILE" == */routes/*.py ]]; then
    if ! grep -q "tenant_id" "$FILE"; then
      echo "⚠ TENANT AUDIT: $FILE has no tenant_id — verify isolation"
    fi
  fi
fi
