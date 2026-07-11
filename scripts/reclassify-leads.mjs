/**
 * Reclasifica leads usando citas + tratamientos + abonos.
 * Evita marcar como "Nunca agendó" a pacientes con plan o pago.
 *
 * Usage: node scripts/reclassify-leads.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LEADS_PATH = join(ROOT, 'public', 'leads-data.json')
const SRC_PATH = join(ROOT, 'src', 'data', 'leads.js')

const SEG = {
  'sin-contacto': { label: 'Sin datos de contacto', priority: 0, color: '#6b7280' },
  deshabilitado: { label: 'Deshabilitado / dado de baja', priority: 0, color: '#9ca3af' },
  'tiene-cita': { label: 'Ya tiene cita agendada', priority: 0, color: '#22c55e' },
  reciente: { label: 'Reciente (-30 días)', priority: 0, color: '#22c55e' },
  'inactivo-30d': { label: 'Inactivo +30 días', priority: 1, color: '#84cc16' },
  'inactivo-60d': { label: 'Inactivo +60 días', priority: 2, color: '#eab308' },
  'inactivo-90d': { label: 'Inactivo +90 días', priority: 3, color: '#f97316' },
  'ultima-no-asistio': { label: 'Última cita: canceló / no asistió', priority: 4, color: '#eab308' },
  'solo-cancelaciones': { label: 'Solo canceló / no asistió', priority: 4, color: '#f97316' },
  'anticipo-sin-cita': { label: 'Tiene abono, sin cita registrada', priority: 5, color: '#a855f7' },
  'plan-sin-cita': { label: 'Tiene plan, sin cita registrada', priority: 5, color: '#8b5cf6' },
  'nunca-agendo': { label: 'Nunca agendó (sin plan ni abono)', priority: 5, color: '#ef4444' },
  'sin-citas-pasadas': { label: 'Sin citas pasadas', priority: 3, color: '#a855f7' },
}

function isCancelledOrNoShow(estado) {
  const e = String(estado || '').toLowerCase()
  return (
    e.includes('cancel') ||
    e.includes('no asist') ||
    e.includes('no-show') ||
    e.includes('anulad')
  )
}

function classifyLead(lead) {
  const now = new Date()
  const hasContact = !!(lead.email || lead.phone)
  const isDisabled = lead.habilitado === false || lead.habilitado === 0

  if (!hasContact) return pack('sin-contacto')
  if (isDisabled) return pack('deshabilitado')

  const citas = Array.isArray(lead.citas) ? lead.citas : []
  const totalCitas = Number(lead.total_citas) || citas.length

  // Future appointments from stored citas when possible
  const futureCitas = citas.filter(c => {
    if (!c.fecha) return false
    if (c.anulada || isCancelledOrNoShow(c.estado)) return false
    const fecha = new Date(`${c.fecha}T${c.hora || c.hora_inicio || '00:00:00'}`)
    return fecha >= now
  })

  // If segment was tiene-cita or we detect future, keep has appointment
  if (futureCitas.length > 0 || (lead.segment === 'tiene-cita' && totalCitas > 0 && lead.ultima_cita_fecha && new Date(lead.ultima_cita_fecha) >= new Date(now.toISOString().slice(0, 10)))) {
    // only trust future if we have future list OR ultima is future
    if (futureCitas.length > 0) return pack('tiene-cita')
    if (lead.ultima_cita_fecha) {
      const u = new Date(lead.ultima_cita_fecha + 'T23:59:59')
      if (u >= now && !isCancelledOrNoShow(lead.ultima_cita_estado)) return pack('tiene-cita')
    }
  }

  // Explicit future from any cita date string
  for (const c of citas) {
    if (!c.fecha || c.anulada || isCancelledOrNoShow(c.estado)) continue
    if (new Date(`${c.fecha}T${c.hora || '00:00:00'}`) >= now) return pack('tiene-cita')
  }

  const hasPlan =
    (Number(lead.tratamientos_count) || 0) > 0 ||
    (Number(lead.presupuesto_total) || 0) > 0 ||
    (Array.isArray(lead.tratamientos) && lead.tratamientos.length > 0)
  const hasPayment = (Number(lead.abonado_total) || 0) > 0

  // Zero appointments
  if (totalCitas === 0) {
    if (hasPayment) return pack('anticipo-sin-cita')
    if (hasPlan) return pack('plan-sin-cita')
    return pack('nunca-agendo')
  }

  // All cancelled / no-show
  const cancelled = citas.filter(c => c.anulada || isCancelledOrNoShow(c.estado))
  if (citas.length > 0 && cancelled.length === citas.length) {
    return pack('solo-cancelaciones')
  }

  const lastEstado = lead.ultima_cita_estado || (citas[0] && citas[0].estado)
  if (isCancelledOrNoShow(lastEstado)) {
    return pack('ultima-no-asistio')
  }

  // Inactivity by last appointment date
  const lastDateStr = lead.ultima_cita_fecha || (citas[0] && citas[0].fecha)
  if (lastDateStr) {
    const daysSince = Math.floor((now - new Date(lastDateStr)) / (1000 * 60 * 60 * 24))
    if (daysSince >= 90) return pack('inactivo-90d')
    if (daysSince >= 60) return pack('inactivo-60d')
    if (daysSince >= 30) return pack('inactivo-30d')
    return pack('reciente')
  }

  return pack('sin-citas-pasadas')
}

function pack(segment) {
  const cfg = SEG[segment] || SEG['sin-citas-pasadas']
  return {
    segment,
    segment_label: cfg.label,
    segment_priority: cfg.priority,
    segment_color: cfg.color,
  }
}

const data = JSON.parse(readFileSync(LEADS_PATH, 'utf-8'))
const leads = data.leads || []
const before = {}
const after = {}
const moved = []

for (const lead of leads) {
  before[lead.segment] = (before[lead.segment] || 0) + 1
  const old = lead.segment
  const cls = classifyLead(lead)
  Object.assign(lead, cls)
  after[cls.segment] = (after[cls.segment] || 0) + 1
  if (old !== cls.segment) {
    moved.push({ id: lead.id, nombre: lead.nombre, from: old, to: cls.segment, plan: lead.tratamiento_principal, abonado: lead.abonado_total || 0, citas: lead.total_citas || 0 })
  }
}

data.segment_summary = after
data.metadata = {
  ...data.metadata,
  reclassified_at: new Date().toISOString(),
  reclassification_note:
    'Nunca agendó = 0 citas + sin plan + sin abono. Plan/anticipo sin cita son segmentos separados.',
}

writeFileSync(LEADS_PATH, JSON.stringify(data, null, 2))
writeFileSync(
  SRC_PATH,
  `// Reclassified segments for campaign clarity\n// ${data.metadata.reclassified_at}\nexport default ${JSON.stringify(data)};\n`,
)

console.log('══════════════════════════════════')
console.log(' RECLASIFICACIÓN')
console.log('══════════════════════════════════')
console.log('ANTES:')
for (const [k, v] of Object.entries(before).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(22)} ${v}`)
}
console.log('DESPUÉS:')
for (const [k, v] of Object.entries(after).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(22)} ${v}`)
}
console.log(`Movidos: ${moved.length}`)
const interesting = moved.filter(m => m.from === 'nunca-agendo' || m.to === 'plan-sin-cita' || m.to === 'anticipo-sin-cita')
console.log('Ejemplos (nunca-agendo corregidos / nuevos sin-cita):')
for (const m of interesting.slice(0, 12)) {
  console.log(`  ${m.nombre} | ${m.from} → ${m.to} | plan=${m.plan || '-'} | abonado=${m.abonado}`)
}
console.log('✅ leads-data.json + src/data/leads.js actualizados')
