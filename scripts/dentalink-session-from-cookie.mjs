/**
 * Continúa automatización Dentalink con sesión que TÚ ya autenticaste.
 *
 * Flujo:
 *  1) Entras a https://drdiente.dentalink.cl en tu navegador
 *  2) Resuelves captcha + login
 *  3) DevTools → Application → Cookies → copia PHPSESSID
 *  4) node scripts/dentalink-session-from-cookie.mjs --phpsessid=XXXX
 *     o:  DENTALINK_PHPSESSID=XXXX node scripts/dentalink-session-from-cookie.mjs
 *
 * Luego descarga reportes Excel con esa cookie (sin captcha de nuevo).
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'data', 'imports', 'pagos')
const STATE_DIR = join(ROOT, 'data', 'imports', '.browser-state')
const RUN_DIR = join(ROOT, 'data', 'imports', 'runs')
mkdirSync(OUT_DIR, { recursive: true })
mkdirSync(STATE_DIR, { recursive: true })
mkdirSync(RUN_DIR, { recursive: true })

const WEB_URL = (process.env.DENTALINK_WEB_URL || 'https://drdiente.dentalink.cl').replace(/\/$/, '')
const args = process.argv.slice(2)
const sessArg = args.find(a => a.startsWith('--phpsessid='))
const PHPSESSID = (sessArg ? sessArg.split('=')[1] : '') || process.env.DENTALINK_PHPSESSID || ''
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const shotDir = join(RUN_DIR, `cookie-${stamp}`)
mkdirSync(shotDir, { recursive: true })

if (!PHPSESSID || PHPSESSID.length < 8) {
  console.error(`
Necesito tu cookie de sesión (después de que TÚ hagas login+captcha).

Pasos:
  1. Abre https://drdiente.dentalink.cl
  2. Ingresa y resuelve el captcha
  3. F12 → Application/Aplicación → Cookies → drdiente.dentalink.cl
  4. Copia el valor de PHPSESSID
  5. Pégalo aquí en Telegram o corre:
       node scripts/dentalink-session-from-cookie.mjs --phpsessid=TU_VALOR
`)
  process.exit(2)
}

async function shot(page, name) {
  const p = join(shotDir, `${name}.png`)
  await page.screenshot({ path: p, fullPage: true }).catch(() => {})
  console.log('screenshot', p)
}

async function downloadByLabels(page, labels, outName) {
  const downloadPromise = page.waitForEvent('download', { timeout: 120000 }).catch(() => null)
  let clicked = false
  for (const label of labels) {
    const loc = page.getByText(label, { exact: false }).first()
    if (await loc.count()) {
      console.log('Click', label)
      await loc.click({ timeout: 8000 }).catch(async () => {
        await loc.locator('xpath=ancestor::a[1]|ancestor::button[1]').first().click().catch(() => {})
      })
      clicked = true
      break
    }
  }
  if (!clicked) {
    console.warn('No encontré', labels.join(' | '))
    await shot(page, `miss-${outName}`)
    return null
  }
  for (const t of ['Descargar', 'Exportar', 'Generar', 'Aceptar', 'Excel', 'Todas', 'Todos']) {
    const b = page.getByRole('button', { name: new RegExp(t, 'i') }).first()
    if (await b.count()) {
      await b.click({ timeout: 2500 }).catch(() => {})
      await page.waitForTimeout(400)
    }
  }
  // all branches / specialists if selects
  const selects = page.locator('select')
  const n = await selects.count()
  for (let i = 0; i < Math.min(n, 10); i++) {
    const sel = selects.nth(i)
    const opts = await sel.locator('option').allTextContents().catch(() => [])
    const idx = opts.findIndex(o => /todas|todos|all/i.test(o))
    if (idx >= 0) await sel.selectOption({ index: idx }).catch(() => {})
  }
  let download = await downloadPromise
  if (!download) download = await page.waitForEvent('download', { timeout: 90000 }).catch(() => null)
  if (!download) {
    await shot(page, `nodl-${outName}`)
    return null
  }
  const target = join(OUT_DIR, `${outName}-${stamp}.xlsx`)
  await download.saveAs(target)
  console.log('Guardado', target)
  return target
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  acceptDownloads: true,
  locale: 'es-MX',
  viewport: { width: 1440, height: 900 },
})
await context.addCookies([
  {
    name: 'PHPSESSID',
    value: PHPSESSID.trim(),
    domain: 'drdiente.dentalink.cl',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'None',
  },
])

const page = await context.newPage()
const result = { started_at: new Date().toISOString(), files: [], ok: false, error: null }

try {
  await page.goto(`${WEB_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  await shot(page, '01-with-cookie')
  const url = page.url()
  const body = (await page.locator('body').innerText().catch(() => '')) || ''
  if (url.includes('/sessions/login') || /Bienvenido[\s\S]*Usuario[\s\S]*Contraseña/i.test(body)) {
    throw new Error('Cookie inválida o expirada. Vuelve a loguearte y pásame un PHPSESSID fresco.')
  }
  console.log('Sesión válida →', url)

  // persist storage for reuse
  await context.storageState({ path: join(STATE_DIR, 'state.json') })
  writeFileSync(join(STATE_DIR, 'phpsessid.txt'), PHPSESSID.trim())
  console.log('storageState guardado (reutilizable hasta que expire)')

  // try report paths
  const paths = ['/reportes', '/reportes/excel', '/reportesExcel', '/finanzas', '/reportes_excel']
  for (const p of paths) {
    await page.goto(`${WEB_URL}${p}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
    await page.waitForTimeout(1200)
    const t = (await page.locator('body').innerText().catch(() => '')) || ''
    if (/excel|pagos|reporte/i.test(t) && !url.includes('login')) {
      console.log('Vista posible:', p)
      await shot(page, `view-${p.replace(/\W+/g, '_')}`)
    }
  }

  // menu crawl
  for (const label of ['Reportes', 'Finanzas', 'Tratamientos', 'Reportes Excel', 'Excel']) {
    const loc = page.getByText(label, { exact: false }).first()
    if (await loc.count()) {
      await loc.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(800)
    }
  }
  await shot(page, '02-reports')
  const texts = await page.locator('a,button,h1,h2,h3,span,td,li').allTextContents()
  writeFileSync(join(shotDir, 'ui-texts.json'), JSON.stringify(texts.map(t => t.trim()).filter(Boolean).slice(0, 1000), null, 2))

  const f1 = await downloadByLabels(page, [
    'Pagos y acciones de servicio',
    'Pagos y acciones',
    'acciones de servicio',
  ], 'pagos-y-acciones-de-servicio')
  if (f1) result.files.push(f1)

  const f2 = await downloadByLabels(page, [
    'Pagos globales',
    'Pagos pacientes',
  ], 'pagos-globales')
  if (f2) result.files.push(f2)

  result.ok = result.files.length > 0
  if (!result.ok) {
    result.error = 'Sesión OK pero no localicé/descargué los Excel. Reviso UI con screenshots.'
  }
} catch (err) {
  result.error = err.message
  console.error('ERROR', err.message)
  await shot(page, '99-error')
} finally {
  result.finished_at = new Date().toISOString()
  writeFileSync(join(OUT_DIR, 'last-download.json'), JSON.stringify(result, null, 2))
  writeFileSync(join(shotDir, 'result.json'), JSON.stringify(result, null, 2))
  await browser.close()
}

console.log(JSON.stringify(result, null, 2))
process.exit(result.ok ? 0 : 1)
