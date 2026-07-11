/**
 * Descarga todos los pagos de Dentalink vía API (cursor) con retry y resume.
 *
 * Usage:
 *   DENTALINK_TOKEN=xxx node scripts/import-dentalink-pagos-api.mjs
 *   DENTALINK_TOKEN=xxx node scripts/import-dentalink-pagos-api.mjs --delay=1200 --resume
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_JSON = join(ROOT, 'public', 'pagos-data.json')
const OUT_JS = join(ROOT, 'src', 'data', 'pagos.js')
const CHECKPOINT = join(ROOT, 'public', 'pagos-checkpoint.json')

const TOKEN = process.env.DENTALINK_TOKEN || process.env.DENTALINK_API_TOKEN || ''
const BASE = process.env.DENTALINK_BASE_URL || 'https://api.dentalink.healthatom.com/api/v1'
const args = process.argv.slice(2)
const delay = Number((args.find(a => a.startsWith('--delay=')) || '--delay=1200').split('=')[1]) || 1200
const maxPages = Number((args.find(a => a.startsWith('--max-pages=')) || '--max-pages=0').split('=')[1]) || 0
const resume = args.includes('--resume') || true

if (!TOKEN) {
  console.error('Missing DENTALINK_TOKEN')
  process.exit(1)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Token ${TOKEN}`,
      Accept: 'application/json',
    },
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 8) throw new Error(`HTTP ${res.status} after retries: ${text.slice(0, 200)}`)
    const wait = Math.min(60000, 2000 * attempt * attempt)
    console.log(`\n  rate-limit/backoff ${res.status}, wait ${wait}ms (try ${attempt})`)
    await sleep(wait)
    return fetchJson(url, attempt + 1)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 200)}`)
  return json
}

function summarize(pagos) {
  const medios = {}
  const sucursales = {}
  let minDate = null
  let maxDate = null
  let sum = 0
  for (const p of pagos) {
    const m = p.medio_pago || 'desconocido'
    medios[m] = (medios[m] || 0) + 1
    const s = p.nombre_sucursal || 'sin-sucursal'
    sucursales[s] = (sucursales[s] || 0) + 1
    sum += Number(p.monto_pago) || 0
    const d = p.fecha_recepcion || (p.fecha_creacion || '').slice(0, 10)
    if (d) {
      if (!minDate || d < minDate) minDate = d
      if (!maxDate || d > maxDate) maxDate = d
    }
  }
  return { medios, sucursales, minDate, maxDate, sum }
}

function saveAll(pagos, page, nextUrl, done = false) {
  const byId = new Map()
  for (const p of pagos) byId.set(p.id, p)
  const unique = [...byId.values()].sort((a, b) => b.id - a.id)
  const { medios, sucursales, minDate, maxDate, sum } = summarize(unique)
  const out = {
    metadata: {
      source: 'dentalink-api',
      pulled_at: new Date().toISOString(),
      total_pagos: unique.length,
      total_monto: Math.round(sum * 100) / 100,
      date_min: minDate,
      date_max: maxDate,
      pages: page,
      complete: done,
      medios,
      sucursales,
    },
    pagos: unique,
  }
  mkdirSync(join(ROOT, 'public'), { recursive: true })
  mkdirSync(join(ROOT, 'src', 'data'), { recursive: true })
  writeFileSync(OUT_JSON, JSON.stringify(out, null, 2))
  writeFileSync(OUT_JS, `// Dentalink pagos API\n// ${out.metadata.pulled_at}\nexport default ${JSON.stringify(out)};\n`)
  writeFileSync(CHECKPOINT, JSON.stringify({
    next_url: nextUrl,
    page,
    count: unique.length,
    updated_at: out.metadata.pulled_at,
    complete: done,
  }, null, 2))
  return out
}

const pagos = []
let url = `${BASE}/pagos`
let page = 0

if (resume && existsSync(CHECKPOINT) && existsSync(OUT_JSON)) {
  try {
    const cp = JSON.parse(readFileSync(CHECKPOINT, 'utf-8'))
    const prev = JSON.parse(readFileSync(OUT_JSON, 'utf-8'))
    if (Array.isArray(prev.pagos) && prev.pagos.length) {
      pagos.push(...prev.pagos)
      page = cp.page || 0
      if (cp.next_url) url = cp.next_url
      else if (cp.complete) {
        console.log(`Ya completo: ${prev.pagos.length} pagos`)
        process.exit(0)
      }
      console.log(`Resume: ${pagos.length} pagos, page=${page}`)
    }
  } catch (e) {
    console.warn('Resume falló, reinicio', e.message)
  }
}

console.log('Descargando pagos Dentalink… delay', delay)

try {
  while (url) {
    page += 1
    const data = await fetchJson(url)
    const batch = data.data || []
    for (const p of batch) {
      pagos.push({
        id: p.id,
        id_paciente: p.id_paciente,
        nombre_paciente: p.nombre_paciente || p.nombre_pagador || '',
        monto_pago: Number(p.monto_pago) || 0,
        medio_pago: p.medio_pago || '',
        id_medio_pago: p.id_medio_pago ?? null,
        fecha_recepcion: p.fecha_recepcion || null,
        fecha_creacion: p.fecha_creacion || null,
        numero_referencia: p.numero_referencia || '',
        id_sucursal: p.id_sucursal ?? null,
        nombre_sucursal: p.nombre_sucursal || '',
        id_caja: p.id_caja ?? null,
        folio: p.folio || '',
        source: 'dentalink-api',
      })
    }
    const next = data.links?.next || null
    url = next || null
    process.stdout.write(`\r  page ${page} · pagos ${pagos.length}`)
    if (page % 10 === 0 || !url) saveAll(pagos, page, url, !url)
    if (maxPages && page >= maxPages) break
    if (url) await sleep(delay)
  }
} catch (err) {
  console.error('\nError, guardando checkpoint:', err.message)
  saveAll(pagos, page, url, false)
  process.exit(1)
}

const out = saveAll(pagos, page, null, true)
console.log('\n══════════════════════════════════')
console.log(`Pagos: ${out.metadata.total_pagos}`)
console.log(`Monto: $${out.metadata.total_monto.toLocaleString('es-MX')}`)
console.log(`Rango: ${out.metadata.date_min} → ${out.metadata.date_max}`)
console.log('Medios:', out.metadata.medios)
console.log('Sucursales:', out.metadata.sucursales)
console.log('→', OUT_JSON)
