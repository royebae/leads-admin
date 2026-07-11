/**
 * Importa reportes Excel de Dentalink (Pagos globales / Pagos y acciones).
 *
 * Usage:
 *   node scripts/import-dentalink-pagos-excel.mjs
 *   node scripts/import-dentalink-pagos-excel.mjs --file=data/imports/pagos/foo.xlsx
 *
 * Drop files in: data/imports/pagos/
 * Requires: xlsx package (installed on first run if missing via dynamic import check)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const IMPORT_DIR = join(ROOT, 'data', 'imports', 'pagos')
const OUT_JSON = join(ROOT, 'public', 'pagos-excel-data.json')
const MERGED_JSON = join(ROOT, 'public', 'pagos-merged.json')
const API_JSON = join(ROOT, 'public', 'pagos-data.json')

mkdirSync(IMPORT_DIR, { recursive: true })

const require = createRequire(import.meta.url)
let XLSX
try {
  XLSX = require('xlsx')
} catch {
  console.error('Falta paquete xlsx. Instala con: npm i xlsx')
  process.exit(1)
}

const args = process.argv.slice(2)
const fileArg = args.find(a => a.startsWith('--file='))?.split('=')[1]

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const FIELD_ALIASES = {
  id_pago: ['id pago', 'id del pago', 'pago id', 'folio pago', 'nro pago', 'numero pago', 'id'],
  id_paciente: ['id paciente', 'id del paciente', 'paciente id', 'nro ficha', 'ficha', 'id ficha'],
  nombre_paciente: ['paciente', 'nombre paciente', 'nombre del paciente', 'nombre', 'cliente'],
  monto_pago: ['monto', 'monto pago', 'total', 'abono', 'importe', 'valor', 'pago', 'monto pagado'],
  medio_pago: ['medio', 'medio pago', 'forma de pago', 'metodo', 'metodo de pago', 'tipo pago'],
  fecha_recepcion: ['fecha', 'fecha pago', 'fecha de pago', 'fecha recepcion', 'fecha recepción', 'dia'],
  sucursal: ['sucursal', 'clinica', 'sede', 'nombre sucursal'],
  dentista: ['dentista', 'especialista', 'profesional', 'doctor', 'odontologo'],
  referencia: ['referencia', 'numero referencia', 'nro referencia', 'folio', 'autorizacion'],
  accion: ['accion', 'accion de servicio', 'prestacion', 'tratamiento', 'servicio', 'detalle', 'concepto'],
  tratamiento: ['plan tratamiento', 'tratamiento', 'plan'],
}

function mapHeader(header) {
  const n = norm(header)
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const a of aliases) {
      if (n === a || n.includes(a)) return field
    }
  }
  return null
}

function parseMoney(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')
  // handle 1,234.56 vs 1.234,56 roughly
  const cleaned = String(v).replace(/[^\d,.\-]/g, '')
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0
    }
    return Number(cleaned.replace(/,/g, '')) || 0
  }
  if (cleaned.includes(',')) return Number(cleaned.replace(',', '.')) || 0
  return Number(cleaned) || 0
}

function parseDate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10)
  if (typeof v === 'number' && XLSX.SSF) {
    try {
      const d = XLSX.SSF.parse_date_code(v)
      if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    } catch { /* ignore */ }
  }
  const s = String(v).trim()
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/) || s.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (m) {
    if (m[0].includes('-') && m[1].length === 4) return `${m[1]}-${m[2]}-${m[3]}`
    return `${m[3]}-${m[2]}-${m[1]}`
  }
  return s.slice(0, 10)
}

function sheetToRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
}

function parseFile(path) {
  const wb = XLSX.readFile(path, { cellDates: true })
  const rowsOut = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    const rows = sheetToRows(sheet)
    if (!rows.length) continue
    const headers = Object.keys(rows[0])
    const mapping = {}
    for (const h of headers) {
      const field = mapHeader(h)
      if (field) mapping[h] = field
    }
    for (const row of rows) {
      const obj = {
        source_file: basename(path),
        source_sheet: name,
        source: 'dentalink-excel',
      }
      for (const [h, field] of Object.entries(mapping)) {
        obj[field] = row[h]
      }
      if (obj.monto_pago != null) obj.monto_pago = parseMoney(obj.monto_pago)
      if (obj.fecha_recepcion != null) obj.fecha_recepcion = parseDate(obj.fecha_recepcion)
      if (obj.id_paciente != null && obj.id_paciente !== '') {
        const n = Number(String(obj.id_paciente).replace(/\D/g, ''))
        obj.id_paciente = Number.isFinite(n) && n > 0 ? n : obj.id_paciente
      }
      if (obj.id_pago != null && obj.id_pago !== '') {
        const n = Number(String(obj.id_pago).replace(/\D/g, ''))
        if (Number.isFinite(n) && n > 0) obj.id = n
      }
      // keep row if has amount or patient
      if ((obj.monto_pago && obj.monto_pago !== 0) || obj.nombre_paciente || obj.id_paciente) {
        rowsOut.push(obj)
      }
    }
  }
  return rowsOut
}

const files = fileArg
  ? [fileArg.startsWith('/') ? fileArg : join(ROOT, fileArg)]
  : readdirSync(IMPORT_DIR)
      .filter(f => ['.xlsx', '.xls', '.csv'].includes(extname(f).toLowerCase()))
      .map(f => join(IMPORT_DIR, f))

if (!files.length) {
  console.log(`No hay Excel en ${IMPORT_DIR}`)
  console.log('Exporta desde Dentalink → Reportes → Tratamientos y Pagos:')
  console.log('  1) Pagos y acciones de servicio (todas sucursales / especialistas)')
  console.log('  2) Pagos globales')
  console.log('Y déjalos en esa carpeta.')
  process.exit(0)
}

const all = []
for (const f of files) {
  if (!existsSync(f)) {
    console.error('No existe', f)
    continue
  }
  console.log('Leyendo', f)
  const rows = parseFile(f)
  console.log('  filas', rows.length)
  all.push(...rows)
}

const out = {
  metadata: {
    imported_at: new Date().toISOString(),
    files: files.map(f => basename(f)),
    total_rows: all.length,
    total_monto: Math.round(all.reduce((s, r) => s + (Number(r.monto_pago) || 0), 0) * 100) / 100,
  },
  pagos: all,
}
writeFileSync(OUT_JSON, JSON.stringify(out, null, 2))
console.log('→', OUT_JSON)

// Merge with API if present
if (existsSync(API_JSON)) {
  const api = JSON.parse(readFileSync(API_JSON, 'utf-8'))
  const byKey = new Map()
  for (const p of api.pagos || []) {
    byKey.set(`api-${p.id}`, { ...p, source: 'dentalink-api' })
  }
  for (const p of all) {
    const key = p.id ? `api-${p.id}` : `xl-${p.source_file}-${p.nombre_paciente}-${p.fecha_recepcion}-${p.monto_pago}-${p.referencia || ''}`
    if (byKey.has(key) && p.id) {
      byKey.set(key, { ...byKey.get(key), ...p, source: 'api+excel' })
    } else if (!p.id) {
      byKey.set(key, p)
    } else {
      byKey.set(key, p)
    }
  }
  const merged = {
    metadata: {
      merged_at: new Date().toISOString(),
      total: byKey.size,
      from_api: (api.pagos || []).length,
      from_excel: all.length,
    },
    pagos: [...byKey.values()],
  }
  writeFileSync(MERGED_JSON, JSON.stringify(merged, null, 2))
  console.log('Merged →', MERGED_JSON, 'total', merged.metadata.total)
}
