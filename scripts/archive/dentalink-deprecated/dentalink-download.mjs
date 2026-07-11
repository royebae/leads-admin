/**
 * Dentalink - Find and click report download in the React UI
 * Uses Playwright with existing PHPSESSID.
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

if (!PHPSESSID) { console.error('Usage: node dentalink-download.mjs <PHPSESSID>'); process.exit(1) }

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  locale: 'es-MX',
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
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
const screenshot = (name) => page.screenshot({ path: join(OUT_DIR, name), fullPage: true })

async function downloadReport(reportName, filename) {
  console.log(`\n=== Trying to download: ${reportName} ===`)
  
  // Try clicking the "Descargar" button by looking in multiple ways
  // Method 1: Find by report name in the visible UI
  const rows = page.locator('table tr, div[class*="row"], div[class*="fila"], div[class*="item"], li')
  const count = await rows.count()
  console.log(`  Total rows/items: ${count}`)
  
  for (let i = 0; i < count; i++) {
    const text = await rows.nth(i).innerText().catch(() => '')
    if (text.includes(reportName)) {
      console.log(`  Found row ${i} with text: "${text.slice(0, 80)}"`)
      
      // Look for a download button or anchor inside this row
      const btn = rows.nth(i).locator('button, a, span, i, svg').filter({
        hasText: /Descargar|Download/i
      }).or(rows.nth(i).locator('[download], [href*="download"], button:has(svg)'))
      
      if (await btn.count()) {
        console.log(`  Found ${await btn.count()} download elements`)
        const href = await btn.first().getAttribute('href')
        if (href) {
          console.log(`  Direct href: ${href}`)
          return { method: 'href', url: href }
        }
        
        const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(e => null)
        await btn.first().click().catch(e => console.log(`  Click error: ${e.message}`))
        await page.waitForTimeout(2000)
        
        const dl = await downloadPromise
        if (dl) {
          const path = join(OUT_DIR, filename)
          await dl.saveAs(path)
          console.log(`  ✅ Downloaded: ${filename} (${dl.suggestedFilename()})`)
          return { method: 'download', file: path }
        }
      } else {
        // Maybe the whole row is clickable
        console.log(`  No button inside row, trying row click...`)
        const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(e => null)
        await rows.nth(i).click().catch(() => {})
        await page.waitForTimeout(2000)
        const dl = await downloadPromise
        if (dl) {
          const path = join(OUT_DIR, filename)
          await dl.saveAs(path)
          console.log(`  ✅ Downloaded: ${filename}`)
          return { method: 'download', file: path }
        }
      }
    }
  }
  
  console.log(`  ❌ Could not find report: ${reportName}`)
  return null
}

try {
  console.log('1) Navigating to solicitudes_reportes...')
  await page.goto('https://drdiente.dentalink.cl/solicitudes_reportes', { 
    waitUntil: 'domcontentloaded', timeout: 60000 
  })
  await page.waitForTimeout(5000)
  await screenshot('00-loaded.png')
  
  // Check if we have dataReportes
  const reportCount = await page.evaluate(() => window.dataReportes?.reportes?.length || 0)
  const catalog = await page.evaluate(() => window.dataReportes)
  console.log(`Catalog reports: ${reportCount}`)
  
  if (catalog?.reportes?.length) {
    // Find reports we want
    const want = ['Pagos pacientes, detalle por acción', 'Pagos pacientes']
    for (const r of catalog.reportes) {
      if (want.includes(r.name)) {
        console.log(`\n  Report: ${r.name} (id=${r.info?.id}, estado=${r.info?.id_estado})`)
        if (r.info?.options) {
          const opts = typeof r.info.options === 'string' ? JSON.parse(r.info.options) : r.info.options
          console.log(`  Dates: ${opts.fecha_inicio} -> ${opts.fecha_fin}`)
        }
        // Check if it has a download URL pattern in the catalog
        const grupo = catalog.grupos?.find(g => g.id === r.id_grupo)
        console.log(`  Category/Grupo: ${grupo?.nombre || r.id_grupo}`)
      }
    }
  }
  
  // Extract all links and buttons from the page
  const elements = await page.evaluate(() => {
    const el = []
    document.querySelectorAll('a, button, [role="button"], [onclick]').forEach(e => {
      el.push({
        tag: e.tagName,
        text: e.innerText?.trim()?.slice(0, 40),
        href: e.href || '',
        class: e.className?.slice(0, 60),
        onclick: (e.getAttribute('onclick') || '')?.slice(0, 60),
        id: e.id,
        rect: e.getBoundingClientRect()
      })
    })
    return el
  })
  
  console.log(`\nInteractive elements: ${elements.length}`)
  // Show ones with "pago", "excel", "descarg" in text/href
  const relevant = elements.filter(e => 
    /pago|excel|descarg|download|solicit|reporte|accion|servicio/i.test(e.text + e.href + e.class)
  )
  console.log(`Relevant (payment/excel): ${relevant.length}`)
  relevant.slice(0, 20).forEach((e, i) => {
    console.log(`  ${i}: <${e.tag}> "${e.text}" href="${e.href?.slice(0, 80)}" class="${e.class?.slice(0, 40)}"`)
  })
  
  await screenshot('01-elements.png')
  
  // Try clicking "Historial de solicitudes" tab if it exists
  const historialTab = page.locator('button, a, [role="tab"]').filter({ hasText: /Historial|history/i })
  if (await historialTab.count()) {
    console.log('\n2) Clicking Historial tab...')
    await historialTab.first().click()
    await page.waitForTimeout(2000)
    await screenshot('02-historial.png')
    
    // Now try to find and download
    let d1 = await downloadReport('Pagos pacientes, detalle por acción', 'pagos-acciones-servicio.xlsx')
    if (!d1) d1 = await downloadReport('Pagos pacientes', 'pagos-globales.xlsx')
  }
  
  // If still not found, try "Solicitar reportes"
  if (!elements.some(e => e.text?.includes('Solicitar'))) {
    console.log('\n3) Clicking Solicitar reportes button/menu...')
    const solicitarBtn = page.locator('button, a, [role="button"]').filter({ 
      hasText: /Solicitar|Nuevo|New|Crear/i 
    }).first()
    if (await solicitarBtn.count()) {
      await solicitarBtn.click()
      await page.waitForTimeout(2000)
      await screenshot('03-solicitar-panel.png')
      
      // Check what's visible now
      const vText = await page.locator('body').innerText()
      console.log('Visible text after clicking solicitar:')
      vText.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 30).forEach((l, i) => console.log(`  ${i}: ${l}`))
    }
  }
  
} catch (err) {
  console.error('ERROR:', err.message)
  await screenshot('99-error.png').catch(() => {})
} finally {
  await browser.close()
}
