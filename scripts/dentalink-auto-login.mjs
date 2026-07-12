#!/usr/bin/env node
/**
 * dentalink-auto-login.mjs
 * 
 * Automatiza el login en Dentalink Web y extrae el PHPSESSID.
 * No requiere Playwright ni navegador — usa HTTP directo.
 * 
 * Uso: node scripts/dentalink-auto-login.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import https from 'https'
import { URL } from 'url'

const ENV_PATH = '.env.dentalink-web'
const ROOT = new URL('.', import.meta.url).pathname

function readEnv() {
  const raw = readFileSync(ENV_PATH, 'utf8')
  const env = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i > 0) {
      let val = trimmed.slice(i + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1)
      env[trimmed.slice(0, i).trim()] = val
    }
  }
  return env
}

async function request(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers,
      rejectUnauthorized: false,
    }
    const req = https.request(opts, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data,
      }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function main() {
  const env = readEnv()
  const url = (env.DENTALINK_WEB_URL || 'https://drdiente.dentalink.cl').replace(/\/+$/, '')
  const user = env.DENTALINK_WEB_USER
  const pass = env.DENTALINK_WEB_PASSWORD

  if (!user || !pass) {
    console.error('❌ Faltan DENTALINK_WEB_USER y/o DENTALINK_WEB_PASSWORD en .env.dentalink-web')
    process.exit(1)
  }

  console.log('🌐 Solicitando página de login...')

  // Step 1: Get login page and initial PHPSESSID + CSRF token
  const loginPage = await request('GET', `${url}/users/sign_in`, {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  })

  // Extract PHPSESSID from cookies
  const setCookies = loginPage.headers['set-cookie'] || []
  const cookieArr = Array.isArray(setCookies) ? setCookies : [setCookies]
  let phpsessid = ''
  for (const c of cookieArr) {
    const match = c.match(/PHPSESSID=([^;]+)/)
    if (match) { phpsessid = match[1]; break }
  }
  if (!phpsessid) {
    console.error('❌ No se pudo obtener PHPSESSID inicial')
    process.exit(1)
  }

  // Extract CSRF token
  const csrfMatch = loginPage.body.match(/name="authenticity_token"[^>]*value="([^"]+)"/)
  const csrfToken = csrfMatch ? csrfMatch[1] : ''
  if (!csrfToken) {
    console.log('⚠️  No se encontró CSRF token, intentando login sin él...')
  } else {
    console.log('🔑 CSRF token obtenido')
  }

  // Step 2: POST login form
  const cookies = [`PHPSESSID=${phpsessid}`]
  const formData = new URLSearchParams()
  formData.append('user[email]', user)
  formData.append('user[password]', pass)
  if (csrfToken) formData.append('authenticity_token', csrfToken)
  formData.append('commit', 'Iniciar sesión')

  console.log('🔐 Enviando credenciales...')

  const loginResult = await request('POST', `${url}/users/sign_in`, {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': cookies.join('; '),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': `${url}/users/sign_in`,
  }, formData.toString())

  // Check for redirect (login success usually redirects to dashboard)
  const location = loginPage.headers['location'] || loginResult.headers['location'] || ''
  const isLoggedIn = loginResult.status === 302 || loginResult.status === 303 || location.includes('dashboard')

  // Get the authenticated PHPSESSID from response cookies
  const respCookies = loginResult.headers['set-cookie'] || []
  const respCookieArr = Array.isArray(respCookies) ? respCookies : [respCookies]
  let finalPhpsessid = ''
  for (const c of respCookieArr) {
    const match = c.match(/PHPSESSID=([^;]+)/)
    if (match) { finalPhpsessid = match[1]; break }
  }

  const sessionId = finalPhpsessid || phpsessid

  if (isLoggedIn || loginResult.status < 400) {
    console.log(`✅ Login exitoso. PHPSESSID: ${sessionId.slice(0, 8)}…`)

    // Update .env file
    const raw = readFileSync(ENV_PATH, 'utf8')
    const line = `PHPSESSID=${sessionId}`
    const lines = raw.split('\n')
    const idx = lines.findIndex(l => l.trim().startsWith('PHPSESSID='))
    if (idx >= 0) {
      lines[idx] = line
    } else {
      if (lines.length && lines.at(-1).trim() === '') lines.splice(-1, 0, line)
      else lines.push(line)
    }
    writeFileSync(ENV_PATH, lines.join('\n'), 'utf8')
    console.log('💾 PHPSESSID guardado en .env.dentalink-web')
  } else {
    console.error(`❌ Login falló. HTTP ${loginResult.status}`)
    if (loginResult.body.length < 500) console.error(loginResult.body)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
