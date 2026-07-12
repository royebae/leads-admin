#!/usr/bin/env node
/**
 * Fase 3 COMPLETA: sincroniza TODOS los leads reactivables a Elevator.
 *
 * Estrategia:
 *   1. Exporta todos los contactos de Elevator (paginado)
 *   2. Matchea localmente por teléfono (últimos 10 dígitos)
 *   3. Los que no existen → los crea
 *   4. Crea oportunidad en pipeline para cada uno
 *
 * Usage:
 *   ELEVATOR_API_KEY=... ELEVATOR_LOCATION_ID=... node scripts/sync-all-leads.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import https from 'https'

const KEY = process.env.ELEVATOR_API_KEY || ''
const LOC = process.env.ELEVATOR_LOCATION_ID || ''
const BASE = 'https://services.leadconnectorhq.com'
const DATA_PATH = 'data/leads-data.json'
const PIPELINE_ID = 'iDsSx2heXECuWVeKXnLK'
const STAGE_NUEVO = 'eeb17e40-958b-417a-b0eb-70f9a644f9bf'

if (!KEY || !LOC) { process.exit(1) }

const H = {
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  'Version': '2021-07-28',
  'Accept': 'application/json,text/plain,*/*',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Origin': 'https://app.gohighlevel.com',
  'Referer': 'https://app.gohighlevel.com/',
}

async function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE)
    const req = https.request({ method, hostname: url.hostname, path: url.pathname + url.search, headers: H }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, data: d }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function exportAllContacts() {
  const all = []
  let page = 1
  const limit = 100
  while (true) {
    const res = await api('GET', `/contacts/?locationId=${LOC}&limit=${limit}&page=${page}`)
    if (res.status !== 200) break
    const contacts = res.data?.contacts || []
    all.push(...contacts)
    if (contacts.length < limit) break
    page += 1
    process.stdout.write(`\r📦 Exportando contactos Elevator: ${all.length}...`)
    await new Promise(r => setTimeout(r, 300))
  }
  console.log(`\n📦 Total contactos en Elevator: ${all.length}`)
  return all
}

function normalizePhone(p) {
  if (!p) return ''
  return p.replace(/\D/g, '').slice(-10)
}

const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
const leads = data.leads

const eligible = leads.filter(l => l.is_reactivable && !l.elevator_id && !l.elevator_exclude)
const candidates = eligible.filter(l => ['alta', 'media', 'baja'].includes(l.priority_band))
console.log(`Candidatos a sincronizar: ${candidates.length}`)

// Step 1: Export all Elevator contacts and build phone map
const allContacts = await exportAllContacts()
const phoneMap = {}
for (const c of allContacts) {
  const ph = normalizePhone(c.phone)
  if (ph) phoneMap[ph] = c.id
  if (c.email) phoneMap[c.email.toLowerCase().trim()] = c.id // also by email
}

let created = 0, found = 0, opps = 0, errors = 0, skipped = 0

for (let i = 0; i < candidates.length; i++) {
  const l = candidates[i]
  if (l.elevator_id) continue

  const name = l.nombre || '?'
  const phoneDig = normalizePhone(l.phone)
  const emailKey = (l.email || '').toLowerCase().trim()

  let wasCreated = false
  let contactId = phoneMap[phoneDig] || phoneMap[emailKey] || null

    if (!contactId) {
      // Create new contact
      const firstName = (name || '').split(' ')[0] || 'Paciente'
      const lastName = (name || '').split(' ').slice(1).join(' ') || ''
      const phone = phoneDig ? '+52' + phoneDig : ''
      const email = l.email && l.email.includes('@') && !l.email.includes('..') ? l.email : ''
      const tags = ['reactivable', 'dentalink-import', `prioridad-${l.priority_band}`, `reactivable-${l.segment || ''}`]
      if (l.tratamiento_principal) tags.push(l.tratamiento_principal.replace(/[^a-z0-9]/gi, '_').slice(0, 40).toLowerCase())

      const res = await api('POST', `/contacts/?locationId=${LOC}`, JSON.stringify({
        locationId: LOC, firstName, lastName, email, phone, tags,
      }))

      if (res.status === 201 || res.status === 200) {
        contactId = res.data?.contact?.id || res.data?.id
        if (contactId) {
          created++
          wasCreated = true
          if (phoneDig) phoneMap[phoneDig] = contactId
          if (emailKey) phoneMap[emailKey] = contactId
        }
      } else if (res.status === 400 && res.data?.meta?.contactId) {
        contactId = res.data.meta.contactId
        found++
        if (phoneDig) phoneMap[phoneDig] = contactId
        if (emailKey) phoneMap[emailKey] = contactId
      } else {
        errors++
        if (errors <= 3) console.log(`  ✗ ${name}: HTTP ${res.status}`)
        skipped++
        await new Promise(r => setTimeout(r, 400))
        continue
      }
    } else {
      found++
    }

  if (contactId && contactId.length > 5) {
    l.elevator_id = contactId
    l.elevator_sync_status = wasCreated ? 'created' : 'matched'

    // Create opportunity
    const value = l.presupuesto_total || l.abonado_total || 0
    const oppRes = await api('POST', `/opportunities/`, JSON.stringify({
      pipelineId: PIPELINE_ID,
      pipelineStageId: STAGE_NUEVO,
      locationId: LOC,
      contactId,
      name: (name || '').slice(0, 100),
      monetaryValue: value,
      status: 'open',
      source: 'Dentalink Reactivation',
    }))
    if (oppRes.status === 201 || oppRes.status === 200) {
      l.elevator_opportunity_id = oppRes.data?.opportunity?.id || 'done'
      opps++
    }
  }

  if ((i + 1) % 30 === 0 || i === candidates.length - 1) {
    writeFileSync(DATA_PATH, JSON.stringify(data))
    const progress = ((i + 1) / candidates.length * 100).toFixed(0)
    process.stdout.write(`\r📊 [${i + 1}/${candidates.length}] ${progress}% · found:${found} created:${created} opps:${opps} err:${errors}`)
  }

  await new Promise(r => setTimeout(r, 600))
}

writeFileSync(DATA_PATH, JSON.stringify(data))
const total = data.leads.filter(x => x.elevator_id).length
console.log(`\n\n═══ FASE 3 COMPLETA ═══`)
console.log(`Matched desde Elevator: ${found}`)
console.log(`Creados nuevos: ${created}`)
console.log(`Oportunidades: ${opps}`)
console.log(`Saltados (duplicados/error): ${skipped}`)
console.log(`Total en Elevator: ${total}`)
console.log(`Quedan sin sync: ${candidates.length - found - created}`)
