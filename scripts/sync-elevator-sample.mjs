/**
 * Sincroniza leads prioritarios a Elevator (GoHighLevel).
 * NO envía mensajes. Solo crea/actualiza contactos + tags.
 *
 * Usage:
 *   ELEVATOR_API_KEY=pit-... ELEVATOR_LOCATION_ID=xxx \
 *   node scripts/sync-elevator-sample.mjs --limit=25
 *
 * Flags:
 *   --dry-run
 *   --limit=N            nuevos a sincronizar (default 5)
 *   --refresh-synced     reescribe tags de ya sincronizados
 *   --only-unsynced      ignora ya sincronizados (default true salvo --refresh-synced)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LEADS_PATH = join(ROOT, 'public', 'leads-data.json')
const LOG_PATH = join(ROOT, 'public', 'elevator-sync-log.json')

const API = process.env.ELEVATOR_BASE_URL || 'https://services.leadconnectorhq.com'
const KEY = process.env.ELEVATOR_API_KEY || process.env.GHL_API_KEY || ''
const LOCATION_ID = process.env.ELEVATOR_LOCATION_ID || ''
const VERSION = process.env.ELEVATOR_API_VERSION || '2021-07-28'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const refreshSynced = args.includes('--refresh-synced')
const onlyUnsynced = args.includes('--only-unsynced') || !refreshSynced
const limit = Number((args.find(a => a.startsWith('--limit=')) || '--limit=5').split('=')[1]) || 5

if (!KEY || !LOCATION_ID) {
  console.error('Missing ELEVATOR_API_KEY or ELEVATOR_LOCATION_ID')
  process.exit(1)
}

// Prefer tags that already exist in Elevator location
const TREATMENT_TAG_MAP = {
  implantes: 'implante_dental',
  ortodoncia: 'ortodoncia',
  endodoncia: 'endodoncia',
  limpieza: 'limpieza_dental',
  estetica: 'diseño_de_sonrisa',
  protesis: 'reactivable-protesis',
  cirugia: 'reactivable-cirugia',
  rehabilitacion: 'reactivable-rehabilitacion',
  general: 'odontolog',
  'sin-tratamiento': null,
}

const STALE_SEGMENT_PREFIXES = [
  'reactivable-nunca-agendo',
  'reactivable-plan-sin-cita',
  'reactivable-anticipo-sin-cita',
  'reactivable-solo-cancelaciones',
  'reactivable-ultima-no-asistio',
  'reactivable-inactivo-30d',
  'reactivable-inactivo-60d',
  'reactivable-inactivo-90d',
  'reactivable-reciente',
  'reactivable-tiene-cita',
]

const STALE_TX_PREFIX = /^tx-/
const PRIORITY_TAGS = ['prioridad-alta', 'prioridad-media', 'prioridad-baja']

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: 'Paciente', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function normalizePhone(phone) {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (!digits) return null
  return digits.startsWith('52') ? `+${digits}` : digits.length === 10 ? `+52${digits}` : `+${digits}`
}

function isJunk(name) {
  return /prueba|test|borrar|demo|asdf|xxx|hubspot|paciente hubspot/i.test(String(name || ''))
}

function segmentTag(segment) {
  return `reactivable-${String(segment || 'otro').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`
}

function treatmentTags(lead) {
  const tag = lead.treatment_tag || 'sin-tratamiento'
  const mapped = TREATMENT_TAG_MAP[tag]
  const tags = []
  if (mapped) tags.push(mapped)
  // keep compact tx- only if no native map
  if (!mapped && tag && tag !== 'sin-tratamiento') tags.push(`tx-${tag}`)
  return tags
}

function buildDesiredTags(lead) {
  const tags = [
    'reactivable',
    'dentalink-import',
    'dentalink',
    `prioridad-${lead.priority_band || 'media'}`,
    segmentTag(lead.segment),
    ...treatmentTags(lead),
  ]
  return [...new Set(tags.filter(Boolean))]
}

function mergeTags(existingTags, desiredTags) {
  const existing = Array.isArray(existingTags) ? existingTags.map(String) : []
  const cleaned = existing.filter(t => {
    const low = t.toLowerCase()
    if (PRIORITY_TAGS.includes(low)) return false
    if (STALE_SEGMENT_PREFIXES.includes(low)) return false
    if (low.startsWith('reactivable-') && low !== 'reactivable') return false
    if (STALE_TX_PREFIX.test(low)) return false
    // remove old mapped treatment collisions we re-add cleanly
    if (Object.values(TREATMENT_TAG_MAP).includes(t)) return false
    return true
  })
  return [...new Set([...cleaned, ...desiredTags])]
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

async function findExisting(phone, email) {
  const phoneNorm = normalizePhone(phone)
  if (phoneNorm) {
    const variants = [phoneNorm, phoneNorm.replace(/^\+/, ''), phone]
    for (const number of [...new Set(variants.filter(Boolean))]) {
      try {
        const data = await request('GET', '/contacts/search/duplicate', null, {
          locationId: LOCATION_ID,
          number: String(number),
        })
        const contact = data?.contact || (Array.isArray(data?.contacts) ? data.contacts[0] : null)
        if (contact?.id) return contact
      } catch {
        // continue
      }
    }
  }
  if (email) {
    try {
      const data = await request('GET', '/contacts/search/duplicate', null, {
        locationId: LOCATION_ID,
        email: String(email).trim().toLowerCase(),
      })
      const contact = data?.contact || (Array.isArray(data?.contacts) ? data.contacts[0] : null)
      if (contact?.id) return contact
    } catch {
      // continue
    }
  }
  return null
}

function buildPayload(lead, tags) {
  const { firstName, lastName } = splitName(lead.nombre)
  const phone = normalizePhone(lead.phone)
  const payload = {
    locationId: LOCATION_ID,
    firstName,
    lastName: lastName || undefined,
    source: 'Dentalink Reactivation',
    tags,
  }
  if (phone) payload.phone = phone
  if (lead.email) payload.email = String(lead.email).trim().toLowerCase()
  return payload
}

async function upsertLead(lead) {
  const desired = buildDesiredTags(lead)
  let existing = null
  if (lead.elevator_id) {
    try {
      const got = await request('GET', `/contacts/${lead.elevator_id}`)
      existing = got?.contact || got
    } catch {
      existing = null
    }
  }
  if (!existing) existing = await findExisting(lead.phone, lead.email)

  if (existing?.id) {
    const merged = mergeTags(existing.tags, desired)
    if (dryRun) return { status: 'would-update', elevatorId: existing.id, tags: merged }
    await request('PUT', `/contacts/${existing.id}`, {
      tags: merged,
      source: existing.source || 'Dentalink Reactivation',
    })
    return { status: 'updated', elevatorId: existing.id, tags: merged }
  }

  if (dryRun) return { status: 'would-create', elevatorId: null, tags: desired }

  try {
    const created = await request('POST', '/contacts/', buildPayload(lead, desired))
    const id = created?.contact?.id || created?.id || null
    return { status: 'created', elevatorId: id, tags: desired }
  } catch (err) {
    if (err.status === 400 && err.body?.meta?.contactId) {
      const id = err.body.meta.contactId
      await request('PUT', `/contacts/${id}`, { tags: desired })
      return { status: 'updated-duplicate', elevatorId: id, tags: desired }
    }
    throw err
  }
}

const data = JSON.parse(readFileSync(LEADS_PATH, 'utf-8'))
const byId = new Map((data.leads || []).map(l => [l.id, l]))

// Prefer full lead objects (have phone/email) ordered by score
let pool = (data.leads || [])
  .filter(l => l.is_reactivable)
  .filter(l => !isJunk(l.nombre))
  .filter(l => l.phone || l.email)
  .sort((a, b) => (b.reactivation_score || 0) - (a.reactivation_score || 0))

if (refreshSynced) {
  pool = pool.filter(l => l.elevator_id).slice(0, Math.max(limit, 5))
} else if (onlyUnsynced) {
  pool = pool.filter(l => !l.elevator_id).slice(0, limit)
} else {
  pool = pool.slice(0, limit)
}

console.log(`${dryRun ? 'DRY-RUN' : 'SYNC'} Elevator · ${pool.length} leads · refresh=${refreshSynced}`)
console.log(`Location: ${LOCATION_ID}`)

const results = []
for (const lead of pool) {
  process.stdout.write(`→ [${lead.reactivation_score}] ${lead.nombre} (${lead.segment}) ... `)
  try {
    const res = await upsertLead(lead)
    console.log(res.status, res.elevatorId || '')
    results.push({
      dentalink_id: lead.id,
      nombre: lead.nombre,
      segment: lead.segment,
      treatment_tag: lead.treatment_tag,
      score: lead.reactivation_score,
      ...res,
      ok: true,
    })
  } catch (err) {
    console.log('ERROR', err.message.slice(0, 140))
    results.push({
      dentalink_id: lead.id,
      nombre: lead.nombre,
      ok: false,
      error: err.message.slice(0, 300),
    })
  }
  await sleep(700)
}

const log = {
  synced_at: new Date().toISOString(),
  dry_run: dryRun,
  refresh_synced: refreshSynced,
  location_id: LOCATION_ID,
  count: results.length,
  ok: results.filter(r => r.ok).length,
  failed: results.filter(r => !r.ok).length,
  results,
}

if (!dryRun) {
  const map = new Map(results.filter(r => r.ok && r.elevatorId).map(r => [r.dentalink_id, r]))
  for (const lead of data.leads || []) {
    const r = map.get(lead.id)
    if (r) {
      lead.elevator_id = r.elevatorId
      lead.elevator_synced_at = log.synced_at
      lead.elevator_sync_status = r.status
      lead.elevator_tags = r.tags
    }
  }
  for (const t of data.top_reactivables || []) {
    const full = byId.get(t.id)
    if (full?.elevator_id) {
      t.elevator_id = full.elevator_id
      t.elevator_sync_status = full.elevator_sync_status
    }
  }
  data.metadata = {
    ...data.metadata,
    elevator_synced_count: (data.leads || []).filter(l => l.elevator_id).length,
    elevator_last_sync_at: log.synced_at,
  }
  writeFileSync(LEADS_PATH, JSON.stringify(data, null, 2))
  writeFileSync(
    join(ROOT, 'src', 'data', 'leads.js'),
    `// Elevator sync ${log.synced_at}\nexport default ${JSON.stringify(data)};\n`,
  )
}

const prev = existsSync(LOG_PATH) ? JSON.parse(readFileSync(LOG_PATH, 'utf-8')) : { runs: [] }
const runs = Array.isArray(prev.runs) ? prev.runs : []
runs.unshift(log)
writeFileSync(LOG_PATH, JSON.stringify({ runs: runs.slice(0, 30) }, null, 2))

console.log('══════════════════════════════════')
console.log(`OK: ${log.ok} · FAIL: ${log.failed} · dryRun=${dryRun}`)
for (const r of results) {
  console.log(
    r.ok
      ? `  ✅ ${r.nombre} → ${r.status} ${r.elevatorId || ''} | ${ (r.tags || []).join(', ') }`
      : `  ❌ ${r.nombre} → ${r.error}`,
  )
}
console.log('Total elevator_id in data:', (data.leads || []).filter(l => l.elevator_id).length)
