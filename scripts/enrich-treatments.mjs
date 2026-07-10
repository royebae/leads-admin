/**
 * Enriquece leads-data.json con tratamientos/planes de Dentalink.
 * GET /api/v1/tratamientos/ con cursor pagination.
 *
 * Usage:
 *   DENTALINK_TOKEN=xxx node scripts/enrich-treatments.mjs
 *   DENTALINK_TOKEN=xxx node scripts/enrich-treatments.mjs --delay=800
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LEADS_PATH = join(ROOT, 'public', 'leads-data.json')
const SRC_LEADS_PATH = join(ROOT, 'src', 'data', 'leads.js')
const BASE = 'https://api.dentalink.healthatom.com/api/v1'
const TOKEN = process.env.DENTALINK_TOKEN || process.env.DENTALINK_API_TOKEN || ''

const args = process.argv.slice(2)
const delayMs = Number((args.find(a => a.startsWith('--delay=')) || '--delay=900').split('=')[1]) || 900

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
  if (res.status === 429) {
    const wait = Math.min(15000, 2000 * attempt)
    console.log(`  ⏳ Rate limited, esperando ${wait / 1000}s...`)
    await sleep(wait)
    return fetchJson(url, attempt + 1)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

function cleanName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ')
}

function summarizePatientTreatments(rows) {
  const sorted = [...rows].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
  const names = []
  const seen = new Set()
  for (const r of sorted) {
    const n = cleanName(r.nombre)
    if (!n || seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    names.push(n)
  }

  const totalBudget = rows.reduce((s, r) => s + (Number(r.total) || 0), 0)
  const totalPaid = rows.reduce((s, r) => s + (Number(r.abonado) || 0), 0)
  const totalDebt = rows.reduce((s, r) => s + (Number(r.deuda) || 0), 0)
  const open = rows.filter(r => !r.finalizado).length
  const closed = rows.filter(r => r.finalizado).length
  const latest = sorted[0] || null

  // Prefer a "real" procedure name over generic plans
  const preferred =
    names.find(n => !/^nuevo plan de tratamiento$/i.test(n)) ||
    names[0] ||
    null

  return {
    tratamiento_principal: preferred,
    tratamientos: names.slice(0, 8),
    tratamientos_count: rows.length,
    tratamientos_abiertos: open,
    tratamientos_cerrados: closed,
    presupuesto_total: totalBudget,
    abonado_total: totalPaid,
    deuda_total: totalDebt,
    ultimo_tratamiento_fecha: latest?.fecha || null,
    ultima_sucursal_tx: latest?.nombre_sucursal || null,
    ultimo_dentista: latest?.nombre_dentista || null,
  }
}

async function fetchAllTreatments() {
  const byPatient = new Map()
  let url = `${BASE}/tratamientos/`
  let pages = 0
  let total = 0

  console.log('📡 Descargando tratamientos de Dentalink...')

  while (url) {
    pages += 1
    const data = await fetchJson(url)
    const items = Array.isArray(data.data) ? data.data : []
    total += items.length

    for (const t of items) {
      const pid = Number(t.id_paciente)
      if (!Number.isFinite(pid) || pid <= 0) continue
      if (!byPatient.has(pid)) byPatient.set(pid, [])
      byPatient.get(pid).push({
        id: t.id,
        nombre: cleanName(t.nombre),
        fecha: t.fecha || null,
        finalizado: Number(t.finalizado) === 1,
        bloqueado: Number(t.bloqueado) === 1,
        total: Number(t.total) || 0,
        abonado: Number(t.abonado) || 0,
        deuda: Number(t.deuda) || 0,
        total_realizado: Number(t.total_realizado) || 0,
        nombre_sucursal: cleanName(t.nombre_sucursal),
        nombre_dentista: cleanName(t.nombre_dentista),
      })
    }

    const next = data.links && typeof data.links === 'object' ? data.links.next : null
    process.stdout.write(`\r  📄 página ${pages} | tratamientos ${total} | pacientes ${byPatient.size}`)
    if (!next) break
    url = next
    await sleep(delayMs)
  }

  console.log(`\n✅ Listo: ${total} tratamientos, ${byPatient.size} pacientes con plan`)
  return byPatient
}

function writeSrcModule(data) {
  const body = `// Generated from Dentalink scan + treatments\n// ${data.metadata?.treatments_enriched_at || new Date().toISOString()}\nexport default ${JSON.stringify(data)};\n`
  writeFileSync(SRC_LEADS_PATH, body)
}

async function main() {
  const raw = readFileSync(LEADS_PATH, 'utf-8')
  const data = JSON.parse(raw)
  const leads = data.leads || []
  console.log(`📦 Leads actuales: ${leads.length}`)

  const byPatient = await fetchAllTreatments()

  let withTx = 0
  let withNamed = 0
  const nameCounts = new Map()

  for (const lead of leads) {
    const rows = byPatient.get(Number(lead.id)) || []
    if (!rows.length) {
      lead.tratamiento_principal = lead.tratamiento_principal || null
      lead.tratamientos = lead.tratamientos || []
      lead.tratamientos_count = 0
      lead.presupuesto_total = 0
      lead.abonado_total = 0
      lead.deuda_total = 0
      continue
    }

    const summary = summarizePatientTreatments(rows)
    Object.assign(lead, summary)
    withTx += 1
    if (summary.tratamiento_principal) {
      withNamed += 1
      const key = summary.tratamiento_principal
      nameCounts.set(key, (nameCounts.get(key) || 0) + 1)
    }
  }

  data.metadata = {
    ...data.metadata,
    treatments_enriched_at: new Date().toISOString(),
    patients_with_treatments: withTx,
    patients_with_named_treatment: withNamed,
  }

  const topTreatments = [...nameCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }))

  data.treatment_summary = {
    patients_with_treatments: withTx,
    patients_without_treatments: leads.length - withTx,
    top_treatments: topTreatments,
  }

  writeFileSync(LEADS_PATH, JSON.stringify(data, null, 2))
  writeSrcModule(data)

  console.log('═══════════════════════════════════════════')
  console.log('  RESULTADOS TRATAMIENTOS')
  console.log('═══════════════════════════════════════════')
  console.log(`  Pacientes con tratamiento: ${withTx}`)
  console.log(`  Con nombre de procedimiento: ${withNamed}`)
  console.log(`  Sin tratamiento en Dentalink: ${leads.length - withTx}`)
  console.log('  Top tratamientos:')
  for (const t of topTreatments.slice(0, 15)) {
    console.log(`    ${t.count.toString().padStart(4)}  ${t.name}`)
  }
  console.log(`  ✅ Guardado: ${LEADS_PATH}`)
  console.log(`  ✅ Guardado: ${SRC_LEADS_PATH}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
