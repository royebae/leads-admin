/**
 * Analyze the catalog and find how to request new reports
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
if (!phpsessid) { console.error('Need PHPSESSID'); process.exit(1) }

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  locale: 'es-MX', viewport: { width: 1440, height: 900 },
})
await context.addCookies([{
  name: 'PHPSESSID',
  value: phpsessid.trim(),
  domain: 'drdiente.dentalink.cl', path: '/', httpOnly: true, secure: true, sameSite: 'None',
}])
const page = await context.newPage()

try {
  await page.goto('https://drdiente.dentalink.cl/solicitudes_reportes', { 
    waitUntil: 'domcontentloaded', timeout: 60000 
  })
  await page.waitForTimeout(8000)
  
  // Full catalog dump
  const catalog = await page.evaluate(() => {
    const d = window.dataReportes
    if (!d) return null
    return {
      grupos: d.grupos,
      marcas: d.marcas,
      tipos_pedido: d.tipos_pedido,
      reportes: d.reportes.map(r => ({
        id: r.id,
        name: r.name,
        descripcion: r.descripcion?.slice(0, 200),
        filename: r.filename,
        origen: r.origen,
        id_grupo: r.id_grupo,
        id_categoria: r.id_categoria,
        opciones: typeof r.opciones === 'string' ? r.opciones?.slice(0, 300) : JSON.stringify(r.opciones)?.slice(0, 300),
        columns: r.columns,
      })),
    }
  })
  
  console.log(JSON.stringify(catalog, null, 2))
  
} catch(e) {
  console.error('ERROR:', e.message)
} finally {
  await browser.close()
}
