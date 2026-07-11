/**
 * Direct download of Dentalink report Excel files via Playwright
 * 
 * Uses the dataReportes catalog to find and download reports.
 * Run with the saved PHPSESSID via LD_LIBRARY_PATH.
 */

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'data', 'imports', 'pagos')
const STATE_DIR = join(ROOT, 'data', 'imports', '.browser-state')
mkdirSync(OUT_DIR, { recursive: true })

const PHPSESSID = process.argv.find(a => a.startsWith('--phpsessid='))?.split('=')[1] 
  || process.env.DENTALINK_PHPSESSID 
  || (() => { try { return require('fs').readFileSync(join(STATE_DIR, 'phpsessid.txt'), 'utf-8').trim() } catch(e) { return '' } })();

if (!PHPSESSID) {
  console.error('Necesito PHPSESSID. Pasa --phpsessid=X o DENTALINK_PHPSESSID=X')
  process.exit(1)
}

console.log('=== Dentalink Excel Direct Download ===')
console.log(`PHPSESSID: ${PHPSESSID.slice(0, 12)}...`)

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  locale: 'es-MX',
  viewport: { width: 1440, height: 900 },
})
await context.addCookies([{
  name: 'PHPSESSID',
  value: PHPSESSID.trim(),
  domain: 'drdiente.dentalink.cl',
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'None',
}])

const page = await context.newPage()

try {
  // Go directly to solicitudes_reportes (React app with catalog)
  console.log('\n1) Navigate to solicitudes_reportes...')
  await page.goto('https://drdiente.dentalink.cl/solicitudes_reportes', { 
    waitUntil: 'domcontentloaded', timeout: 60000 
  })
  await page.waitForTimeout(5000)
  
  // Wait for React app to render - look for dataReportes or a known element
  try {
    await page.waitForFunction(() => window.dataReportes !== undefined, { timeout: 15000 })
    console.log('   dataReportes found on page')
  } catch {
    console.log('   dataReportes not found, checking screenshot...')
  }
  
  // Read the catalog
  const catalog = await page.evaluate(() => window.dataReportes)
  console.log('Catalog reports:', catalog?.reportes?.length || 0)
  
  // Find pagos reports
  const targetNames = ['Pagos pacientes, detalle por acción', 'Pagos pacientes']
  const pagosReports = (catalog?.reportes || []).filter(r => 
    targetNames.includes(r.name) && r.info?.id
  )
  
  console.log(`\n2) Found ${pagosReports.length} payment reports:`)
  for (const r of pagosReports) {
    console.log(`   - ${r.name} (ID: ${r.info.id}, estado: ${r.info.id_estado})`)
    const opts = typeof r.info?.options === 'string' 
      ? JSON.parse(r.info.options) 
      : r.info?.options || {}
    console.log(`     Opciones: fecha=${opts.fecha_inicio || '?'} -> ${opts.fecha_fin || '?'}`)
  }
  
  // Look for download buttons in the React UI
  // The catalog tells us the report info - now we need to interact with the UI
  console.log('\n3) Looking for report download interface...')
  
  // Wait for the React app to render
  await page.waitForSelector('[class*="reporte"]', { timeout: 10000 }).catch(() => {
    console.log('No reporte class found, trying other selectors...')
  })
  
  // Take a screenshot to understand the UI layout
  await page.screenshot({ path: join(OUT_DIR, 'reportes-ui.png'), fullPage: true })
  console.log('Screenshot saved to reportes-ui.png')
  
  // Read all visible text to understand what's on screen
  const allText = await page.locator('body').innerText()
  const lines = allText.split('\n').map(l => l.trim()).filter(Boolean)
  console.log(`\nVisible UI text (first 40 lines):`)
  lines.slice(0, 40).forEach((l, i) => console.log(`  ${i}: ${l}`))
  
  // Try to find download buttons
  const downloadBtns = await page.locator('button').filter({ hasText: /Descargar|Download|Excel/i }).count()
  console.log(`\nDownload buttons found: ${downloadBtns}`)
  
  // Click "Descargar" for each report we found
  // If the report is already generated (id_estado 3), there should be a download button
  for (const r of pagosReports) {
    console.log(`\n   Looking for download of ${r.name}...`)
    
    // Try finding the download button by looking for it near the report name
    const reportRow = page.locator('tr, [class*="fila"], [class*="row"]').filter({ 
      hasText: r.name 
    }).first()
    
    if (await reportRow.count()) {
      const downloadBtn = reportRow.locator('button, a').filter({ 
        hasText: /Descargar|Download|Excel/i 
      })
      
      if (await downloadBtn.count()) {
        console.log('   Found download button!')
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 })
        await downloadBtn.first().click()
        await page.waitForTimeout(1000)
        const download = await downloadPromise
        
        const fileName = r.name.includes('detalle') 
          ? 'pagos-acciones-servicio.xlsx' 
          : 'pagos-globales.xlsx'
        const filePath = join(OUT_DIR, fileName)
        await download.saveAs(filePath)
        console.log(`   ✅ Saved: ${fileName} (${download.suggestedFilename()})`)
      } else {
        console.log('   No download button in this row')
      }
    } else {
      console.log(`   Report row not found for: ${r.name}`)
    }
  }
  
  console.log('\nDone!')
} catch (err) {
  console.error('ERROR:', err.message)
  await page.screenshot({ path: join(OUT_DIR, 'error.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}
