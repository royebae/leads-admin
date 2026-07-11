import { useState, useEffect, useCallback } from 'react'

const ADMIN_TOKEN = 'drdiente-admin-2026'
const API_BASE = '/api/leads'

const SEGMENTS = {
  'anticipo-sin-cita': { label: 'Abono sin cita',       color: '#a855f7', icon: '💳', priority: '🔴 ALTA' },
  'plan-sin-cita':     { label: 'Plan sin cita',        color: '#8b5cf6', icon: '📋', priority: '🔴 ALTA' },
  'nunca-agendo':      { label: 'Nunca agendó (frío)',  color: '#ef4444', icon: '🆕', priority: '🔴 ALTA' },
  'solo-cancelaciones':{ label: 'Solo canceló',        color: '#f97316', icon: '❌', priority: '🟠 ALTA' },
  'ultima-no-asistio': { label: 'Última canceló / NSA', color: '#eab308', icon: '⚠️', priority: '🟡 MEDIA' },
  'inactivo-90d':      { label: 'Inactivo +90 días',   color: '#fb923c', icon: '⏰', priority: '🟠 MEDIA' },
  'inactivo-60d':      { label: 'Inactivo +60 días',   color: '#fbbf24', icon: '⏳', priority: '🟡 MEDIA' },
  'inactivo-30d':      { label: 'Inactivo +30 días',   color: '#a3e635', icon: '🔔', priority: '🟢 BAJA' },
  'reciente':          { label: 'Reciente',            color: '#4ade80', icon: '✅', priority: '⚪ N/A' },
  'tiene-cita':        { label: 'Tiene cita agendada', color: '#22c55e', icon: '📅', priority: '⚪ N/A' },
  'sin-contacto':      { label: 'Sin datos contacto',  color: '#6b7280', icon: '📭', priority: '⚪ N/A' },
  'deshabilitado':     { label: 'Deshabilitado',        color: '#9ca3af', icon: '🔒', priority: '⚪ N/A' },
}

