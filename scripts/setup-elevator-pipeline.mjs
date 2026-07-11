/**
 * Fase 4: crea oportunidades en pipeline "Reactivacion Dentalink"
 * SOLO estructura. NO envía mensajes, NO mueve a stages de contacto.
 *
 * Usage:
 *   ELEVATOR_API_KEY=... ELEVATOR_LOCATION_ID=... \
 *   node scripts/setup-elevator-pipeline.mjs --limit=100
 *
 * Flags:
 *   --dry-run
 *   --limit=N
 *   --stage=nuevo|listo  (default: nuevo)  NEVER contactado+
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LEADS_PATH = join(ROOT, 'public', 'leads-data.json')
const LOG_PATH = join(ROOT, 'public', 'elevator-pipeline-log.json')
const CONFIG_PATH = join(ROOT, 'public', 'elevator-pipeline-config.json')

const API = process.env.ELEVATOR_BASE_URL || 'https://services.leadconnectorhq.com'
const KEY = process.env.ELEVATOR_API_KEY || process.env.GHL_API_KEY || ''
const LOCATION_ID = process.env.ELEVATOR_LOCATION_ID || ''
const VERSION = process.env.ELEVATOR_API_VERSION || '2021-07-28'

// Pipeline created via API (safe: dedicated, no workflows attached)
const PIPELINE = {
  id: process.env.ELEVATOR_REACTIVATION_PIPELINE_ID || 'iDsSx2heXECuWVeKXnLK',
  name: 'Reactivacion Dentalink',
  stages: {
    nuevo: 'eeb17e40-958b-417a-b0eb-70f9a644f9bf',
    listo: '11abaf09-46d2-4b3d-83fa-ef5321c9928a',
    contactado: 'a46d7bf6-e04f-4c14-a9dd-9d851690716e',
    respondio: '8e4c888f-01a5-4971-abe3-cbaf0d511f4b',
    cita: 'a68f2613-a025-4e0e-b448-2aadf3c2ea2c',
    asistio: '56babff5-e4d6-4d84-90e8-ccc6052f2aaf',
    convertido: '7a2fcbfa-9adf-49c1-99e9-8b40851e2822',
    perdido: '20a53f72-f623-4239-882c-56f070b50cf9',
  },
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limit = Number((args.find(a => a.startsWith('--limit=')) || '--limit=100').split('=')[1]) || 100
const stageKey = (args.find(a => a.startsWith('--stage=')) || '--stage=nuevo').split('=')[1]
const SAFE_STAGES = new Set(['nuevo', 'listo'])

if (!KEY || !LOCATION_ID) {
  console.error('Missing ELEVATOR_API_KEY or ELEVATOR_LOCATION_ID')
  process.exit(1)
}
if (!SAFE_STAGES.has(stageKey)) {
  console.error('Refusing stage', stageKey, '- only nuevo|listo allowed in this script (no contact stages)')
  process.exit(1)
}

const stageId = PIPELINE.stages[stageKey]

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function isJunk(name) {
  return /prueba|test|borrar|demo|asdf|xxx|hubspot|paciente hubspot|^ejemplo\b|ejemplo ejemplo/i.test(String(name || ''))
}

async function request(method, path, body, query) {
  const url = new URL(path, API)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== '') url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      Version: VERSION,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  if (!res.ok) {
    const err = new Error(`Elevator ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
    err.status = res.status
    err.body = json
    throw err
  }
  return json
}

async function findExistingOpp(contactId) {
  // Search opportunities for this contact in our pipeline
  try {
    const data = await request('POST', '/opportunities/search', {
      locationId: LOCATION_ID,
      pipelineId: PIPELINE.id,
      contactId,
      limit: 20,
      status: 'open',
    })
    const ops = data?.opportunities || []
    return ops.find(o => o.contactId === contactId || o.contact?.id === contactId) || null
  } catch {
    return null
  }
}

async function createOpp(lead) {
  const contactId = lead.elevator_id
  if (!contactId) throw new Error('missing elevator_id')

  const existing = await findExistingOpp(contactId)
  if (existing?.id) {
    return { status: 'exists', opportunityId: existing.id, stageId: existing.pipelineStageId }
  }

  const monetary = Math.round(Number(lead.presupuesto_total) || 0)
  const name = `Reactivacion - ${lead.nombre}`.slice(0, 120)
  const payload = {
    locationId: LOCATION_ID,
    pipelineId: PIPELINE.id,
    pipelineStageId: stageId,
    contactId,
    name,
    status: 'open',
    monetaryValue: monetary,
    source: 'Dentalink Reactivation',
  }

  if (dryRun) return { status: 'would-create', opportunityId: null, stageId, payload }

  try {
    const created = await request('POST', '/opportunities/', payload)
    const opp = created?.opportunity || created
    return { status: 'created', opportunityId: opp?.id || null, stageId }
  } catch (err) {
    const existingId = err.body?.meta?.existingId || err.body?.meta?.opportunityId
    if (err.status === 400 && existingId) {
      return { status: 'exists', opportunityId: existingId, stageId }
    }
    // parse existing id from message blob if present
    const m = String(err.message || '').match(/existingI[^"]*"([A-Za-z0-9]+)"/)
    if (err.status === 400 && m) {
      return { status: 'exists', opportunityId: m[1], stageId }
    }
    throw err
  }
}

// Persist config for dashboard/docs
writeFileSync(CONFIG_PATH, JSON.stringify({
  updated_at: new Date().toISOString(),
  location_id: LOCATION_ID,
  pipeline: PIPELINE,
  safety: {
    no_messages: true,
    allowed_auto_stages: ['nuevo', 'listo'],
    note: 'No workflows should be attached to this pipeline until campaigns are approved.',
  },
}, null, 2))

const data = JSON.parse(readFileSync(LEADS_PATH, 'utf-8'))
const leads = (data.leads || [])
  .filter(l => l.elevator_id)
  .filter(l => !isJunk(l.nombre))
  .filter(l => l.elevator_sync_status !== 'skipped-junk')
  .sort((a, b) => (b.reactivation_score || 0) - (a.reactivation_score || 0))

// Deduplicate by elevator contact id (keep highest score)
const seen = new Set()
const unique = []
for (const l of leads) {
  if (seen.has(l.elevator_id)) continue
  seen.add(l.elevator_id)
  unique.push(l)
}

const pool = unique.filter(l => !l.elevator_opportunity_id).slice(0, limit)

console.log(`${dryRun ? 'DRY-RUN' : 'PIPELINE LOAD'} · stage=${stageKey} · candidates=${pool.length}`)
console.log(`Pipeline: ${PIPELINE.name} (${PIPELINE.id})`)
console.log('NO MESSAGES · structure only')

const results = []
for (const lead of pool) {
  process.stdout.write(`→ ${lead.nombre} ... `)
  try {
    const res = await createOpp(lead)
    console.log(res.status, res.opportunityId || '')
    results.push({
      dentalink_id: lead.id,
      nombre: lead.nombre,
      elevator_id: lead.elevator_id,
      monetaryValue: Math.round(Number(lead.presupuesto_total) || 0),
      ...res,
      ok: true,
    })
  } catch (err) {
    console.log('ERROR', err.message.slice(0, 140))
    results.push({
      dentalink_id: lead.id,
      nombre: lead.nombre,
      elevator_id: lead.elevator_id,
      ok: false,
      error: err.message.slice(0, 300),
    })
  }
  await sleep(500)
}

const log = {
  at: new Date().toISOString(),
  dry_run: dryRun,
  stage: stageKey,
  pipeline_id: PIPELINE.id,
  ok: results.filter(r => r.ok).length,
  failed: results.filter(r => !r.ok).length,
  results,
}

if (!dryRun) {
  const map = new Map(results.filter(r => r.ok && r.opportunityId).map(r => [r.dentalink_id, r]))
  for (const lead of data.leads || []) {
    const r = map.get(lead.id)
    if (r) {
      lead.elevator_opportunity_id = r.opportunityId
      lead.elevator_pipeline_id = PIPELINE.id
      lead.elevator_stage = stageKey
      lead.elevator_stage_id = r.stageId
    }
  }
  data.metadata = {
    ...data.metadata,
    elevator_pipeline_id: PIPELINE.id,
    elevator_pipeline_name: PIPELINE.name,
    elevator_opportunities_count: (data.leads || []).filter(l => l.elevator_opportunity_id).length,
    elevator_pipeline_loaded_at: log.at,
  }
  writeFileSync(LEADS_PATH, JSON.stringify(data, null, 2))
  writeFileSync(
    join(ROOT, 'src', 'data', 'leads.js'),
    `// Pipeline load ${log.at}\nexport default ${JSON.stringify(data)};\n`,
  )
}

const prev = existsSync(LOG_PATH) ? JSON.parse(readFileSync(LOG_PATH, 'utf-8')) : { runs: [] }
const runs = Array.isArray(prev.runs) ? prev.runs : []
runs.unshift(log)
writeFileSync(LOG_PATH, JSON.stringify({ runs: runs.slice(0, 20) }, null, 2))

console.log('══════════════════════════════════')
console.log(`OK: ${log.ok} · FAIL: ${log.failed}`)
console.log('Config:', CONFIG_PATH)
console.log('Remember: no campaigns / no workflows on this pipeline yet.')
