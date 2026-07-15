/**
 * Cruza pagos Dentalink + leads (elevator_id) + click IDs Elevator.
 * Genera payloads de conversión locales. Por defecto genera el archivo final
 * (dry_run=false), pero nunca envía a redes sociales.
 *
 * Usage:
 *   ELEVATOR_API_KEY=... ELEVATOR_LOCATION_ID=... \
 *   node scripts/build-conversion-events.mjs
 *
 * --dry-run solo etiqueta la salida como prueba. NEVER dispatches unless
 * --dispatch is passed AND CONFIRM_DISPATCH=YES
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LEADS_PATH = join(ROOT, 'data', 'leads-data.json')
const PAGOS_API = join(ROOT, 'data', 'pagos-data.json')
const PAGOS_MERGED = join(ROOT, 'data', 'pagos-merged.json')
const PAGOS_EXCEL = join(ROOT, 'data', 'pagos-excel-data.json')
const OUT = join(ROOT, 'public', 'conversion-events.json')

const API = process.env.ELEVATOR_BASE_URL || 'https://services.leadconnectorhq.com'
const KEY = process.env.ELEVATOR_API_KEY || process.env.GHL_API_KEY || ''
const LOCATION_ID = process.env.ELEVATOR_LOCATION_ID || ''
const VERSION = process.env.ELEVATOR_API_VERSION || '2021-07-28'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const dispatch = args.includes('--dispatch') && process.env.CONFIRM_DISPATCH === 'YES'
const limit = Number((args.find(a => a.startsWith('--limit=')) || '--limit=999999').split('=')[1]) || 999999
const minAmount = Number((args.find(a => a.startsWith('--min-amount=')) || '--min-amount=1').split('=')[1]) || 1

if (args.includes('--dispatch') && !dispatch) {
  console.error('Refusing dispatch. Set CONFIRM_DISPATCH=YES to actually send (not implemented yet).')
  process.exit(1)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function sha256(v) {
  if (!v) return null
  return createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex')
}

function normPhone(p) {
  if (!p) return null
  const d = String(p).replace(/\D/g, '')
  return d || null
}

async function request(method, path) {
  const res = await fetch(new URL(path, API), {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      Version: VERSION,
      Accept: 'application/json,text/plain,*/*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Origin: 'https://app.gohighlevel.com',
      Referer: 'https://app.gohighlevel.com/',
    },
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`)
  return json
}

// Known Elevator custom field IDs for this location
const CF_IDS = {
  fbclid: 'Fcgit0o8vgL7sQ58e2gb',
  fbc: 'j7vZ37Pa2HEJFii0T6uk',
  fbc2: 'DDph2I8nojTJKIDWDP05',
  gclid: 'sWcDvQejgXdKdON0Cevn',
  ttclid: 'vq6eHbhRLCxaTihuOXcA',
  utm_source: 'xYCM9PzBUKFWL8IUCtHX',
  utm_campaign: 'MzPjzY7ML12fSZIUBapL',
  utm_medium: 'tEgh2CO6OUOhQNxtBFzT',
}

function extractClickIds(contact) {
  const custom = contact.customFields || contact.customField || []
  const byId = {}
  for (const f of custom) {
    const id = f.id || f.key || f.fieldKey || ''
    const val = f.value ?? f.field_value ?? f.fieldValue
    if (id) byId[String(id)] = Array.isArray(val) ? val[0] : val
  }
  const attr = contact.lastAttributionSource || contact.attributionSource || {}
  const pick = (...vals) => vals.find(v => v != null && String(v).trim() !== '') || null
  return {
    fbclid: pick(byId[CF_IDS.fbclid], attr.fbclid, contact.fbclid),
    fbc: pick(byId[CF_IDS.fbc], byId[CF_IDS.fbc2], attr.fbc, contact.fbc),
    gclid: pick(byId[CF_IDS.gclid], attr.gclid, contact.gclid),
    ttclid: pick(byId[CF_IDS.ttclid], attr.ttclid, contact.ttclid),
    utm_source: pick(byId[CF_IDS.utm_source], attr.utmSource),
    utm_campaign: pick(byId[CF_IDS.utm_campaign], attr.utmCampaign),
    utm_medium: pick(byId[CF_IDS.utm_medium], attr.utmMedium),
    session_source: attr.sessionSource || null,
  }
}

function normText(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function inferAttribution(lead, click) {
  const tags = (lead?.elevator_tags || []).map(normText)
  const obs = normText(lead?.observaciones)
  const utmSource = normText(click?.utm_source)
  const utmMedium = normText(click?.utm_medium)
  const sessionSource = normText(click?.session_source)
  const hay = (...needles) => needles.some(n =>
    tags.some(t => t.includes(n)) || obs.includes(n) || utmSource.includes(n) || utmMedium.includes(n) || sessionSource.includes(n)
  )

  if (click?.gclid || hay('google', 'gads', 'adwords')) {
    return { channel: 'google', label: 'Google Ads', confidence: click?.gclid ? 'alta' : 'media', basis: click?.gclid ? 'gclid' : 'utm/tag google' }
  }
  if (click?.fbclid || click?.fbc || hay('facebook', 'fb', 'meta', 'instagram', 'ig')) {
    return { channel: 'meta', label: 'Meta / Facebook', confidence: (click?.fbclid || click?.fbc) ? 'alta' : 'media', basis: (click?.fbclid || click?.fbc) ? 'fbclid/fbc' : 'utm/tag meta/instagram' }
  }
  if (click?.ttclid || hay('tiktok', 'tt')) {
    return { channel: 'tiktok', label: 'TikTok', confidence: click?.ttclid ? 'alta' : 'media', basis: click?.ttclid ? 'ttclid' : 'utm/tag tiktok' }
  }
  if (hay('[whatsapp] - lead capture', 'lead_entrante_tochat', 'escribio_whatsapptochat', 'lead_mkt', 'paciente-de-mkt', 'form-web-llamadas', 'tracking-core')) {
    return { channel: 'marketing_whatsapp', label: 'Marketing / WhatsApp', confidence: 'media', basis: 'tags Elevator de lead entrante/marketing' }
  }
  if (hay('[device] - clinica drdiente atencion', 'paciente-sin-lead', 'recomendacion', 'pasando por la clinica')) {
    return { channel: 'organic_direct', label: 'Orgánico / Directo', confidence: 'media', basis: 'tags/observaciones de paciente directo' }
  }
  return { channel: 'unknown', label: 'Sin atribuir', confidence: 'baja', basis: 'sin click ID, UTM o tag confiable' }
}

// Load payments
let pagos = []
if (existsSync(PAGOS_MERGED)) {
  pagos = JSON.parse(readFileSync(PAGOS_MERGED, 'utf-8')).pagos || []
} else if (existsSync(PAGOS_API)) {
  pagos = JSON.parse(readFileSync(PAGOS_API, 'utf-8')).pagos || []
} else if (existsSync(PAGOS_EXCEL)) {
  pagos = JSON.parse(readFileSync(PAGOS_EXCEL, 'utf-8')).pagos || []
} else {
  console.error('No hay pagos. Corre import-dentalink-pagos-api.mjs o importa Excel.')
  process.exit(1)
}

const leads = JSON.parse(readFileSync(LEADS_PATH, 'utf-8')).leads || []
const leadByPatient = new Map(leads.map(l => [l.id, l]))
const leadByPhone = new Map()
const leadByEmail = new Map()
for (const l of leads) {
  const ph = normPhone(l.phone)
  if (ph) leadByPhone.set(ph, l)
  if (l.email) leadByEmail.set(String(l.email).toLowerCase(), l)
}

// Aggregate payments by patient
const byPatient = new Map()
for (const p of pagos) {
  const pid = p.id_paciente
  if (!pid) continue
  if ((Number(p.monto_pago) || 0) < minAmount) continue
  if (!byPatient.has(pid)) byPatient.set(pid, [])
  byPatient.get(pid).push(p)
}

const candidates = []
for (const [pid, list] of byPatient) {
  const lead = leadByPatient.get(Number(pid))
  if (!lead?.elevator_id) continue
  const total = list.reduce((s, x) => s + (Number(x.monto_pago) || 0), 0)
  candidates.push({
    id_paciente: Number(pid),
    elevator_id: lead.elevator_id,
    nombre: lead.nombre,
    phone: lead.phone,
    email: lead.email,
    total_pagado: total,
    pagos_count: list.length,
    last_pago_fecha: list.map(x => x.fecha_recepcion || '').sort().slice(-1)[0] || null,
    medios: [...new Set(list.map(x => x.medio_pago).filter(Boolean))],
    payment_ids: list.map(x => x.id).filter(Boolean),
    pagos: list,
  })
}
candidates.sort((a, b) => b.total_pagado - a.total_pagado)

console.log(`Pagos rows: ${pagos.length}`)
console.log(`Pacientes con pago+elevator_id: ${candidates.length}`)
console.log(`Procesando hasta ${limit} (dryRun=${dryRun}, dispatch=${dispatch})`)

if (!KEY || !LOCATION_ID) {
  console.warn('Sin Elevator credentials: se generan eventos sin click IDs frescos')
}

const events = []
const pool = candidates.slice(0, limit)

for (const c of pool) {
  let click = { fbclid: null, fbc: null, gclid: null, ttclid: null }
  if (KEY && c.elevator_id) {
    try {
      const data = await request('GET', `/contacts/${c.elevator_id}`)
      const contact = data.contact || data
      click = extractClickIds(contact)
    } catch (err) {
      click._error = err.message.slice(0, 120)
    }
    await sleep(250)
  }

  const hasClick = !!(click.fbclid || click.fbc || click.gclid || click.ttclid)
  const lead = leadByPatient.get(Number(c.id_paciente))
  const inferred = inferAttribution(lead, click)
  const status = hasClick ? 'ready' : (inferred.channel !== 'unknown' ? 'attributed_by_crm_signal' : 'manual_review_no_click_id')

  // One event per payment_id when available; else aggregate
  const units = c.payment_ids.length
    ? c.pagos.filter(p => p.id)
    : [{ id: `agg-${c.id_paciente}`, monto_pago: c.total_pagado, fecha_recepcion: c.last_pago_fecha, medio_pago: c.medios.join('|') }]

  for (const p of units) {
    const event = {
      event_name: 'Compra',
      event_id: `payment_${p.id}`,
      payment_id: p.id,
      dentalink_patient_id: c.id_paciente,
      elevator_id: c.elevator_id,
      occurred_at: p.fecha_recepcion || c.last_pago_fecha,
      status,
      action_source: 'physical_store',
      user_data: {
        em: sha256(c.email),
        ph: sha256(normPhone(c.phone)),
        fbclid: click.fbclid || null,
        fbc: click.fbc || null,
        gclid: click.gclid || null,
        ttclid: click.ttclid || null,
      },
      custom_data: {
        currency: 'MXN',
        value: Number(p.monto_pago) || 0,
        cash_collected: Number(p.monto_pago) || 0,
        payment_method: p.medio_pago || null,
        branch: p.nombre_sucursal || null,
        patient_name: c.nombre,
      },
      attribution: {
        utm_source: click.utm_source || null,
        utm_campaign: click.utm_campaign || null,
        utm_medium: click.utm_medium || null,
        channel: inferred.channel,
        label: inferred.label,
        confidence: inferred.confidence,
        basis: inferred.basis,
        elevator_tags: lead?.elevator_tags || [],
      },
      dispatch: {
        allowed: false,
        reason: dryRun ? 'dry-run' : 'not-implemented',
      },
    }
    events.push(event)
  }
  process.stdout.write(`\r  events ${events.length}`)
}

console.log('\n')
const ready = events.filter(e => e.status === 'ready').length
const review = events.filter(e => e.attribution?.channel === 'unknown').length
const crmAttributed = events.filter(e => e.status === 'attributed_by_crm_signal').length

const out = {
  metadata: {
    built_at: new Date().toISOString(),
    dry_run: dryRun,
    dispatch_attempted: dispatch,
    total_events: events.length,
    ready_with_click_id: ready,
    attributed_by_crm_signal: crmAttributed,
    manual_review: review,
    note: 'NO se envió nada a Meta/Google/TikTok. Solo payloads locales.',
  },
  events,
}

writeFileSync(OUT, JSON.stringify(out, null, 2))
console.log('══════════════════════════════════')
console.log(`Eventos: ${events.length} · ready: ${ready} · review: ${review}`)
console.log('→', OUT)
console.log('Siguiente: importar Excel de "Pagos y acciones" + aprobar dispatch a CAPI/Stape')
