#!/usr/bin/env node
/**
 * Batch sync unsynced alta-priority leads to Elevator.
 * Saves after EACH contact so partial progress isn't lost.
 *
 * ELEVATOR_API_KEY=... ELEVATOR_LOCATION_ID=... node sync-elevator-batch.mjs --max=500
 */
import { readFileSync, writeFileSync } from 'fs'
import https from 'https'
import http from 'http'

const KEY = process.env.ELEVATOR_API_KEY || ''
const LOC = process.env.ELEVATOR_LOCATION_ID || ''
const BASE = 'https://services.leadconnectorhq.com'
const DATA_PATH = 'public/leads-data.json'
const max = parseInt(process.argv.find(a => a.startsWith('--max='))?.split('=')[1] || '500', 10)
const dry = process.argv.includes('--dry-run')

if (!KEY || !LOC) { console.error('Missing API_KEY/LOCATION_ID'); process.exit(1) }

const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
const leads = data.leads

// Only unsynced alta
const candidates = leads.filter(l => l.is_reactivable && !l.elevator_id && l.priority_band === 'alta')
console.log(`Candidates: ${candidates.length}, max: ${max}`)

let ok = 0, exists = 0, err = 0

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE)
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      },
    }
    const req = https.request(opts, res => {
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

async function main() {
  for (let i = 0; i < Math.min(candidates.length, max); i++) {
    const l = candidates[i]
    if (l.elevator_id) continue // may have been set by previous save
    
    const name = l.nombre || ''
    const firstName = name.split(' ')[0] || 'Paciente'
    const lastName = name.split(' ').slice(1).join(' ') || l.apellidos || ''
    const phoneRaw = (l.phone || '').replace(/\D/g, '')
    // Normalize MX phone
    const phone = phoneRaw.length >= 10 ? '+52' + phoneRaw.slice(-10) : ''
    
    const tags = ['reactivable', 'dentalink-import', 'prioridad-alta', `reactivable-${l.segment || 'desconocido'}`]
    if (l.tratamiento_principal) tags.push(l.tratamiento_principal.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40))
    
    const emailVal = l.email && l.email.includes('@') && !l.email.includes('..') ? l.email : ''
    const contact = {
      locationId: LOC,
      firstName,
      lastName,
      email: emailVal,
      phone,
      tags,
    }
    
    try {
      const res = await api('POST', `/contacts/?locationId=${LOC}`, JSON.stringify(contact))
      
      if (res.status === 201 || res.status === 200) {
        const cid = res.data?.contact?.id || res.data?.id
        if (cid) {
          l.elevator_id = cid
          l.elevator_sync_status = 'created'
          ok++
          // Save after each contact
          writeFileSync(DATA_PATH, JSON.stringify(data))
          // Slow progress log
          if (ok <= 20 || ok % 50 === 0) {
            console.log(`+ [${i+1}/${Math.min(candidates.length, max)}] ${name || '?'} → ${cid} (total: ${ok})`)
          }
        }
      } else if (res.status === 409 || (res.data?.message && res.data.message.includes('already exists'))) {
        // Contact already exists - try search by phone/email
        exists++
        console.log(`~ [${i+1}] ${name} already exists`)
      } else {
        console.log(`✗ [${i+1}] ${name} HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 120)}`)
        err++
      }
    } catch (e) {
      console.log(`! [${i+1}] ${name}: ${e.message.slice(0, 80)}`)
      err++
    }
    
    // Rate limit - 1 req/s max
    await new Promise(r => setTimeout(r, 1100))
  }
  
  writeFileSync(DATA_PATH, JSON.stringify(data))
  const total = data.leads.filter(x => x.elevator_id).length
  console.log(`\n═══ DONE ═══`)
  console.log(`Created: ${ok}`)
  console.log(`Already exist: ${exists}`)
  console.log(`Errors: ${err}`)
  console.log(`Total with elevator_id: ${total}`)
}
main().catch(e => { console.error(e); process.exit(1) })
