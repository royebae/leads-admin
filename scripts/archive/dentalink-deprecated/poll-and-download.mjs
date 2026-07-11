/**
 * Poll estado and download completed reports
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'data', 'imports', 'pagos')
mkdirSync(OUT_DIR, { recursive: true })

const [,, phpsessid] = process.argv
const PHPSESSID = phpsessid || process.env.DENTALINK_PHPSESSID
if (!PHPSESSID) { console.error('Need PHPSESSID'); process.exit(1) }

// Poll settings
const POLL_INTERVAL_MS = 30000  // 30 seconds
const MAX_POLLS = 40  // up to 20 minutes total wait

async function checkSolicitudes(phpsessid) {
  const response = await fetch(`https://drdiente.dentalink.cl/solicitudes_reportes/historial`, {
    headers: { 'Cookie': `PHPSESSID=${phpsessid}` }
  })
  const html = await response.text()
  
  // Parse the dataSolicitudes from HTML
  const match = html.match(/window\.dataSolicitudes\s*=\s*(\[[\s\S]*?\]);/)
  if (!match) return []
  return JSON.parse(match[1])
}

async function downloadReport(solicitud) {
  const id = solicitud.id
  const nombre = solicitud.nombre
  const s3path = solicitud.s3_path
  const bucket = solicitud.s3_bucket
  const estado = solicitud.id_estado
  const options = JSON.parse(solicitud.options || '{}')
  
  console.log(`ID ${id}: ${nombre} (estado ${estado}, s3_path=${s3path || 'none'})`)
  console.log(`  Options: ${JSON.stringify(options).slice(0, 100)}`)
  
  if (estado !== 3 || !s3path) return false
  
  // Generate output filename
  let outName
  if (nombre === 'finanzas.pagos') outName = 'pagos-globales'
  else if (nombre === 'finanzas.pagos_detalle_accion') outName = 'pagos-acciones-servicio'
  else outName = nombre.replace(/\./g, '-')
  
  // Try direct S3 download first
  if (s3path && bucket) {
    const s3Url = `https://${bucket}.s3.amazonaws.com/${s3path}`
    console.log(`  Downloading from S3: ${s3Url}`)
    
    const response = await fetch(s3Url)
    if (response.ok) {
      const buffer = await response.arrayBuffer()
      const filePath = join(OUT_DIR, `${outName}-full.xlsx`)
      writeFileSync(filePath, Buffer.from(buffer))
      console.log(`  ✅ Saved: ${filePath}`)
      return true
    } else {
      console.log(`  S3 direct failed (${response.status}), trying via browser...`)
    }
  }
  
  // Fallback: use Playwright to click the download button in historial
  console.log(`  Using Playwright to download ID ${id}...`)
  const browser = await chromium.launch({
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const context = await browser.newContext({
      locale: 'es-MX', viewport: { width: 1440, height: 900 }, acceptDownloads: true,
    })
    await context.addCookies([{
      name: 'PHPSESSID', value: phpsessid.trim(),
      domain: 'drdiente.dentalink.cl', path: '/', httpOnly: true, secure: true, sameSite: 'None',
    }])
    const page = await context.newPage()
    await page.goto('https://drdiente.dentalink.cl/solicitudes_reportes/historial', {
      waitUntil: 'domcontentloaded', timeout: 60000
    })
    await page.waitForTimeout(3000)
    
    // Find the row with this solicitud ID and click Descargar
    const rows = page.locator('table tr, div[class*="row"]')
    const count = await rows.count()
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).innerText()
      if (text.includes(` ${id}\t`) || text.includes(`\n${id}\n`)) {
        console.log(`  Found row ${i} for ID ${id}: "${text.slice(0, 60)}"`)
        const downloadBtn = rows.nth(i).locator('button, a').filter({ hasText: /Descargar/i })
        if (await downloadBtn.count()) {
          const dlPromise = page.waitForEvent('download', { timeout: 30000 })
          await downloadBtn.first().click()
          await page.waitForTimeout(2000)
          const dl = await dlPromise
          const filePath = join(OUT_DIR, `${outName}-full.xlsx`)
          await dl.saveAs(filePath)
          console.log(`  ✅ Downloaded via Playwright: ${filePath}`)
          return true
        }
        break
      }
    }
  } finally {
    await browser.close()
  }
  return false
}

console.log('=== Polling Dentalink reports ===')
console.log(`Looking for reports 168 (finanzas.pagos) and 169 (finanzas.pagos_detalle_accion)`)

let found168 = false, found169 = false

for (let poll = 1; poll <= MAX_POLLS; poll++) {
  console.log(`\n--- Poll ${poll} ---`)
  
  const solicitudes = await checkSolicitudes(PHPSESSID)
  console.log(`Total solicitudes on page: ${solicitudes.length}`)
  
  for (const s of solicitudes) {
    const id = parseInt(s.id)
    if (id === 168) {
      console.log('  ID 168 (finanzas.pagos):')
      found168 = await downloadReport(s) || found168
    }
    if (id === 169) {
      console.log('  ID 169 (finanzas.pagos_detalle_accion):')
      found169 = await downloadReport(s) || found169
    }
  }
  
  if (found168 && found169) {
    console.log('\n✅ Both reports downloaded!')
    process.exit(0)
  }
  
  if (poll < MAX_POLLS) {
    console.log(`\nWaiting ${POLL_INTERVAL_MS/1000}s before next poll...`)
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }
}

console.log('Max polls reached. Reports may still be generating.')
process.exit(1)
