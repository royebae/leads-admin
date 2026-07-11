/**
 * Dump ALL available global data from Dentalink solicitudes_reportes pages
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'data', 'imports', 'pagos')
mkdirSync(OUT_DIR, { recursive: true })

const phpsessid = process.argv[2]
if (!phpsessid) { process.exit(1) }

const browser = await chromium.launch({
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({ locale: 'es-MX', viewport: { width: 1440, height: 900 } })
await context.addCookies([{
  name: 'PHPSESSID', value: phpsessid.trim(),
  domain: 'drdiente.dentalink.cl', path: '/', httpOnly: true, secure: true, sameSite: 'None',
}])
const page = await context.newPage()

try {
  // Visit main report page
  await page.goto('https://drdiente.dentalink.cl/solicitudes_reportes', { 
    waitUntil: 'domcontentloaded', timeout: 60000 
  })
  await page.waitForTimeout(8000)
  
  // Dump ALL window variables that look relevant
  const globals1 = await page.evaluate(() => {
    const keys = Object.keys(window).filter(k => 
      /dataReporte|dataSolicitud|reporte|pago|finanza|data.*report/i.test(k)
    )
    const result = {}
    for (const key of keys) {
      try {
        const val = window[key]
        if (typeof val === 'object' && val !== null) {
          result[key] = JSON.parse(JSON.stringify(val)).toString().slice(0, 1000)
        } else if (typeof val !== 'function') {
          result[key] = String(val).slice(0, 500)
        }
      } catch(e) { result[key] = `[error: ${e.message}]` }
    }
    return result
  })
  
  console.log('=== Window globals on solicitudes_reportes ===')
  for (const [k, v] of Object.entries(globals1)) {
    console.log(`\n${k}:`)
    console.log(v)
  }
  
  // Also dump any React/Redux store
  const reactState = await page.evaluate(() => {
    // Check for React internals
    const root = document.getElementById('root')
    if (!root) return 'no root'
    const fiber = Object.keys(root).find(k => k.startsWith('__reactFiber'))
    if (!fiber) return 'no react fiber'
    return 'React root found'
  })
  console.log(`\nReact state: ${reactState}`)
  
  // Now go to historial
  await page.goto('https://drdiente.dentalink.cl/solicitudes_reportes/historial', { 
    waitUntil: 'domcontentloaded', timeout: 60000 
  })
  await page.waitForTimeout(5000)
  
  const globals2 = await page.evaluate(() => {
    const keys = Object.keys(window).filter(k => 
      /dataReporte|dataSolicitud|reporte|pago|finanza|data.*report/i.test(k)
    )
    const result = {}
    for (const key of keys) {
      try {
        const val = window[key]
        if (typeof val === 'object' && val !== null) {
          result[key] = JSON.parse(JSON.stringify(val)).toString().slice(0, 1000)
        } else if (typeof val !== 'function') {
          result[key] = String(val).slice(0, 500)
        }
      } catch(e) { result[key] = `[error: ${e.message}]` }
    }
    return result
  })
  
  console.log('\n=== Window globals on historial ===')
  for (const [k, v] of Object.entries(globals2)) {
    console.log(`\n${k}:`)
    console.log(v)
  }
  
} catch(e) {
  console.error('ERROR:', e.message)
} finally {
  await browser.close()
}
