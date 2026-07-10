/**
 * API endpoint for Lead Retargeting Dashboard
 * GET /api/leads?segment=nunca-agendo&search=blanca&page=1&limit=50
 * Protected by token: ?token=... or header x-admin-token
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = join(fileURLToPath(import.meta.url), '..')
const LEADS_FILE = join(__dirname, 'leads-data.json')

export default function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(204).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const adminToken = process.env.ADMIN_TOKEN || 'drdiente-admin-2026'
  const providedToken = req.query.token || req.headers['x-admin-token'] || ''
  if (providedToken !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    let raw
    try {
      raw = readFileSync(LEADS_FILE, 'utf-8')
    } catch (readErr) {
      console.error('[LEADS] File not found at:', LEADS_FILE)
      return res.status(200).json({
        metadata: { status: 'no-data', message: 'Escaneando Dentalink...', path: LEADS_FILE, error: readErr?.message },
        leads: [],
        segment_summary: {},
      })
    }

    const data = JSON.parse(raw)
    const { segment, search, page = '1', limit = '50' } = req.query
    let leads = data.leads || []

    if (segment && segment !== 'todos') leads = leads.filter(l => l.segment === segment)
    if (search) {
      const q = search.toLowerCase().trim()
      leads = leads.filter(l =>
        l.nombre.toLowerCase().includes(q) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.phone && l.phone.includes(q))
      )
    }

    leads.sort((a, b) => (b.segment_priority || 0) - (a.segment_priority || 0))

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50))
    const total = leads.length
    const totalPages = Math.ceil(total / limitNum)
    const start = (pageNum - 1) * limitNum
    const paginated = leads.slice(start, start + limitNum)

    return res.status(200).json({
      metadata: {
        ...data.metadata,
        total_leads: data.leads?.length || 0,
        filtered: total,
        page: pageNum,
        limit: limitNum,
        total_pages: totalPages,
        has_more: pageNum < totalPages,
      },
      segment_summary: data.segment_summary || {},
      leads: paginated,
    })
  } catch (err) {
    console.error('[LEADS] Error:', err?.message || err)
    return res.status(500).json({ error: 'Internal error', detail: err?.message })
  }
}
