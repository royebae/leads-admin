#!/usr/bin/env bash
# Cron semanal: descarga Excel exactos de Dentalink + importa + arma conversiones (dry).
# NO envía mensajes ni conversiones a ads.
set -euo pipefail

ROOT="/home/hermes/leads-admin"
cd "$ROOT"
export LD_LIBRARY_PATH="${HOME}/.local/chrome-libs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"

# Load secrets if present (never commit these files)
if [[ -f "$HOME/.hermes/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HOME/.hermes/.env"
  set +a
fi
if [[ -f "$ROOT/.env.dentalink-web" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.dentalink-web"
  set +a
fi

LOG_DIR="$ROOT/data/imports/runs"
mkdir -p "$LOG_DIR" "$ROOT/data/imports/pagos"
LOG_FILE="$LOG_DIR/weekly-$(date -u +%Y%m%dT%H%M%SZ).log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== weekly dentalink excel job $(date -Is) ==="

if [[ -z "${DENTALINK_WEB_URL:-}" || -z "${DENTALINK_WEB_USER:-}" || -z "${DENTALINK_WEB_PASSWORD:-}" ]]; then
  echo "SKIP: faltan DENTALINK_WEB_URL / DENTALINK_WEB_USER / DENTALINK_WEB_PASSWORD"
  echo "Crea $ROOT/.env.dentalink-web con esas 3 variables."
  exit 2
fi

echo "1) Descargando Excel del portal..."
node scripts/download-dentalink-excel-reports.mjs

echo "2) Importando Excel a JSON..."
node scripts/import-dentalink-pagos-excel.mjs || true

echo "3) Refrescando pagos API (backup automatizable)..."
if [[ -n "${DENTALINK_TOKEN:-}${DENTALINK_API_TOKEN:-}" ]]; then
  DENTALINK_TOKEN="${DENTALINK_TOKEN:-$DENTALINK_API_TOKEN}" \
    node scripts/import-dentalink-pagos-api.mjs --delay=1500 || true
else
  echo "SKIP API pagos: no hay DENTALINK_TOKEN"
fi

echo "4) Build conversion events DRY (sin enviar a ads)..."
if [[ -n "${ELEVATOR_API_KEY:-}" && -n "${ELEVATOR_LOCATION_ID:-}" ]]; then
  node scripts/build-conversion-events.mjs --dry-run --limit=100 || true
else
  echo "SKIP conversions: falta Elevator env"
fi

echo "=== DONE $(date -Is) ==="
echo "Log: $LOG_FILE"
ls -lt data/imports/pagos | head -10
