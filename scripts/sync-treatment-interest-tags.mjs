#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs'
import https from 'https'

const KEY = process.env.ELEVATOR_API_KEY || ''
const LOC = process.env.ELEVATOR_LOCATION_ID || ''
const BASE = 'https://services.leadconnectorhq.com'
const DATA_PATH = 'data/leads-data.json'
const BACKUP_PATH = `data/elevator-tags-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
const PROGRESS_PATH = 'data/elevator-tags-sync-progress.json'
const DRY_RUN = process.argv.includes('--dry-run')
const ONLY_NAME = process.argv.find(a => a.startsWith('--name='))?.slice('--name='.length)?.toUpperCase()

if (!KEY || !LOC) {
  console.error('Missing ELEVATOR_API_KEY / ELEVATOR_LOCATION_ID')
  process.exit(1)
}

const CONTROLLED_TREATMENT_TAGS = new Set([
  'implante_dental',
  'invisalign_ortodoncia',
  'endodoncia',
  'protesis_rehabilitacion',
  'estetica_dental',
  'cirugia_dental',
  'periodoncia',
  'limpieza_consulta',
  'odontologia_general',
  // legacy tags previously produced from tratamiento_principal
  'odontologia_general', 'implantologia', 'corona_sobre_implante', 'protesis_sobre_implante',
  'ortodoncia', 'invisalign', 'cirugia', 'cirugia_bucal', 'estetica', 'estetica_dental',
  'protesis', 'rehabilitacion', 'endodoncia', 'limpieza', 'consulta', 'primera_consulta'
])

const H = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Version: '2021-07-28',
  Accept: 'application/json,text/plain,*/*',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Origin: 'https://app.gohighlevel.com',
  Referer: 'https://app.gohighlevel.com/',
}

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE)
    const req = https.request({ method, hostname: url.hostname, path: url.pathname + url.search, headers: H }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, data }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
const leads = data.leads.filter(l => l.elevator_id && l.interes_comercial_tag && (!ONLY_NAME || String(l.nombre || '').toUpperCase().includes(ONLY_NAME)))
console.log(`${DRY_RUN ? 'DRY RUN ' : ''}Leads to sync treatment interest tags: ${leads.length}`)

const backup = []
const progress = existsSync(PROGRESS_PATH) ? JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')) : { synced: {} }
let changed = 0, unchanged = 0, errors = 0, skippedProgress = 0

for (let i = 0; i < leads.length; i++) {
  const l = leads[i]
  if (!ONLY_NAME && progress.synced[l.elevator_id] === l.interes_comercial_tag) {
    skippedProgress++
    continue
  }
  const get = await api('GET', `/contacts/${l.elevator_id}?locationId=${LOC}`)
  if (get.status !== 200) {
    errors++
    console.log(`✗ GET ${l.nombre}: HTTP ${get.status}`)
    continue
  }
  const contact = get.data.contact || get.data
  const currentTags = Array.isArray(contact.tags) ? contact.tags : []
  backup.push({ id: l.elevator_id, nombre: l.nombre, old_tags: currentTags })
  const keptTags = currentTags.filter(tag => !CONTROLLED_TREATMENT_TAGS.has(String(tag).toLowerCase()))
  const nextTags = [...new Set([...keptTags, l.interes_comercial_tag])]
  const changedThis = JSON.stringify([...currentTags].sort()) !== JSON.stringify([...nextTags].sort())

  if (!changedThis) {
    unchanged++
    progress.synced[l.elevator_id] = l.interes_comercial_tag
  } else if (!DRY_RUN) {
    const patch = await api('PUT', `/contacts/${l.elevator_id}?locationId=${LOC}`, JSON.stringify({ tags: nextTags }))
    if (patch.status >= 200 && patch.status < 300) {
      changed++
      l.elevator_tags = nextTags
      progress.synced[l.elevator_id] = l.interes_comercial_tag
    } else {
      errors++
      console.log(`✗ PUT ${l.nombre}: HTTP ${patch.status} ${JSON.stringify(patch.data).slice(0,160)}`)
    }
  } else {
    changed++
    console.log(`• ${l.nombre}: ${currentTags.join(', ')} → ${nextTags.join(', ')}`)
  }

  if ((i + 1) % 25 === 0) {
    if (!DRY_RUN) writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2))
    process.stdout.write(`\r${i + 1}/${leads.length} changed:${changed} unchanged:${unchanged} skipped:${skippedProgress} errors:${errors}`)
  }
  await new Promise(r => setTimeout(r, 75))
}

if (!DRY_RUN) {
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2))
  writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2))
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
  console.log(`\nBackup: ${BACKUP_PATH}`)
}
console.log(`\nDone. changed:${changed} unchanged:${unchanged} skipped:${skippedProgress} errors:${errors}`)
