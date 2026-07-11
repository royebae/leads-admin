/**
 * Dentalink - scrape the historial page and find download buttons
 */

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'data', 'imports', 'pagos')
mkdirSync(OUT_DIR, { recursive: true })

const [,, phpsessid] = process.argv
const PHPSESSID = phpsessid || process.env.DENTALINK_PHPSESSID
if (!PHPSESSID) { console.error('Need PHPSESSID'); process.exit(1) }

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  locale: 'es-MX', viewport: { width: 1440, height: 900 }, acceptDownloads: true,
})
await context.addCookies([{
  name: 'PHPSESSID',
  value: PHPSESSID.trim(),
  domain: 'drdiente.dentalink.cl', path: '/', httpOnly: true, secure: true, sameSite: 'None',
}])
const page = await context.newPage()
const ss = (n) => page.screenshot({ path: join(OUT_DIR, n), fullPage: true }).catch(() => {})

try {
  // Step 1: Go to historial
  console.log('1) Navigate to historial...')
  await page.goto('https://drdiente.dentalink.cl/solicitudes_reportes/historial', { 
    waitUntil: 'domcontentloaded', timeout: 60000 
  })
  await page.waitForTimeout(4000)
  await ss('h00-historial.png')
  
  // List ALL visible text
  const bodyText = await page.locator('body').innerText()
  console.log('\nHistorial page text:')
  bodyText.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 60).forEach((l, i) => console.log(`  ${i}: ${l}`))
  
  // Find all tables
  const tables = await page.locator('table').count()
  console.log(`\nTables on page: ${tables}`)
  
  if (tables > 0) {
    // Extract ALL rows from ALL tables
    for (let ti = 0; ti < tables; ti++) {
      const rows = await page.locator('table').nth(ti).locator('tr').all()
      console.log(`\nTable ${ti}: ${rows.length} rows`)
      for (let ri = 0; ri < Math.min(rows.length, 20); ri++) {
        const cells = await rows[ri].locator('td, th').allTextContents()
        const rowText = cells.map(c => c.trim()).filter(Boolean).join(' | ')
        if (rowText) console.log(`  R${ri}: ${rowText.slice(0, 120)}`)
        
        // Check for download buttons in this row
        const btns = await rows[ri].locator('button, a, [role="button"]').all()
        for (const btn of btns) {
          const bText = (await btn.innerText()).trim().slice(0, 30)
          const href = await btn.getAttribute('href') || ''
          const cls = await btn.getAttribute('class') || ''
          console.log(`    [${bText}] href=${href.slice(0, 80)} class=${cls.slice(0, 30)}`)
          
          // Try clicking anything that says Descargar
          if (/descargar|download|excel/i.test(bText + href)) {
            console.log(`    ⬇️ Trying to click download...`)
            try {
              const dlPromise = page.waitForEvent('download', { timeout: 15000 })
              await btn.click()
              await page.waitForTimeout(1000)
              const dl = await dlPromise
              const fname = `reporte-${ti}-${ri}.xlsx`
              await dl.saveAs(join(OUT_DIR, fname))
              console.log(`    ✅ Downloaded: ${fname} (${dl.suggestedFilename()})`)
            } catch(e) {
              // Maybe it navigates to a download URL
              const url = page.url()
              if (url.includes('download')) {
                console.log(`    Navigated to: ${url}`)
                await page.goBack().catch(() => {})
              } else {
                console.log(`    Click failed: ${e.message}`)
              }
            }
          }
        }
      }
    }
  }
  
  // Also check div/span-based lists (some UIs don't use tables)
  const items = page.locator('[class*="historial"] li, [class*="solicitud"], [class*="reporte-item"], [class*="list-item"]')
  const icount = await items.count()
  console.log(`\nItems in historial: ${icount}`)
  for (let i = 0; i < Math.min(icount, 15); i++) {
    const text = await items.nth(i).innerText()
    console.log(`  ${i}: ${text.slice(0, 120)}`)
  }
  
  // Try findAll descargar buttons anywhere
  const allDescargar = page.locator('button, a').filter({ hasText: /Descargar|Download/i })
  const dc = await allDescargar.count()
  console.log(`\nAll "Descargar" buttons: ${dc}`)
  for (let i = 0; i < dc; i++) {
    const text = await allDescargar.nth(i).innerText()
    const href = await allDescargar.nth(i).getAttribute('href') || ''
    const id = await allDescargar.nth(i).getAttribute('id') || ''
    const data = await allDescargar.nth(i).getAttribute('data-id') || ''
    const onClick = await allDescargar.nth(i).getAttribute('onclick') || ''
    console.log(`  ${i}: text="${text.slice(0, 40)}" href="${href.slice(0, 80)}" id="${id}" data-id="${data}" onclick="${onClick.slice(0, 60)}"`)
    
    // Also get parent context
    const parentText = await allDescargar.nth(i).locator('xpath=ancestor::tr[1]').innerText().catch(() => 
      allDescargar.nth(i).locator('xpath=ancestor::div[1]').innerText().catch(() => '')
    )
    console.log(`  Parent: ${parentText.slice(0, 120)}`)
  }
  
  // Try findAll Excel-related buttons
  const allExcel = page.locator('button, a').filter({ hasText: /Excel|xlsx|\.xls/i })
  const ec = await allExcel.count()
  console.log(`\nAll "Excel" buttons: ${ec}`)
  for (let i = 0; i < ec; i++) {
    const text = await allExcel.nth(i).innerText()
    const href = await allExcel.nth(i).getAttribute('href') || ''
    console.log(`  ${i}: text="${text}" href="${href.slice(0, 80)}"`)
  }
  
} catch(e) {
  console.error('ERROR:', e.message)
  await ss('99-error.png').catch(() => {})
} finally {
  await browser.close()
}
