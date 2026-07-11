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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', padding: '1rem' }}>
        <div style={{ background: '#1a1a1a', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '400px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h1 style={{ fontSize: '1.5rem', color: '#d4a854', fontFamily: 'serif', margin: '0 0 0.25rem' }}>🦷 Leads Admin</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', margin: '0 0 1.5rem' }}>Panel de leads reactivables — Dr. Diente</p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoFocus
              style={{
                width: '100%', padding: '0.75rem 1rem', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px',
                color: '#fff', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
              }}
            />
            {error && <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</p>}
            <button type="submit" style={{
              width: '100%', marginTop: '1rem', padding: '0.75rem', borderRadius: '8px',
              border: 'none', background: '#d4a854', color: '#111', fontWeight: 600,
              fontSize: '0.9rem', cursor: 'pointer',
            }}>Entrar</button>
          </form>
        </div>
      </div>
    )
  }

  // ── LOADING ──
  if (loading && !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#d4a854' }}>
        Cargando leads...
      </div>
    )
  }

  // ── NO DATA ──
  if (data?.metadata?.status === 'no-data') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', padding: '1rem' }}>
        <div style={{ background: '#1a1a1a', borderRadius: '16px', padding: '2rem', maxWidth: '400px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📡</div>
          <h2 style={{ color: '#fff', margin: '0 0 0.5rem' }}>Escaneando Dentalink...</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' }}>
            {data.metadata.message}
          </p>
          <button onClick={fetchLeads} style={{
            marginTop: '1rem', padding: '0.5rem 1.5rem', borderRadius: '8px',
            border: '1px solid #d4a854', background: 'transparent', color: '#d4a854',
            cursor: 'pointer', fontSize: '0.8rem',
          }}>Refrescar</button>
        </div>
      </div>
    )
  }

  // ── DETAIL VIEW ──
  if (leadDetail) {
    const l = leadDetail
    return (
      <div style={{ minHeight: '100vh', background: '#111', color: '#fff' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
          <button onClick={() => setLeadDetail(null)} style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
            padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', marginBottom: '1.5rem',
            fontSize: '0.8rem',
          }}>← Volver</button>
          <div style={{ background: '#1a1a1a', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>{l.nombre}</h2>
            {l.nombre_social && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: '0 0 1rem' }}>{l.nombre_social}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Teléfono</div>
                <div style={{ fontSize: '0.9rem' }}>{l.phone || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Email</div>
                <div style={{ fontSize: '0.9rem' }}>{l.email || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Sucursal</div>
                <div style={{ fontSize: '0.9rem' }}>{l.sucursal || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Afiliación</div>
                <div style={{ fontSize: '0.9rem' }}>{l.fecha_afiliacion || '—'}</div>
              </div>
            </div>
            <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 500, background: l.segment_color + '20', color: l.segment_color, border: `1px solid ${l.segment_color}40` }}>
              {l.segment_label}
            </div>
          </div>

          <div style={{ marginTop: '1rem', background: '#1a1a1a', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: 'rgba(255,255,255,0.7)' }}>🦷 Tratamientos</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Principal</div>
                <div style={{ fontSize: '0.95rem', color: '#d4a854', fontWeight: 600 }}>{l.tratamiento_principal || 'Sin plan registrado'}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Planes</div>
                <div style={{ fontSize: '0.9rem' }}>{l.tratamientos_count || 0} · abiertos {l.tratamientos_abiertos || 0} · cerrados {l.tratamientos_cerrados || 0}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Presupuesto</div>
                <div style={{ fontSize: '0.9rem' }}>${Number(l.presupuesto_total || 0).toLocaleString('es-MX')}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Abonado / Deuda</div>
                <div style={{ fontSize: '0.9rem' }}>${Number(l.abonado_total || 0).toLocaleString('es-MX')} / <span style={{ color: (l.deuda_total || 0) > 0 ? '#f87171' : 'rgba(255,255,255,0.7)' }}>${Number(l.deuda_total || 0).toLocaleString('es-MX')}</span></div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Último tratamiento</div>
                <div style={{ fontSize: '0.9rem' }}>{l.ultimo_tratamiento_fecha || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Dentista</div>
                <div style={{ fontSize: '0.9rem' }}>{l.ultimo_dentista || '—'}</div>
              </div>
            </div>
            {Array.isArray(l.tratamientos) && l.tratamientos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {l.tratamientos.map((t) => (
                  <span key={t} style={{
                    padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem',
                    background: 'rgba(212,168,84,0.12)', color: '#d4a854', border: '1px solid rgba(212,168,84,0.25)',
                  }}>{t}</span>
                ))}
              </div>
            )}
          </div>

          {l.citas?.length > 0 && (
            <div style={{ marginTop: '1rem', background: '#1a1a1a', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: 'rgba(255,255,255,0.7)' }}>Historial de citas ({l.citas.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {l.citas.slice().reverse().map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                    <span>{c.fecha || '?'} {c.hora || ''}</span>
                    <span style={{ color: c.estado === 'Cancelada' || c.estado === 'No Asistió' ? '#f87171' : c.estado === 'Atendida' ? '#4ade80' : 'rgba(255,255,255,0.5)' }}>{c.estado || '?'}</span>
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
    <div style={{ minHeight: '100vh', background: '#111', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, background: 'rgba(17,17,17,0.9)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)', zIndex: 10,
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.1rem', color: '#d4a854', fontFamily: 'serif' }}>🦷 Leads DrDiente</span>
            <span style={{ fontSize: '0.75rem', background: 'rgba(212,168,84,0.2)', color: '#d4a854', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
              {totalLeads} leads
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{reactivables} reactivables</span>
            <button onClick={handleLogout} style={{
              background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline',
            }}>Salir</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {Object.entries(SEGMENTS).map(([key, cfg]) => {
            const count = segmentSummary[key]
            if (!count) return null
            return (
              <button
                key={key}
                onClick={() => { setFilterSegment(key); setPage(1) }}
                style={{
                  background: filterSegment === key ? 'rgba(212,168,84,0.1)' : '#1a1a1a',
                  border: filterSegment === key ? '1px solid #d4a854' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', padding: '0.75rem', cursor: 'pointer',
                  textAlign: 'left', color: '#fff', transition: 'all 0.2s',
                }}
              >
                <div style={{ fontSize: '1.1rem' }}>{cfg.icon}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: cfg.color, marginTop: '0.25rem' }}>{count}</div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.2, marginTop: '0.15rem' }}>{cfg.label}</div>
              </button>
            )
          })}
          <button
            onClick={() => { setFilterSegment('todos'); setPage(1) }}
            style={{
              background: filterSegment === 'todos' ? 'rgba(212,168,84,0.1)' : '#1a1a1a',
              border: filterSegment === 'todos' ? '1px solid #d4a854' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px', padding: '0.75rem', cursor: 'pointer',
              textAlign: 'left', color: '#fff',
            }}
          >
            <div style={{ fontSize: '1.1rem' }}>📊</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d4a854', marginTop: '0.25rem' }}>{totalLeads}</div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.15rem' }}>Todos</div>
          </button>
        </div>

        {/* Search & Filters */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar nombre, email, teléfono, tratamiento..."
            style={{
              flex: 1, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', padding: '0.6rem 1rem', color: '#fff',
              fontSize: '0.85rem', outline: 'none',
            }}
          />
          <select
            value={filterSegment}
            onChange={e => { setFilterSegment(e.target.value); setPage(1) }}
            style={{
              background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', padding: '0.6rem 1rem', color: '#fff',
              fontSize: '0.85rem', outline: 'none',
            }}
          >
            <option value="todos">Todos</option>
            {Object.entries(SEGMENTS).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label} ({segmentSummary[key] || 0})</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '0.75rem 1rem', color: '#f87171', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</div>}

        {/* Table */}
        <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
          {leads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem' }}>
              No se encontraron leads
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 500 }}>Paciente</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 500 }}>Contacto</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 500 }}>Tratamiento</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 500 }}>Segmento</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontWeight: 500 }}>Presupuesto</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem 1rem', fontWeight: 500 }}>Citas</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(l => (
                    <tr
                      key={l.id}
                      onClick={() => setLeadDetail(l)}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 500 }}>{l.nombre}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {l.phone && <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem' }}>{l.phone}</div>}
                        {l.email && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.email}</div>}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ color: '#d4a854', fontSize: '0.8rem', fontWeight: 500, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.tratamiento_principal || '—'}
                        </div>
                        {Array.isArray(l.tratamientos) && l.tratamientos.length > 1 && (
                          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>+{l.tratamientos.length - 1} más</div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px',
                          fontSize: '0.7rem', fontWeight: 500,
                          background: l.segment_color + '20', color: l.segment_color,
                          border: `1px solid ${l.segment_color}40`,
                        }}>{l.segment_label}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
                        {l.presupuesto_total ? `$${Number(l.presupuesto_total).toLocaleString('es-MX')}` : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>{l.total_citas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{
              padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', color: page <= 1 ? 'rgba(255,255,255,0.2)' : '#fff',
              cursor: page <= 1 ? 'default' : 'pointer', fontSize: '0.8rem',
            }}>← Anterior</button>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Pág {page} de {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{
              padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', color: page >= totalPages ? 'rgba(255,255,255,0.2)' : '#fff',
              cursor: page >= totalPages ? 'default' : 'pointer', fontSize: '0.8rem',
            }}>Siguiente →</button>
          </div>
        )}

        {/* Footer */}
        {data?.metadata?.scanned_at && (
          <div style={{ textAlign: 'center', marginTop: '2rem', color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem' }}>
            Último escaneo: {new Date(data.metadata.scanned_at).toLocaleString('es-MX')}
          </div>
        )}
      </div>
    </div>
  )
}
