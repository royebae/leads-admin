/**
 * Dentalink - Request NEW reports with custom date range via "Solicitar reportes"
 * Uses Playwright with existing PHPSESSID.
 */

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'data', 'imports', 'pagos')
mkdirSync(OUT_DIR, { recursive: true })

// Config
const DATE_FROM = '2024-01-01'
const DATE_TO = '2026-07-11'
const WEB_URL = 'https://drdiente.dentalink.cl'

const phpsessid = process.argv[2] || process.env.DENTALINK_PHPSESSID
if (!phpsessid) { console.error('Need PHPSESSID'); process.exit(1) }

const LOG_FILE = join(OUT_DIR, 'solicitar-log.txt')
const log = (msg) => { const s = `[${new Date().toISOString()}] ${msg}`; console.log(s); appendFileSync(LOG_FILE, s + '\n') }

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  locale: 'es-MX', viewport: { width: 1440, height: 900 }, acceptDownloads: true,
})
await context.addCookies([{
  name: 'PHPSESSID',
  value: phpsessid.trim(),
  domain: 'drdiente.dentalink.cl', path: '/', httpOnly: true, secure: true, sameSite: 'None',
}])
const page = await context.newPage()
const ss = (n) => page.screenshot({ path: join(OUT_DIR, `solicitar-${n}`), fullPage: true }).catch(() => {})

try {
  log(`=== Solicitando reportes personalizados ${DATE_FROM} → ${DATE_TO} ===`)
  
  // Step 1: Go to the main solicitar page
  log('1) Navigate to solicitar reportes...')
  await page.goto(`${WEB_URL}/solicitudes_reportes`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(5000)
  await ss('01-main.png')
  
  // Read the catalog
  const catalog = await page.evaluate(() => window.dataReportes)
  if (!catalog?.reportes?.length) {
    log('ERROR: No dataReportes found. Session may have expired.')
    await ss('error-nodata.png')
    process.exit(1)
  }
  
  // Find finanzas reports in the catalog
  const pagosReports = catalog.reportes.filter(r => 
    r.name === 'Pagos pacientes' || r.name === 'Pagos pacientes, detalle por acción'
  )
  log(`Found ${pagosReports.length} payment report templates in catalog`)
  
  // Find their groups/categories
  const groups = {}
  for (const g of (catalog.grupos || [])) {
    groups[g.id] = g.nombre
  }
  
  for (const r of pagosReports) {
    const groupName = groups[r.id_grupo] || `group_${r.id_grupo}`
    log(`  Report: ${r.name} (id_grupo=${groupName}, id_categoria=${r.id_categoria})`)
  }
  
  // Step 2: The UI shows report categories as clickable cards/buttons
  // Let's extract the full HTML structure to understand the React UI
  log('\n2) Analyzing page structure...')
  
  // Find all clickable elements that might open the report request form
  const clickables = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button, [role="button"], div[class*="card"], div[class*="item"], li'))
      .filter(el => el.offsetParent !== null) // visible
      .map(el => ({
        tag: el.tagName,
        text: el.innerText?.trim()?.slice(0, 50),
        type: el.type || '',
        href: el.href || '',
        id: el.id || '',
        class: (el.className || '').slice(0, 60),
        onclick: (el.getAttribute('onclick') || '').slice(0, 80),
        rect: {
          x: el.getBoundingClientRect().x,
          y: el.getBoundingClientRect().y,
          w: el.getBoundingClientRect().width,
          h: el.getBoundingClientRect().height,
        }
      }))
  })
  
  log(`Visible clickable elements: ${clickables.length}`)
  // Filter to Finanzas/Pagos related ones
  const finanzasEls = clickables.filter(el => 
    /finanzas|pago|reporte|solicitar/i.test(el.text + el.class + el.id)
  )
  finanzasEls.forEach((el, i) => {
    log(`  ${i}: <${el.tag}> "${el.text}" cls="${el.class}"`)
  })
  
  // Step 3: The "Solicitar reportes" tab should be active, showing category cards
  // Each category (Finanzas, Tratamientos, etc.) has cards for each report type
  // Click on the "Finanzas" category or the "Pagos" report directly
  log('\n3) Looking for the report request flow...')
  
  // Try clicking "Finanzas" section/card to open sub-reports
  const finanzaCards = page.locator('div[class*="card"], div[class*="item"], a, button').filter({ 
    hasText: /Finanzas|Pagos/i 
  })
  const fCount = await finanzaCards.count()
  log(`Finanzas/Pagos cards found: ${fCount}`)
  
  // Try clicking each to see what happens
  for (let fi = 0; fi < Math.min(fCount, 10); fi++) {
    const text = await finanzaCards.nth(fi).innerText()
    log(`  Card ${fi}: "${text.slice(0, 80)}"`)
    
    try {
      await finanzaCards.nth(fi).click({ timeout: 3000 })
      await page.waitForTimeout(2000)
      await ss(`02-click-${fi}.png`)
      
      // Check if URL changed or modal appeared
      const newUrl = page.url()
      const newText = await page.locator('body').innerText()
      if (newText.includes('fecha inicio') || newText.includes('Solicitar') || newText.includes('Parámetros')) {
        log(`  ✅ Opened report form!`)
        log(`  URL: ${newUrl}`)
        
        // Extract the visible form
        const formLines = newText.split('\n').filter(l => l.includes('fecha') || l.includes('Fecha') || l.includes('desde') || l.includes('hasta') || l.includes('Solicitar'))
        formLines.forEach(l => log(`  Form: ${l.trim()}`))
        
        break
      }
    } catch(e) {
      log(`  Click ${fi} failed: ${e.message}`)
    }
  }
  
  // Step 4: Take a full HTML dump for analysis
  const html = await page.content()
  writeFileSync(join(OUT_DIR, 'solicitar-page.html'), html)
  log(`\nFull HTML saved to solicitar-page.html (${html.length} chars)`)
  
  log('\nDone initial analysis. Check solicitar-page.html for the form structure.')
  
} catch(e) {
  log(`ERROR: ${e.message}`)
  await ss('99-error.png').catch(() => {})
} finally {
  log('Closing browser...')
  await browser.close()
}
