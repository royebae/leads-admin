#!/usr/bin/env node
/**
 * log-contact.mjs — Registra un intento de contacto en la base de leads.
 *
 * Uso:
 *   node scripts/log-contact.mjs --id=<lead_id> --canal=whatsapp --resultado=enviado
 *   node scripts/log-contact.mjs --id=<lead_id> --canal=email --resultado=respondio --notas="Pidio info"
 *
 * Campos de resultado: enviado, respondio, no_respondio, agendo, no_interesado, opt_out
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_PATH = join(ROOT, 'data', 'leads-data.json')
const SRC_PATH = join(ROOT, 'src', 'data', 'leads.js')

const args = process.argv.slice(2)
const id = parseInt(args.find(a => a.startsWith('--id='))?.split('=')[1] || '0', 10)
const canal = args.find(a => a.startsWith('--canal='))?.split('=')[1] || ''
const resultado = args.find(a => a.startsWith('--resultado='))?.split('=')[1] || ''
const notas = args.find(a => a.startsWith('--notas='))?.split('=')[1] || ''
const campaign = args.find(a => a.startsWith('--campaign='))?.split('=')[1] || ''
const listar = args.includes('--list')

if (listar) {
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  const leads = data.leads
  console.log('=== HISTORIAL DE CONTACTO ===')
  for (const l of leads) {
    if (l.contact_history?.length > 0 || l.opt_out) {
      console.log(`\n[${l.id}] ${l.nombre}  ${l.opt_out ? '🔕 OPT-OUT' : ''}`)
      for (const h of (l.contact_history || [])) {
        console.log(`  ${h.contacted_at} | ${h.canal} | ${h.resultado}${h.campaign ? ` | campaña: ${h.campaign}` : ''}${h.notas ? ` | ${h.notas}` : ''}`)
      }
    }
  }
  process.exit(0)
}

if (!id || !canal || !resultado) {
  console.error('Uso: node scripts/log-contact.mjs --id=<id> --canal=<canal> --resultado=<resultado> [--notas=...] [--campaign=...]')
  console.error('Canales: whatsapp, email, llamada, sms')
  console.error('Resultados: enviado, respondio, no_respondio, agendo, no_interesado, opt_out')
  console.error('Para listar historial: node scripts/log-contact.mjs --list')
  process.exit(1)
}

const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
const lead = data.leads.find(l => l.id === id)
if (!lead) { console.error(`Lead ${id} no encontrado`); process.exit(1) }

if (!lead.contact_history) lead.contact_history = []

if (resultado === 'opt_out') {
  lead.opt_out = true
}

lead.contact_history.push({
  contacted_at: new Date().toISOString(),
  canal,
  resultado,
  campaign: campaign || undefined,
  notas: notas || undefined,
})

// Update src/data/leads.js
const jsContent = `// Leads data — generated from data/leads-data.json
// Do NOT edit directly. Edit source in data/leads-data.json
const leadsData = ${JSON.stringify(data)};
export default leadsData;
`

writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
writeFileSync(SRC_PATH, jsContent)

console.log(`✅ Contacto registrado para ${lead.nombre} (ID ${id})`)
console.log(`   Canal: ${canal} | Resultado: ${resultado}`)
if (lead.opt_out) console.log('   🔕 Opt-out activado')