const PRIORITY_SEGMENTS = ['anticipo-sin-cita', 'plan-sin-cita', 'nunca-agendo', 'solo-cancelaciones', 'ultima-no-asistio', 'inactivo-90d', 'inactivo-60d']

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filterSegment, setFilterSegment] = useState('todos')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [leadDetail, setLeadDetail] = useState(null)

  useEffect(() => {
    if (sessionStorage.getItem('leads-admin-auth') === ADMIN_TOKEN) {
      setAuthenticated(true)
    } else {
      setLoading(false)
    }
  }, [])

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ token: ADMIN_TOKEN, page: String(page), limit: '100' })
      if (filterSegment !== 'todos') params.set('segment', filterSegment)
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`${API_BASE}?${params}`)
      if (!res.ok) throw new Error(res.status === 401 ? 'Token inválido' : `Error ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filterSegment, search, page])

  useEffect(() => { if (authenticated) fetchLeads() }, [authenticated, fetchLeads])

  function handleLogin(e) {
    e.preventDefault()
    setError('')
    if (password === ADMIN_TOKEN) {
      sessionStorage.setItem('leads-admin-auth', ADMIN_TOKEN)
      setAuthenticated(true)
    } else {
      setError('Contraseña incorrecta')
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('leads-admin-auth')
    setAuthenticated(false)
    setData(null)
    setLeadDetail(null)
  }

  // ── LOGIN ──
  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-page)', padding: '1rem' }}>
        <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', padding: '2rem', width: '100%', maxWidth: '400px', border: '1px solid var(--border-color)' }}>
          <h1 style={{ fontSize: 'var(--text-heading)', color: 'var(--forest-depths)', fontFamily: 'var(--font-display)', fontWeight: 300, margin: '0 0 0.25rem', letterSpacing: '-0.02em' }}>🦷 Leads Admin</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: '0 0 1.5rem', fontFamily: 'var(--font-body)' }}>Panel de leads reactivables — Dr. Diente</p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoFocus
              style={{
                width: '100%', padding: 'var(--space-8) var(--space-16)', background: 'var(--surface-page)',
                border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)', fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            {error && <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</p>}
            <button type="submit" style={{
              width: '100%', padding: 'var(--space-8) var(--space-16)', background: 'var(--lime-pulse)',
              border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--obsidian-plum)',
              fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)', fontWeight: 400,
              cursor: 'pointer',
            }}>Entrar</button>
          </form>
        </div>
      </div>
    )
  }

  // ── LOADING ──
  if (loading && !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-page)', color: 'var(--forest-depths)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
        Cargando leads...
      </div>
    )
  }

  // ── NO DATA ──
  if (data?.metadata?.status === 'no-data') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-page)', padding: '1rem' }}>
        <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', padding: '2rem', maxWidth: '400px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📡</div>
          <h2 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem', fontFamily: 'var(--font-display)', fontSize: 'var(--text-heading)', letterSpacing: '-0.02em' }}>Escaneando Dentalink...</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            {data.metadata.message}
          </p>
          <button onClick={fetchLeads} style={{
            marginTop: 'var(--space-16)', padding: 'var(--space-8) var(--space-24)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--lime-pulse)', background: 'transparent', color: 'var(--lime-pulse)',
            cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)',
          }}>Refrescar</button>
        </div>
      </div>
    )
  }

  // ── DETAIL VIEW ──
  if (leadDetail) {
    const l = leadDetail
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface-page)', color: 'var(--text-primary)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--space-32) var(--space-16)' }}>
          <button onClick={() => setLeadDetail(null)} style={{
            background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
            padding: 'var(--space-8) var(--space-16)', borderRadius: 'var(--radius-md)', cursor: 'pointer', marginBottom: 'var(--space-24)',
            fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)',
          }}>← Volver</button>
          <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', padding: 'var(--space-24)', border: '1px solid var(--border-color)' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: 'var(--text-heading)', fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '-0.02em' }}>{l.nombre}</h2>
            {l.nombre_social && <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: '0 0 var(--space-16)' }}>{l.nombre_social}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)', marginBottom: 'var(--space-24)' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Teléfono</div>
                <div style={{ fontSize: 'var(--text-base)' }}>{l.phone || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Email</div>
                <div style={{ fontSize: 'var(--text-base)' }}>{l.email || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Sucursal</div>
                <div style={{ fontSize: 'var(--text-base)' }}>{l.sucursal || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Afiliación</div>
                <div style={{ fontSize: 'var(--text-base)' }}>{l.fecha_afiliacion || '—'}</div>
              </div>
            </div>
            <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', fontWeight: 500, background: l.segment_color + '20', color: l.segment_color, border: `1px solid ${l.segment_color}40` }}>
              {l.segment_label}
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-16)', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', padding: 'var(--space-24)', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 var(--space-16)', fontSize: 'var(--text-sub)', fontFamily: 'var(--font-display)', fontWeight: 400, color: 'var(--forest-depths)', letterSpacing: '-0.01em' }}>🦷 Tratamientos</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)', marginBottom: 'var(--space-16)' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Principal</div>
                <div style={{ fontSize: 'var(--text-base)', color: 'var(--forest-depths)', fontWeight: 500 }}>{l.tratamiento_principal || 'Sin plan registrado'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Planes</div>
                <div style={{ fontSize: 'var(--text-base)' }}>{l.tratamientos_count || 0} · abiertos {l.tratamientos_abiertos || 0} · cerrados {l.tratamientos_cerrados || 0}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Presupuesto</div>
                <div style={{ fontSize: 'var(--text-base)' }}>${Number(l.presupuesto_total || 0).toLocaleString('es-MX')}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Abonado / Deuda</div>
                <div style={{ fontSize: 'var(--text-base)' }}>${Number(l.abonado_total || 0).toLocaleString('es-MX')} / <span style={{ color: (l.deuda_total || 0) > 0 ? '#dc2626' : 'var(--text-secondary)' }}>${Number(l.deuda_total || 0).toLocaleString('es-MX')}</span></div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Último tratamiento</div>
                <div style={{ fontSize: 'var(--text-base)' }}>{l.ultimo_tratamiento_fecha || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Dentista</div>
                <div style={{ fontSize: 'var(--text-base)' }}>{l.ultimo_dentista || '—'}</div>
              </div>
            </div>
            {Array.isArray(l.tratamientos) && l.tratamientos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)' }}>
                {l.tratamientos.map((t) => (
                  <span key={t} style={{
                    padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)',
                    background: 'rgba(45,48,35,0.08)', color: 'var(--forest-depths)', border: '1px solid rgba(45,48,35,0.15)',
                  }}>{t}</span>
                ))}
              </div>
            )}
          </div>

          {l.pagos_count > 0 && (
            <div style={{ marginTop: 'var(--space-16)', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', padding: 'var(--space-24)', border: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: '0 0 var(--space-16)', fontSize: 'var(--text-sub)', fontFamily: 'var(--font-display)', fontWeight: 400, color: 'var(--forest-depths)', letterSpacing: '-0.01em' }}>💰 Pagos ({l.pagos_count})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-12)', marginBottom: 'var(--space-16)' }}>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Total pagado</div>
                  <div style={{ fontSize: 'var(--text-heading)', color: 'var(--peacock-teal)', fontWeight: 500, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>${Number(l.pagado_total_api || 0).toLocaleString('es-MX')}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Último pago</div>
                  <div style={{ fontSize: 'var(--text-base)' }}>{l.ultimo_pago_fecha || '—'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>Medios</div>
                  <div style={{ fontSize: 'var(--text-sm)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)', marginTop: 'var(--space-8)' }}>
                    {Array.isArray(l.medios_pago) && l.medios_pago.map(m => (
                      <span key={m} style={{
                        padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)',
                        background: 'rgba(14,99,79,0.08)', color: 'var(--peacock-teal)', border: '1px solid rgba(14,99,79,0.15)',
                      }}>{m}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {l.citas?.length > 0 && (
            <div style={{ marginTop: 'var(--space-16)', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', padding: 'var(--space-24)', border: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: '0 0 var(--space-16)', fontSize: 'var(--text-sub)', fontFamily: 'var(--font-display)', fontWeight: 400, color: 'var(--forest-depths)', letterSpacing: '-0.01em' }}>Historial de citas ({l.citas.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
                {l.citas.slice().reverse().map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-8) 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--text-sm)' }}>
                    <span>{c.fecha || '?'} {c.hora || ''}</span>
                    <span style={{ color: c.estado === 'Cancelada' || c.estado === 'No Asistió' ? '#dc2626' : c.estado === 'Atendida' ? 'var(--peacock-teal)' : 'var(--text-secondary)', fontWeight: c.estado === 'Atendida' ? 500 : 400 }}>{c.estado || '?'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── DASHBOARD ──
  const leads = data?.leads || []
  const segmentSummary = data?.segment_summary || {}
  const totalLeads = data?.metadata?.total_leads || 0
  const totalPages = data?.metadata?.total_pages || 1
  const reactivables = PRIORITY_SEGMENTS.reduce((sum, seg) => sum + (segmentSummary[seg] || 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-page)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, background: 'rgba(247,245,242,0.9)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-color)', zIndex: 10,
      }}>
        <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto', padding: 'var(--space-16) var(--space-24)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-16)' }}>
            <span style={{ fontSize: 'var(--text-heading)', color: 'var(--forest-depths)', fontFamily: 'var(--font-display)', fontWeight: 300, letterSpacing: '-0.02em' }}>🦷 Leads DrDiente</span>
            <span style={{ fontSize: 'var(--text-xs)', background: 'rgba(38,216,98,0.15)', color: 'var(--lime-pulse)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
              {totalLeads} leads
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-16)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{reactivables} reactivables</span>
            {data?.metadata?.pagos_api_total > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--peacock-teal)', background: 'rgba(14,99,79,0.08)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                ${Number(data.metadata.pagos_api_total).toLocaleString('es-MX')} en pagos
              </span>
            )}
            <button onClick={handleLogout} style={{
              background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'var(--text-xs)',
              padding: 'var(--space-8) var(--space-16)', fontFamily: 'var(--font-body)',
            }}>Salir</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto', padding: 'var(--space-32) var(--space-24)' }}>
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 'var(--space-8)', marginBottom: 'var(--space-32)' }}>
          {Object.entries(SEGMENTS).map(([key, cfg]) => {
            const count = segmentSummary[key]
            if (!count) return null
            return (
              <button
                key={key}
                onClick={() => { setFilterSegment(key); setPage(1) }}
                style={{
                  background: filterSegment === key ? 'rgba(38,216,98,0.06)' : 'var(--surface-card)',
                  border: filterSegment === key ? '1px solid var(--lime-pulse)' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)', padding: 'var(--space-16)', cursor: 'pointer',
                  textAlign: 'left', color: 'var(--text-primary)', transition: 'all 0.2s',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <div style={{ fontSize: 'var(--text-heading-sm)' }}>{cfg.icon}</div>
                <div style={{ fontSize: 'var(--text-heading-lg)', fontWeight: 400, color: cfg.color, marginTop: 'var(--space-8)', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>{count}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.2, marginTop: 'var(--space-8)' }}>{cfg.label}</div>
              </button>
            )
          })}
          <button
            onClick={() => { setFilterSegment('todos'); setPage(1) }}
            style={{
              background: filterSegment === 'todos' ? 'rgba(38,216,98,0.06)' : 'var(--surface-card)',
              border: filterSegment === 'todos' ? '1px solid var(--lime-pulse)' : '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)', padding: 'var(--space-16)', cursor: 'pointer',
              textAlign: 'left', color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
            }}
          >
            <div style={{ fontSize: 'var(--text-heading-sm)' }}>📊</div>
            <div style={{ fontSize: 'var(--text-heading-lg)', fontWeight: 400, color: 'var(--forest-depths)', marginTop: 'var(--space-8)', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>{totalLeads}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 'var(--space-8)' }}>Todos</div>
          </button>
        </div>

        {/* Search & Filters */}
        <div style={{ display: 'flex', gap: 'var(--space-8)', marginBottom: 'var(--space-24)' }}>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar nombre, email, teléfono, tratamiento..."
            style={{
              flex: 1, background: 'var(--surface-card)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)', padding: 'var(--space-8) var(--space-16)', color: 'var(--text-primary)',
              fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)', outline: 'none',
            }}
          />
          <select
            value={filterSegment}
            onChange={e => { setFilterSegment(e.target.value); setPage(1) }}
            style={{
              background: 'var(--surface-card)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)', padding: 'var(--space-8) var(--space-16)', color: 'var(--text-primary)',
              fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)', outline: 'none',
            }}
          >
            <option value="todos">Todos</option>
            {Object.entries(SEGMENTS).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label} ({segmentSummary[key] || 0})</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-md)', padding: 'var(--space-8) var(--space-16)', color: '#dc2626', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-16)' }}>{error}</div>}

        {/* Table */}
        <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          {leads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>
              No se encontraron leads
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-base)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ textAlign: 'left', padding: 'var(--space-16) var(--space-16)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>Paciente</th>
                    <th style={{ textAlign: 'left', padding: 'var(--space-16) var(--space-16)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>Contacto</th>
                    <th style={{ textAlign: 'left', padding: 'var(--space-16) var(--space-16)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>Tratamiento</th>
                    <th style={{ textAlign: 'left', padding: 'var(--space-16) var(--space-16)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>Segmento</th>
                    <th style={{ textAlign: 'right', padding: 'var(--space-16) var(--space-16)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>Presupuesto</th>
                    <th style={{ textAlign: 'right', padding: 'var(--space-16) var(--space-16)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>Pagado</th>
                    <th style={{ textAlign: 'center', padding: 'var(--space-16) var(--space-16)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>Citas</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(l => (
                    <tr
                      key={l.id}
                      onClick={() => setLeadDetail(l)}
                      style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(38,216,98,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: 'var(--space-12) var(--space-16)' }}>
                        <div style={{ fontWeight: 500, fontFamily: 'var(--font-body)' }}>{l.nombre}</div>
                      </td>
                      <td style={{ padding: 'var(--space-12) var(--space-16)' }}>
                        {l.phone && <div style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>{l.phone}</div>}
                        {l.email && <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.email}</div>}
                      </td>
                      <td style={{ padding: 'var(--space-12) var(--space-16)' }}>
                        <div style={{ color: 'var(--forest-depths)', fontSize: 'var(--text-sm)', fontWeight: 500, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.tratamiento_principal || '—'}
                        </div>
                        {Array.isArray(l.tratamientos) && l.tratamientos.length > 1 && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>+{l.tratamientos.length - 1} más</div>
                        )}
                      </td>
                      <td style={{ padding: 'var(--space-12) var(--space-16)' }}>
                        <span style={{
                          display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-sm)',
                          fontSize: 'var(--text-xs)', fontWeight: 500,
                          background: l.segment_color + '20', color: l.segment_color,
                          border: `1px solid ${l.segment_color}40`,
                        }}>{l.segment_label}</span>
                      </td>
                      <td style={{ padding: 'var(--space-12) var(--space-16)', textAlign: 'right', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
                        {l.presupuesto_total ? `$${Number(l.presupuesto_total).toLocaleString('es-MX')}` : '—'}
                      </td>
                      <td style={{ padding: 'var(--space-12) var(--space-16)', textAlign: 'right', fontSize: 'var(--text-sm)' }}>
                        {l.pagos_count > 0 ? (
                          <>
                            <div style={{ color: 'var(--peacock-teal)', fontWeight: 500 }}>${Number(l.pagado_total_api || 0).toLocaleString('es-MX')}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>{l.pagos_count} pagos · {l.ultimo_pago_fecha || '—'}</div>
                          </>
                        ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                      </td>
                      <td style={{ padding: 'var(--space-12) var(--space-16)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{l.total_citas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-8)', marginTop: 'var(--space-24)' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{
              padding: 'var(--space-8) var(--space-16)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
              background: 'var(--surface-card)', color: page <= 1 ? 'var(--border-color)' : 'var(--text-primary)',
              cursor: page <= 1 ? 'default' : 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)',
            }}>← Anterior</button>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Pág {page} de {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{
              padding: 'var(--space-8) var(--space-16)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
              background: 'var(--surface-card)', color: page >= totalPages ? 'var(--border-color)' : 'var(--text-primary)',
              cursor: page >= totalPages ? 'default' : 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)',
            }}>Siguiente →</button>
          </div>
        )}

        {/* Footer */}
        {data?.metadata?.scanned_at && (
          <div style={{ textAlign: 'center', marginTop: 'var(--space-40)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
            Último escaneo: {new Date(data.metadata.scanned_at).toLocaleString('es-MX')}
          </div>
        )}
      </div>
    </div>
  )
}
