#!/usr/bin/env bash
# Cron semanal Opción A: descarga Excel de Dentalink con cookie guardada.
# Si la sesión expiró, cron reporta al usuario para que pegue nuevo PHPSESSID.
set -euo pipefail

ROOT="/home/hermes/leads-admin"
cd "$ROOT"
export LD_LIBRARY_PATH="${HOME}/.local/chrome-libs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"

LOG_DIR="$ROOT/data/imports/runs"
PAGOS_DIR="$ROOT/data/imports/pagos"
STATE_DIR="$ROOT/data/imports/.browser-state"
mkdir -p "$LOG_DIR" "$PAGOS_DIR" "$STATE_DIR"
LOG_FILE="$LOG_DIR/weekly-$(date -u +%Y%m%dT%H%M%SZ).log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== weekly dentalink excel job $(date -Is) ==="

SESSION_OK=false

# Strategy 1: Use Playwright storage state (has cookies from last login)
if [[ -f "$STATE_DIR/state.json" ]]; then
  echo "1a) Intentando con storageState guardado..."
  node -e "
    const { chromium } = require('playwright');
    (async () => {
      const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
      const ctx = await b.newContext({ storageState: '$STATE_DIR/state.json' });
      const p = await ctx.newPage();
      await p.goto('https://drdiente.dentalink.cl/solicitudes_reportes', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(2000);
      const url = p.url();
      const body = await p.locator('body').innerText().catch(() => '');
      if (url.includes('sessions/login') || /Bienvenido[\\s\\S]*Usuario[\\s\\S]*Contraseña/i.test(body)) {
        console.log('SESSION_EXPIRED');
      } else {
        // Has historial de solicitudes - download via catalog
        const catalog = await p.evaluate(() => window.dataReportes);
        const reports = (catalog?.reportes || []).filter(r => r.info?.id && (r.name === 'Pagos pacientes' || r.name === 'Pagos pacientes, detalle por acción'));
        for (const r of reports) {
          const resp = await p.evaluate(async (id) => {
            const res = await fetch('/solicitudes_reportes/download/' + id + '/0', { credentials: 'same-origin' });
            if (!res.ok) return null;
            const json = await res.json();
            if (!json.download) return null;
            return json.download; // return S3 URL to Node.js
          }, r.info.id);
          if (resp) {
            // Download S3 URL from Node.js (no CORS)
            const https = await import('https');
            const fs = await import('fs');
            const fname = r.name.includes('detalle') ? 'pagos-acciones-servicio.xlsx' : 'pagos-globales.xlsx';
            const dest = '$PAGOS_DIR/' + fname;
            await new Promise((resolve, reject) => {
              https.default.get(resp, (res) => {
                if (res.statusCode >= 300 && res.headers.location) {
                  https.default.get(res.headers.location, r2 => {
                    const chunks = [];
                    r2.on('data', c => chunks.push(c));
                    r2.on('end', () => {
                      const buf = Buffer.concat(chunks);
                      fs.writeFileSync(dest, buf);
                      console.log('DESCARGADO', fname, buf.length, 'bytes');
                      // Convert to JSON
                      const xlsx = require('xlsx');
                      const wb = xlsx.readFile(dest);
                      const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
                      fs.writeFileSync(dest.replace('.xlsx', '.json'), JSON.stringify(data, null, 2));
                      console.log('CONVERTIDO', fname.replace('.xlsx', '.json'), data.length, 'rows');
                      resolve();
                    });
                  }).on('error', reject);
                } else {
                  const chunks = [];
                  res.on('data', c => chunks.push(c));
                  res.on('end', () => {
                    const buf = Buffer.concat(chunks);
                    fs.writeFileSync(dest, buf);
                    console.log('DESCARGADO', fname, buf.length, 'bytes');
                    const xlsx = require('xlsx');
                    const wb = xlsx.readFile(dest);
                    const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
                    fs.writeFileSync(dest.replace('.xlsx', '.json'), JSON.stringify(data, null, 2));
                    console.log('CONVERTIDO', fname.replace('.xlsx', '.json'), data.length, 'rows');
                    resolve();
                  });
                }
              }).on('error', reject);
            });
          }
        }
        console.log('SESSION_OK');
      }
      await b.close();
    })().catch(e => { console.error('ERR', e.message.slice(0,200)); process.exit(1); });
  " 2>&1

  if grep -q 'SESSION_OK' "$LOG_FILE" 2>/dev/null; then
    SESSION_OK=true
  fi
fi

# Strategy 2: Try saved PHPSESSID from file
if [[ "$SESSION_OK" != "true" && -f "$STATE_DIR/phpsessid.txt" ]]; then
  echo "1b) storageState expirado. Intentando con PHPSESSID guardado..."
  PHPSESSID=$(cat "$STATE_DIR/phpsessid.txt" 2>/dev/null || true)
  if [[ -n "$PHPSESSID" ]]; then
    # Quick test: does curl with this cookie work?
    curl -s -o /dev/null -w "%{http_code}" --cookie "PHPSESSID=$PHPSESSID" \
      "https://drdiente.dentalink.cl/solicitudes_reportes" | grep -q '200' && {
      echo "PHPSESSID seems valid, trying Playwright download..."
      node "data/imports/scripts/dentalink-session-from-cookie.mjs" --phpsessid="$PHPSESSID" 2>&1 && SESSION_OK=true
    } || {
      echo "PHPSESSID también expiró."
    }
  fi
fi

if [[ "$SESSION_OK" != "true" ]]; then
  echo "=============================================="
  echo "⚠️  SESIÓN DENTALINK EXPIRADA"
  echo "=============================================="
  echo ""
  echo "El PHPSESSID de Dentalink expiró y no pude"
  echo "descargar los Excel automáticamente."
  echo ""
  echo "Para reactivar:"
  echo "1. Entra a https://drdiente.dentalink.cl"
  echo "2. Resuelve captcha e ingresa"
  echo "3. Copia el PHPSESSID (F12 → Application → Cookies)"
  echo "4. Pégamelo aquí en Telegram"
  echo ""
  echo "Los reportes viejos siguen en data/imports/pagos/"
  echo "hasta que tengamos uno fresco."
  echo "=============================================="
  # Don't exit - still merge existing data
fi

echo ""
echo "2) Cruzando pagos Excel con leads..."
if [[ -f "$PAGOS_DIR/pagos-globales.json" ]]; then
  node scripts/merge-pagos-excel.mjs || echo "merge warnings"
else
  echo "No hay JSON de pagos. Convertir Excel si existe..."
  if [[ -f "$PAGOS_DIR/pagos-globales.xlsx" ]] && [[ -f "$PAGOS_DIR/pagos-acciones-servicio.xlsx" ]]; then
    node -e "
      const xlsx = require('xlsx');
      const fs = require('fs');
      const dir = '$PAGOS_DIR';
      for (const f of ['pagos-globales.xlsx', 'pagos-acciones-servicio.xlsx']) {
        const wb = xlsx.readFile(dir + '/' + f);
        const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        fs.writeFileSync(dir + '/' + f.replace('.xlsx', '.json'), JSON.stringify(data, null, 2));
        console.log(f, '->', data.length, 'rows');
      }
    " && node scripts/merge-pagos-excel.mjs || echo "merge skip"
  else
    echo "Sin Excel para importar. Usando datos previos."
  fi
fi

echo ""
echo "2b) Enriching leads with API payment history..."
node scripts/enrich-leads-payments.mjs 2>&1 || echo "enrich skip"
node scripts/prioritize-leads.mjs 2>&1 || echo "prioritize skip"

echo ""
echo "3) Build conversion events DRY..."
if [[ -f "$ROOT/.env.dentalink-web" ]]; then
  # try using stored elevator key
  node scripts/build-conversion-events.mjs --dry-run --limit=100 2>&1 || echo "conversion skip"
else
  echo "Conversion skip (no api keys loaded)"
fi

echo ""
echo "=== DONE $(date -Is) ==="
echo "Log: $LOG_FILE"
ls -lh "$PAGOS_DIR/"*.xlsx 2>/dev/null || echo "No hay xlsx files"
