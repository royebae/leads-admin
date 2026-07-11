#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/hermes/leads-admin"
cd "$ROOT"

MODE="${1:-status}"

api_refresh() {
  if [[ -z "${DENTALINK_TOKEN:-}" ]]; then
    echo "Missing DENTALINK_TOKEN"
    return 1
  fi
  echo "[api] Refreshing pagos via REST API..."
  node scripts/import-dentalink-pagos-api.mjs
}

report_status() {
  echo "[reports] Checking downloaded official report files..."
  find "$ROOT/data/imports/pagos" -maxdepth 1 -type f \
    \( -name 'pagos-globales-full.xlsx' -o -name 'detalle-full.xlsx' -o -name 'pagos-q*.xlsx' -o -name 'detalle-q*.xlsx' \) \
    | sort
}

hybrid_status() {
  echo "=== Dentalink Hybrid Pipeline Status ==="
  echo "REST API artifact:"
  if [[ -f "$ROOT/public/pagos-data.json" ]]; then
    python3 - <<'PY'
import json
p='/home/hermes/leads-admin/public/pagos-data.json'
with open(p,'r',encoding='utf-8') as f:
    data=json.load(f)
meta=data.get('metadata', {})
print(meta)
PY
  else
    echo "  missing public/pagos-data.json"
  fi
  echo
  echo "Official report files:"
  report_status || true
}

reconcile_note() {
  cat <<'EOF'
Reconciliation policy:
- REST API = fast operational dataset
- solicitudes_reportes = official full dataset
- If a field exists only in Excel full, Excel wins
- If comparing totals by unique payment ID, REST should approximately match official Excel
EOF
}

case "$MODE" in
  api-refresh)
    api_refresh
    ;;
  report-status)
    report_status
    ;;
  status)
    hybrid_status
    ;;
  reconcile-note)
    reconcile_note
    ;;
  *)
    echo "Usage: $0 [status|api-refresh|report-status|reconcile-note]"
    exit 1
    ;;
esac
