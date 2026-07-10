/**
 * Sincroniza N leads prioritarios a Elevator (GoHighLevel).
 * NO envía mensajes. Solo crea/actualiza contactos + tags.
 *
 * Usage:
 *   ELEVATOR_API_KEY=pit-... ELEVATOR_LOCATION_ID=xxx \
 *   node scripts/sync-elevator-sample.mjs --limit=5
 *
 * Optional:
 *   --dry-run   no escribe, solo simula
 *   --rank=1,2  ranks específicos de top_reactivables
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
const limit = Number((args.find(a => a.startsWith('--limit=')) || '--limit=5').split('=')[1]) || 5
const rankArg = args.find(a => a.startsWith('--rank='))
const ranks = rankArg
  ? rankArg.split('=')[1].split(',').map(n => Number(n.trim())).filter(Boolean)
  : null

if (!KEY || !LOCATION_ID) {
  console.error('Missing ELEVATOR_API_KEY or ELEVATOR_LOCATION_ID')
  process.exit(1)
}

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

function segmentTag(segment) {
  return `reactivable-${String(segment || 'otro').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`
}

function treatmentTag(tag) {
  return tag && tag !== 'sin-tratamiento' ? `tx-${tag}` : null
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

function buildTags(lead) {
  const tags = [
    'reactivable',
    'dentalink-import',
    'prioridad-' + (lead.priority_band || 'media'),
    segmentTag(lead.segment),
    treatmentTag(lead.treatment_tag),
  ].filter(Boolean)
  return [...new Set(tags)]
}

function buildPayload(lead) {
  const { firstName, lastName } = splitName(lead.nombre)
  const phone = normalizePhone(lead.phone)
  const tags = buildTags(lead)
  const payload = {
    locationId: LOCATION_ID,
    firstName,
    lastName: lastName || undefined,
    source: 'Dentalink Reactivation',
    tags,
  }
  if (phone) payload.phone = phone
  if (lead.email) payload.email = String(lead.email).trim().toLowerCase()

  // Custom fields if available in account (safe optional)
  payload.customFields = [
    { key: 'contact.external_id', field_value: String(lead.id) },
    { key: 'contact.servicio_de_inters', field_value: lead.tratamiento_principal || lead.treatment_tag || '' },
  ].filter(f => f.field_value)

  // Note for operator context
  payload.tags = tags
  return payload
}

async function upsertLead(lead) {
  const existing = await findExisting(lead.phone, lead.email)
  const tags = buildTags(lead)

  if (existing?.id) {
    if (dryRun) {
      return { status: 'would-update', elevatorId: existing.id, tags }
    }
    // Merge tags by update
    const currentTags = Array.isArray(existing.tags) ? existing.tags : []
    const merged = [...new Set([...currentTags, ...tags])]
    await request('PUT', `/contacts/${existing.id}`, {
      tags: merged,
      source: existing.source || 'Dentalink Reactivation',
    })
    return { status: 'updated', elevatorId: existing.id, tags: merged }
  }

  if (dryRun) {
    return { status: 'would-create', elevatorId: null, tags }
  }

  try {
    const created = await request('POST', '/contacts/', buildPayload(lead))
    const id = created?.contact?.id || created?.id || null
    return { status: 'created', elevatorId: id, tags }
  } catch (err) {
    // Handle duplicate race
    if (err.status === 400 && err.body?.meta?.contactId) {
      const id = err.body.meta.contactId
      await request('PUT', `/contacts/${id}`, { tags })
      return { status: 'updated-duplicate', elevatorId: id, tags }
    }
    throw err
  }
}

const data = JSON.parse(readFileSync(LEADS_PATH, 'utf-8'))
let candidates = data.top_reactivables || []
if (!candidates.length) {
  console.error('No top_reactivables. Run prioritize-leads.mjs first.')
  process.exit(1)
}

const isJunk = (name) => /prueba|test|borrar|demo|asdf|xxx/i.test(String(name || ''))

if (ranks) {
  candidates = candidates.filter(c => ranks.includes(c.rank) && !isJunk(c.nombre))
} else {
  candidates = candidates.filter(c => !isJunk(c.nombre)).slice(0, limit)
}

console.log(`${dryRun ? 'DRY-RUN' : 'SYNC'} Elevator · ${candidates.length} leads`)
console.log(`Location: ${LOCATION_ID}`)

const results = []
for (const lead of candidates) {
  process.stdout.write(`→ #${lead.rank} ${lead.nombre} ... `)
  try {
    const res = await upsertLead(lead)
    console.log(res.status, res.elevatorId || '')
    results.push({
      rank: lead.rank,
      dentalink_id: lead.id,
      nombre: lead.nombre,
      segment: lead.segment,
      treatment: lead.tratamiento_principal,
      score: lead.reactivation_score,
      ...res,
      ok: true,
    })
  } catch (err) {
    console.log('ERROR', err.message.slice(0, 120))
    results.push({
      rank: lead.rank,
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
  location_id: LOCATION_ID,
  count: results.length,
  ok: results.filter(r => r.ok).length,
  failed: results.filter(r => !r.ok).length,
  results,
}

// Mark leads in main data if real sync
if (!dryRun) {
  const byId = new Map(results.filter(r => r.ok && r.elevatorId).map(r => [r.dentalink_id, r]))
  for (const lead of data.leads || []) {
    const r = byId.get(lead.id)
    if (r) {
      lead.elevator_id = r.elevatorId
      lead.elevator_synced_at = log.synced_at
      lead.elevator_sync_status = r.status
    }
  }
  // also update top list
  for (const t of data.top_reactivables || []) {
    const r = byId.get(t.id)
    if (r) {
      t.elevator_id = r.elevatorId
      t.elevator_sync_status = r.status
    }
  }
  writeFileSync(LEADS_PATH, JSON.stringify(data, null, 2))
  writeFileSync(
    join(ROOT, 'src', 'data', 'leads.js'),
    `// Generated with Elevator sample sync\n// ${log.synced_at}\nexport default ${JSON.stringify(data)};\n`,
  )
}

const prev = existsSync(LOG_PATH) ? JSON.parse(readFileSync(LOG_PATH, 'utf-8')) : { runs: [] }
const runs = Array.isArray(prev.runs) ? prev.runs : []
runs.unshift(log)
writeFileSync(LOG_PATH, JSON.stringify({ runs: runs.slice(0, 20) }, null, 2))

console.log('══════════════════════════════════')
console.log(`OK: ${log.ok} · FAIL: ${log.failed} · dryRun=${dryRun}`)
for (const r of results) {
  console.log(
    r.ok
      ? `  ✅ #${r.rank} ${r.nombre} → ${r.status} ${r.elevatorId || ''}`
      : `  ❌ #${r.rank} ${r.nombre} → ${r.error}`,
  )
}
console.log('Log:', LOG_PATH)
