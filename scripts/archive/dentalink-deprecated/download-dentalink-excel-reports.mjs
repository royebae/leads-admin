/**
 * Descarga semanal de reportes Excel EXACTOS desde portal Dentalink.
 *
 * Env:
 *   DENTALINK_WEB_URL=https://drdiente.dentalink.cl
 *   DENTALINK_WEB_USER=...
 *   DENTALINK_WEB_PASSWORD=...
 *   LD_LIBRARY_PATH=... (libs locales de chromium si aplica)
 *
 * Usage:
 *   node scripts/download-dentalink-excel-reports.mjs
 *   node scripts/download-dentalink-excel-reports.mjs --discover
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'data', 'imports', 'pagos')
const RUN_DIR = join(ROOT, 'data', 'imports', 'runs')
const STATE_DIR = join(ROOT, 'data', 'imports', '.browser-state')
mkdirSync(OUT_DIR, { recursive: true })
mkdirSync(RUN_DIR, { recursive: true })
mkdirSync(STATE_DIR, { recursive: true })

const WEB_URL = (process.env.DENTALINK_WEB_URL || 'https://drdiente.dentalink.cl').replace(/\/$/, '')
const USER = process.env.DENTALINK_WEB_USER || process.env.DENTALINK_WEB_EMAIL || ''
const PASS = process.env.DENTALINK_WEB_PASSWORD || process.env.DENTALINK_WEB_PASS || ''
const args = process.argv.slice(2)
const headed = args.includes('--headed')
const discover = args.includes('--discover')
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const shotDir = join(RUN_DIR, stamp)
mkdirSync(shotDir, { recursive: true })

function mustCreds() {
  if (!USER || !PASS) {
    console.error('Faltan DENTALINK_WEB_USER / DENTALINK_WEB_PASSWORD')
    process.exit(2)
  }
}

async function shot(page, name) {
  const p = join(shotDir, `${name}.png`)
  await page.screenshot({ path: p, fullPage: true }).catch(() => {})
  console.log('screenshot', p)
}

async function waitLoginForm(page) {
  // React auth app
  await page.goto(`${WEB_URL}/sessions/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('input[name="user"], input[name="password"]', { timeout: 60000 })
  // give turnstile a moment
  await page.waitForTimeout(3000)
}

async function login(page) {
  await waitLoginForm(page)
  await shot(page, '01-login')

  const user = page.locator('input[name="user"]').first()
  const pass = page.locator('input[name="password"]').first()
  await user.fill('')
  await user.type(USER, { delay: 30 })
  await pass.fill('')
  await pass.type(PASS, { delay: 30 })
  await shot(page, '02-filled')

  // Wait for Cloudflare Turnstile token if present (best-effort)
  for (let i = 0; i < 20; i++) {
    const token = await page.locator('input[name="cf-turnstile-response"]').inputValue().catch(() => '')
    if (token && token.length > 10) {
      console.log('Turnstile token OK')
      break
    }
    await page.waitForTimeout(1000)
  }

  const btn = page.getByRole('button', { name: /ingresar|entrar|login/i }).first()
  if (await btn.count()) await btn.click()
  else await page.keyboard.press('Enter')

  // Wait either success redirect or error message
  await Promise.race([
    page.waitForURL(url => !String(url).includes('/sessions/login'), { timeout: 45000 }).catch(() => null),
    page.waitForSelector('text=/credenciales|incorrect|problema|error/i', { timeout: 45000 }).catch(() => null),
  ])
  await page.waitForTimeout(2000)
  await shot(page, '03-after-login')

  const url = page.url()
  const body = (await page.locator('body').innerText().catch(() => '')) || ''
  if (url.includes('/sessions/login') || /credenciales son incorrectas|incorrectas/i.test(body)) {
    throw new Error('Login falló: credenciales incorrectas o captcha/2FA bloqueó el ingreso')
  }
  if (/validar|a2f|two.?factor|codigo/i.test(body) && /sessions\/validate/i.test(url)) {
    throw new Error('Login requiere 2FA. Necesitamos desactivar 2FA en este usuario o un código automático.')
  }
  console.log('Login OK →', url)
  return true
}

async function openExcelReports(page) {
  // Direct paths to try after login
  const paths = [
    '/reportes',
    '/reportes/excel',
    '/reportesExcel',
    '/excel_reports',
    '/reportes_excel',
    '/finanzas/reportes',
    '/admin/reportes',
  ]
  for (const p of paths) {
    await page.goto(`${WEB_URL}${p}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
    await page.waitForTimeout(1500)
    const t = (await page.locator('body').innerText().catch(() => '')) || ''
    if (/pagos|excel|reporte/i.test(t) && !/login|ingresar/i.test(page.url())) {
      console.log('Opened', p)
      await shot(page, `reports-${p.replace(/\W+/g, '_')}`)
      return true
    }
  }

  // Menu navigation
  for (const label of ['Reportes', 'Finanzas', 'Tratamientos', 'Más', 'Administración']) {
    const loc = page.getByText(label, { exact: false }).first()
    if (await loc.count()) {
      await loc.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(800)
    }
  }
  for (const label of ['Reportes Excel', 'Excel', 'Reportes']) {
    const loc = page.getByText(label, { exact: false }).first()
    if (await loc.count()) {
      await loc.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(1000)
    }
  }
  await shot(page, '04-reports-menu')
  return true
}

async function downloadByLabels(page, labels, outName) {
  // Prefer selects all branches/specialists
  const selects = page.locator('select')
  const n = await selects.count()
  for (let i = 0; i < Math.min(n, 10); i++) {
    const sel = selects.nth(i)
    const opts = await sel.locator('option').allTextContents().catch(() => [])
    const idx = opts.findIndex(o => /todas|todos|all/i.test(o))
    if (idx >= 0) await sel.selectOption({ index: idx }).catch(() => {})
  }

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
    // try link contains
    for (const label of labels) {
      const a = page.locator(`a:has-text("${label.split(' ')[0]}")`).first()
      if (await a.count()) {
        await a.click().catch(() => {})
        clicked = true
        break
      }
    }
  }
  if (!clicked) {
    console.warn('No encontré', labels.join(' | '))
    await shot(page, `miss-${outName}`)
    return null
  }

  for (const t of ['Descargar', 'Exportar', 'Generar', 'Aceptar', 'Excel']) {
    const b = page.getByRole('button', { name: new RegExp(t, 'i') }).first()
    if (await b.count()) {
      await b.click({ timeout: 2500 }).catch(() => {})
      await page.waitForTimeout(500)
    }
  }

  let download = await downloadPromise
  if (!download) download = await page.waitForEvent('download', { timeout: 90000 }).catch(() => null)
  if (!download) {
    console.warn('Sin archivo descargado para', outName)
    await shot(page, `nodl-${outName}`)
    return null
  }
  const target = join(OUT_DIR, `${outName}-${stamp}.xlsx`)
  await download.saveAs(target)
  console.log('Guardado', target)
  return target
}

async function main() {
  mustCreds()
  const browser = await chromium.launch({
    headless: !headed,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: 'es-MX',
    viewport: { width: 1440, height: 900 },
    storageState: existsSync(join(STATE_DIR, 'state.json')) ? join(STATE_DIR, 'state.json') : undefined,
  })
  const page = await context.newPage()
  const result = {
    started_at: new Date().toISOString(),
    web_url: WEB_URL,
    files: [],
    ok: false,
    error: null,
  }

  try {
    // If storage state still on login, re-login
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2000)
    if (page.url().includes('/sessions/login') || await page.locator('input[name="user"]').count()) {
      await login(page)
      await context.storageState({ path: join(STATE_DIR, 'state.json') })
    } else {
      console.log('Sesión existente', page.url())
    }

    if (discover) {
      await openExcelReports(page)
      const texts = await page.locator('a,button,h1,h2,h3,span').allTextContents()
      writeFileSync(
        join(shotDir, 'ui-texts.json'),
        JSON.stringify(texts.map(t => t.trim()).filter(Boolean).slice(0, 800), null, 2),
      )
      result.ok = true
      result.mode = 'discover'
    } else {
      await openExcelReports(page)
      const f1 = await downloadByLabels(page, [
        'Pagos y acciones de servicio',
        'Pagos y acciones',
        'acciones de servicio',
      ], 'pagos-y-acciones-de-servicio')
      if (f1) result.files.push(f1)

      await openExcelReports(page)
      const f2 = await downloadByLabels(page, [
        'Pagos globales',
        'Pagos pacientes',
        'Pagos',
      ], 'pagos-globales')
      if (f2) result.files.push(f2)

      result.ok = result.files.length > 0
      if (!result.ok) result.error = 'No se descargó ningún Excel (login OK? UI distinta?)'
    }
  } catch (err) {
    result.error = err.message
    console.error('ERROR', err.message)
    await shot(page, '99-error')
  } finally {
    result.finished_at = new Date().toISOString()
    writeFileSync(join(shotDir, 'result.json'), JSON.stringify(result, null, 2))
    writeFileSync(join(OUT_DIR, 'last-download.json'), JSON.stringify(result, null, 2))
    await browser.close()
  }

  console.log('══════════════════════════════════')
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

main()
