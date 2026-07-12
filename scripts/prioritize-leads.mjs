/**
 * Calcula score de reactivación y ranking Top N.
 * Lee data/leads-data.json y escribe priority fields + top_reactivables.
 *
 * Usage: node scripts/prioritize-leads.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const LEADS_PATH = join(ROOT, 'data', 'leads-data.json')
const SRC_PATH = join(ROOT, 'src', 'data', 'leads.js')

const REACTIVABLE = new Set([
  'nunca-agendo',
  'plan-sin-cita',
  'anticipo-sin-cita',
  'solo-cancelaciones',
  'ultima-no-asistio',
  'inactivo-90d',
  'inactivo-60d',
  'inactivo-30d',
])

const SEGMENT_SCORE = {
  'anticipo-sin-cita': 42, // ya pagó, falta agenda
  'plan-sin-cita': 40,     // tiene plan clínico sin cita
  'nunca-agendo': 36,      // frío real
  'solo-cancelaciones': 38,
  'ultima-no-asistio': 35,
  'inactivo-30d': 28,
  'inactivo-60d': 24,
  'inactivo-90d': 18,
  reciente: 5,
  'tiene-cita': 0,
  deshabilitado: 0,
  'sin-contacto': 0,
}

const HIGH_VALUE = [
  { re: /implante/i, score: 35, tag: 'implantes' },
  { re: /pr[oó]tesis|h[ií]brida/i, score: 32, tag: 'protesis' },
  { re: /ortodon|alineador|invisalign/i, score: 30, tag: 'ortodoncia' },
  { re: /est[eé]tica|dise[nñ]o|blanque|veneer|carilla/i, score: 26, tag: 'estetica' },
  { re: /endodon/i, score: 22, tag: 'endodoncia' },
  { re: /cirug/i, score: 20, tag: 'cirugia' },
  { re: /rehabil/i, score: 20, tag: 'rehabilitacion' },
  { re: /limpieza/i, score: 10, tag: 'limpieza' },
  { re: /consulta|odontolog[ií]a general/i, score: 6, tag: 'general' },
]

function treatmentText(lead) {
  return [lead.tratamiento_principal, ...(lead.tratamientos || [])].filter(Boolean).join(' | ')
}

function treatmentScore(lead) {
  const text = treatmentText(lead)
  let best = { score: 0, tag: 'sin-tratamiento' }
  for (const item of HIGH_VALUE) {
    if (item.re.test(text) && item.score > best.score) best = { score: item.score, tag: item.tag }
  }
  return best
}

function budgetScore(amount) {
  const n = Number(amount) || 0
  if (n >= 100000) return 30
  if (n >= 50000) return 24
  if (n >= 20000) return 18
  if (n >= 8000) return 12
  if (n >= 2000) return 6
  return 0
}

function debtScore(amount) {
  const n = Number(amount) || 0
  if (n >= 10000) return 12
  if (n >= 1000) return 8
  if (n > 0) return 4
  return 0
}

function contactScore(lead) {
  let s = 0
  if (lead.phone) s += 10
  if (lead.email) s += 5
  return s
}

function priorityBand(score) {
  if (score >= 80) return 'alta'
  if (score >= 55) return 'media'
  if (score >= 30) return 'baja'
  return 'nula'
}

function scoreLead(lead) {
  const segment = lead.segment || ''
  const isReactivable = REACTIVABLE.has(segment) && lead.habilitado !== false
  const hasContact = Boolean(lead.phone || lead.email)
  const tx = treatmentScore(lead)

  if (!isReactivable || !hasContact || segment === 'deshabilitado' || segment === 'sin-contacto') {
    return {
      reactivation_score: 0,
      priority_band: 'nula',
      treatment_tag: tx.tag,
      is_reactivable: false,
      priority_reason: !hasContact ? 'sin-contacto' : !isReactivable ? 'no-reactivable' : 'excluido',
    }
  }

  let score = 0
  score += SEGMENT_SCORE[segment] || 0
  score += tx.score
  score += budgetScore(lead.presupuesto_total)
  score += debtScore(lead.deuda_total)
  score += contactScore(lead)

  // Bonus: never booked is gold for paid ads recovery
  if (segment === 'nunca-agendo') score += 8
  // Bonus: unpaid remaining balance
  if ((lead.deuda_total || 0) > 0 && (lead.presupuesto_total || 0) > 0) score += 5

  const band = priorityBand(score)
  const reasons = [
    segment,
    tx.tag !== 'sin-tratamiento' ? tx.tag : null,
    (lead.presupuesto_total || 0) >= 20000 ? 'presupuesto-alto' : null,
    (lead.deuda_total || 0) > 0 ? 'deuda' : null,
    lead.phone ? 'tiene-telefono' : null,
  ].filter(Boolean)

  return {
    reactivation_score: score,
    priority_band: band,
    treatment_tag: tx.tag,
    is_reactivable: true,
    priority_reason: reasons.join(', '),
  }
}

const raw = readFileSync(LEADS_PATH, 'utf-8')
const data = JSON.parse(raw)
const leads = data.leads || []

const bandCounts = { alta: 0, media: 0, baja: 0, nula: 0 }

for (const lead of leads) {
  const scored = scoreLead(lead)
  Object.assign(lead, scored)
  bandCounts[scored.priority_band] = (bandCounts[scored.priority_band] || 0) + 1
}

const top = leads
  .filter(l => l.is_reactivable)
  .filter(l => !/prueba|test|borrar|demo|asdf|xxx/i.test(String(l.nombre || '')))
  .sort((a, b) => (b.reactivation_score || 0) - (a.reactivation_score || 0))
  .slice(0, 50)
  .map((l, i) => ({
    rank: i + 1,
    id: l.id,
    nombre: l.nombre,
    phone: l.phone || null,
    email: l.email || null,
    segment: l.segment,
    tratamiento_principal: l.tratamiento_principal || null,
    tratamientos: l.tratamientos || [],
    treatment_tag: l.treatment_tag,
    presupuesto_total: l.presupuesto_total || 0,
    abonado_total: l.abonado_total || 0,
    deuda_total: l.deuda_total || 0,
    reactivation_score: l.reactivation_score,
    priority_band: l.priority_band,
    priority_reason: l.priority_reason,
    elevator_id: l.elevator_id || null,
    elevator_sync_status: l.elevator_sync_status || null,
  }))

data.metadata = {
  ...data.metadata,
  prioritized_at: new Date().toISOString(),
  priority_bands: bandCounts,
}
data.priority_summary = {
  bands: bandCounts,
  reactivables: leads.filter(l => l.is_reactivable).length,
  top50_count: top.length,
}
data.top_reactivables = top

writeFileSync(LEADS_PATH, JSON.stringify(data, null, 2))
writeFileSync(
  SRC_PATH,
  `// Generated with prioritization\n// ${data.metadata.prioritized_at}\nexport default ${JSON.stringify(data)};\n`,
)
writeFileSync(join(ROOT, 'public', 'top-reactivables.json'), JSON.stringify({ generated_at: data.metadata.prioritized_at, top }, null, 2))

console.log('══════════════════════════════════')
console.log(' PRIORIZACIÓN')
console.log('══════════════════════════════════')
console.log('Bandas:', bandCounts)
console.log('Reactivables:', data.priority_summary.reactivables)
console.log('Top 10:')
for (const t of top.slice(0, 10)) {
  console.log(
    `${String(t.rank).padStart(2)}. [${t.reactivation_score}] ${t.nombre} | ${t.segment} | ${t.treatment_tag} | $${t.presupuesto_total}`,
  )
}
console.log('✅ Guardado data/leads-data.json + top-reactivables.json')
