/**
 * Descarga semanal de reportes Excel EXACTOS desde el portal Dentalink.
 *
 * Requiere credenciales web (NO el token API):
 *   DENTALINK_WEB_URL=https://TU-CLINICA.dentalink.healthatom.com  (o la URL real de login)
 *   DENTALINK_WEB_USER=...
 *   DENTALINK_WEB_PASSWORD=...
 *
 * Usage:
 *   node scripts/download-dentalink-excel-reports.mjs
 *   node scripts/download-dentalink-excel-reports.mjs --headed   # ver navegador
 *   node scripts/download-dentalink-excel-reports.mjs --discover # solo explorar UI + screenshots
 *
 * Seguridad:
 * - No envía mensajes
 * - No toca pacientes
 * - Solo descarga reportes y los guarda en data/imports/pagos/
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync, readdirSync, renameSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'data', 'imports', 'pagos')
const RUN_DIR = join(ROOT, 'data', 'imports', 'runs')
const STATE_DIR = join(ROOT, 'data', 'imports', '.browser-state')

mkdirSync(OUT_DIR, { recursive: true })
mkdirSync(RUN_DIR, { recursive: true })
mkdirSync(STATE_DIR, { recursive: true })

const WEB_URL = process.env.DENTALINK_WEB_URL || ''
const USER = process.env.DENTALINK_WEB_USER || process.env.DENTALINK_WEB_EMAIL || ''
const PASS = process.env.DENTALINK_WEB_PASSWORD || process.env.DENTALINK_WEB_PASS || ''
const args = process.argv.slice(2)
const headed = args.includes('--headed')
const discover = args.includes('--discover')
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const shotDir = join(RUN_DIR, stamp)
mkdirSync(shotDir, { recursive: true })

function mustCreds() {
  if (!WEB_URL || !USER || !PASS) {
    console.error(`
Faltan credenciales del portal Dentalink.

Exporta (o pon en ~/.hermes/.env / archivo local NO-git):
  DENTALINK_WEB_URL=https://TU-CLINICA.... 
  DENTALINK_WEB_USER=tu_usuario
  DENTALINK_WEB_PASSWORD=tu_password

Notas:
- Es el LOGIN WEB de la clínica, no el token API.
- Ideal: usuario solo-lectura / reportes.
`)
    process.exit(2)
  }
}

async function shot(page, name) {
  const p = join(shotDir, `${name}.png`)
  await page.screenshot({ path: p, fullPage: true }).catch(() => {})
  console.log('screenshot', p)
}

async function tryLogin(page) {
  console.log('Abriendo', WEB_URL)
  await page.goto(WEB_URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await shot(page, '01-landing')

  // Common login field patterns
  const userSelectors = [
    'input[name="username"]',
    'input[name="user"]',
    'input[name="email"]',
    'input[type="email"]',
    'input[name="login"]',
    'input#username',
    'input#email',
    'input[placeholder*="usuario" i]',
    'input[placeholder*="email" i]',
    'input[placeholder*="correo" i]',
  ]
  const passSelectors = [
    'input[name="password"]',
    'input[type="password"]',
    'input#password',
  ]

  let userSel = null
  for (const s of userSelectors) {
    if (await page.locator(s).first().count()) { userSel = s; break }
  }
  let passSel = null
  for (const s of passSelectors) {
    if (await page.locator(s).first().count()) { passSel = s; break }
  }

  if (!userSel || !passSel) {
    // maybe already logged in via storage state
    const body = (await page.textContent('body').catch(() => '')) || ''
    if (/reportes|pacientes|agenda|dashboard|tratamientos/i.test(body)) {
      console.log('Parece sesión ya activa')
      return true
    }
    await shot(page, '02-login-not-found')
    throw new Error('No encontré campos de login. Revisa DENTALINK_WEB_URL o usa --headed y ajustamos selectores.')
  }

  await page.fill(userSel, USER)
  await page.fill(passSel, PASS)
  await shot(page, '03-login-filled')

  const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Ingresar"), button:has-text("Entrar"), button:has-text("Login"), button:has-text("Iniciar")').first()
  if (await submit.count()) await submit.click()
  else await page.keyboard.press('Enter')

  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500)
  await shot(page, '04-after-login')

  const content = (await page.textContent('body').catch(() => '')) || ''
  if (/contraseñ|password|invalid|incorrect|error de autentic/i.test(content) && /login|ingresar|usuario/i.test(content)) {
    throw new Error('Login falló (credenciales o captcha/2FA). Revisa USER/PASS o prueba --headed.')
  }
  return true
}

async function openReports(page) {
  // Try menu navigation by text
  const candidates = [
    'text=Reportes',
    'text=Reportes Excel',
    'a:has-text("Reportes")',
    'button:has-text("Reportes")',
    '[href*="reporte"]',
    '[href*="report"]',
  ]
  for (const sel of candidates) {
    const loc = page.locator(sel).first()
    if (await loc.count()) {
      await loc.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1500)
    }
  }
  await shot(page, '05-reports-area')

  // deeper: Excel reports
  for (const sel of ['text=Reportes Excel', 'text=Excel', 'a:has-text("Excel")', 'text=Finanzas', 'text=Tratamientos']) {
    const loc = page.locator(sel).first()
    if (await loc.count()) {
      await loc.click({ timeout: 4000 }).catch(() => {})
      await page.waitForTimeout(1200)
    }
  }
  await shot(page, '06-excel-section')
}

async function downloadReportByText(page, labels, outName) {
  const downloadPromise = page.waitForEvent('download', { timeout: 120000 }).catch(() => null)

  let clicked = false
  for (const label of labels) {
    const loc = page.getByText(label, { exact: false }).first()
    if (await loc.count()) {
      console.log('Click reporte:', label)
      await loc.click({ timeout: 8000 }).catch(async () => {
        // try parent button/link
        await loc.locator('xpath=ancestor::a[1]|ancestor::button[1]').first().click().catch(() => {})
      })
      clicked = true
      break
    }
  }
  if (!clicked) {
    console.warn('No encontré botón/texto para', labels.join(' | '))
    return null
  }

  // Some UIs need a second "Descargar" / "Exportar" + filters
  for (const t of ['Descargar', 'Exportar', 'Generar', 'Excel', 'Aceptar', 'Todas', 'Todos']) {
    const b = page.getByRole('button', { name: new RegExp(t, 'i') }).first()
    if (await b.count()) {
      await b.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(800)
    }
  }

  // Try select all branches/specialists if selects exist
  const allOptions = page.locator('select')
  const n = await allOptions.count()
  for (let i = 0; i < Math.min(n, 8); i++) {
    const sel = allOptions.nth(i)
    const opts = await sel.locator('option').allTextContents().catch(() => [])
    // prefer "Todas" / "Todos"
    const idx = opts.findIndex(o => /todas|todos|all/i.test(o))
    if (idx >= 0) await sel.selectOption({ index: idx }).catch(() => {})
  }

  await page.waitForTimeout(1500)
  await shot(page, `07-download-${outName}`)

  const download = await downloadPromise
  if (!download) {
    // maybe download starts after confirm
    const d2 = await page.waitForEvent('download', { timeout: 90000 }).catch(() => null)
    if (!d2) {
      console.warn('No se capturó download para', outName)
      return null
    }
    const target = join(OUT_DIR, `${outName}-${stamp}.xlsx`)
    await d2.saveAs(target)
    console.log('Guardado', target)
    return target
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
    await tryLogin(page)
    await context.storageState({ path: join(STATE_DIR, 'state.json') })

    if (discover) {
      console.log('Modo discover: screenshots en', shotDir)
      await openReports(page)
      // dump links/buttons text for later selector tuning
      const texts = await page.locator('a,button').allTextContents()
      writeFileSync(join(shotDir, 'ui-texts.json'), JSON.stringify(texts.map(t => t.trim()).filter(Boolean).slice(0, 500), null, 2))
      result.ok = true
      result.mode = 'discover'
    } else {
      await openReports(page)

      const f1 = await downloadReportByText(page, [
        'Pagos y acciones de servicio',
        'Pagos y acciones',
        'acciones de servicio',
      ], 'pagos-y-acciones-de-servicio')
      if (f1) result.files.push(f1)

      // go back to list if needed
      await page.goBack().catch(() => {})
      await page.waitForTimeout(1000)
      await openReports(page)

      const f2 = await downloadReportByText(page, [
        'Pagos globales',
        'Pagos pacientes',
        'Pagos',
      ], 'pagos-globales')
      if (f2) result.files.push(f2)

      result.ok = result.files.length > 0
      if (!result.ok) {
        result.error = 'No se descargó ningún Excel. Corre con --headed/--discover para ajustar selectores.'
      }
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
