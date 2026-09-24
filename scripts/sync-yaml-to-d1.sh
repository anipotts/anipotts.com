#!/bin/bash
# Retired on 2026-09-22. This synced ~/Business/data/*.yaml into D1 through
# the ingest Worker's "business" category. The Worker no longer accepts
# business rows and nothing reads them, so the script exits before it reads a
# file or sends a request. The original sync body stays below for reference.

echo "sync-yaml-to-d1 is retired: the ingest Worker no longer accepts business rows." >&2
exit 1

# Syncs ~/Business/data/*.yaml to D1 via the ingest Worker.
# Run from Mac Mini: ./scripts/sync-yaml-to-d1.sh
# Requires: yq (https://github.com/mikefarah/yq), curl, INGEST_KEY env var
#
# DO NOT install as a cron. This is a manual/on-demand script.

set -euo pipefail

INGEST_URL="${INGEST_URL:-https://anipotts-ingest.anipotts.workers.dev}"
YAML_DIR="${YAML_DIR:-$HOME/Business/data}"
INGEST_KEY="${INGEST_KEY:?Set INGEST_KEY env var (same as MAC_MINI_INGEST_KEY on the Worker)}"

if ! command -v yq &> /dev/null; then
  echo "Error: yq is required. Install with: brew install yq"
  exit 1
fi

sync_file() {
  local file="$1"
  local basename
  basename=$(basename "$file" .yaml)
  local json

  json=$(yq -o=json '.' "$file")

  local payload
  payload=$(cat <<EOF
{
  "category": "business",
  "data": {
    "key": "$basename",
    "value": $(echo "$json" | jq -c '.' 2>/dev/null || echo "$json"),
    "source_file": "$basename.yaml"
  }
}
EOF
)

  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$INGEST_URL" \
    -H "Content-Type: application/json" \
    -H "X-Ingest-Key: $INGEST_KEY" \
    -d "$payload")

  if [ "$status" = "200" ]; then
    echo "  ✓ $basename.yaml -> D1"
  else
    echo "  ✗ $basename.yaml (HTTP $status)"
    return 1
  fi
}

echo "Syncing YAML to D1..."
echo "  Source: $YAML_DIR"
echo "  Target: $INGEST_URL"
echo ""

errors=0
for file in "$YAML_DIR"/*.yaml; do
  [ -f "$file" ] || continue
  sync_file "$file" || ((errors++))
done

echo ""
if [ "$errors" -gt 0 ]; then
  echo "Done with $errors error(s)."
  exit 1
else
  echo "All files synced."
fi
