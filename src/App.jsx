import { useState, useEffect, useCallback } from 'react'
import { AppShell } from "@/components/app-shell"
import { Dashboard } from "@/components/dashboard"
import { ReactivationView } from "@/components/reactivation-view"
import { AttributionView } from "@/components/attribution-view"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ADMIN_TOKEN = 'drdiente-admin-2026'
const API_BASE = '/api/leads'

const SEGMENTS = {
  'anticipo-sin-cita': { label: 'Abono sin cita', color: '#a855f7', icon: '💳' },
  'plan-sin-cita':     { label: 'Plan sin cita',  color: '#8b5cf6', icon: '📋' },
  'nunca-agendo':      { label: 'Nunca agendó',   color: '#ef4444', icon: '🆕' },
  'solo-cancelaciones':{ label: 'Solo canceló',    color: '#f97316', icon: '❌' },
  'ultima-no-asistio': { label: 'Última canceló',  color: '#eab308', icon: '⚠️' },
  'inactivo-90d':      { label: '+90 días',        color: '#fb923c', icon: '⏰' },
  'inactivo-60d':      { label: '+60 días',        color: '#fbbf24', icon: '⏳' },
  'inactivo-30d':      { label: '+30 días',        color: '#a3e635', icon: '🔔' },
  'reciente':          { label: 'Reciente',        color: '#4ade80', icon: '✅' },
  'tiene-cita':        { label: 'Tiene cita',      color: '#22c55e', icon: '📅' },
  'sin-contacto':      { label: 'Sin contacto',    color: '#6b7280', icon: '📭' },
  'deshabilitado':     { label: 'Deshabilitado',   color: '#9ca3af', icon: '🔒' },
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterSegment, setFilterSegment] = useState('todos')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [leadDetail, setLeadDetail] = useState(null)

  useEffect(() => {
    if (sessionStorage.getItem('leads-admin-auth') === ADMIN_TOKEN) setAuthenticated(true)
    else setLoading(false)
  }, [])

  const fetchLeads = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ token: ADMIN_TOKEN, page: String(page), limit: '20' })
      if (filterSegment !== 'todos') params.set('segment', filterSegment)
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`${API_BASE}?${params}`)
      if (!res.ok) throw new Error(res.status === 401 ? 'Token inválido' : `Error ${res.status}`)
      setData(await res.json())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [filterSegment, search, page])

  useEffect(() => { if (authenticated) fetchLeads() }, [authenticated, fetchLeads])

  function handleLogin(e) {
    e.preventDefault()
    if (password === ADMIN_TOKEN) {
      sessionStorage.setItem('leads-admin-auth', ADMIN_TOKEN)
      setAuthenticated(true)
    } else setError('Contraseña incorrecta')
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="font-display text-2xl tracking-tight">🦷 Leads Admin</CardTitle>
            <p className="text-sm text-muted-foreground">Panel de leads reactivables — Dr. Diente</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" autoFocus />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full">Entrar</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (leadDetail) {
    const l = leadDetail
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <Button variant="outline" onClick={() => setLeadDetail(null)}>← Volver</Button>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-2xl">{l.nombre}</CardTitle>
              {l.nombre_social && <p className="text-sm text-muted-foreground">{l.nombre_social}</p>}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Teléfono</span><p>{l.phone || '—'}</p></div>
                <div><span className="text-muted-foreground">Email</span><p>{l.email || '—'}</p></div>
                <div><span className="text-muted-foreground">Sucursal</span><p>{l.sucursal || '—'}</p></div>
                <div><span className="text-muted-foreground">Afiliación</span><p>{l.fecha_afiliacion || '—'}</p></div>
              </div>
              <Badge variant="outline" className="mt-4" style={{ borderColor: l.segment_color + '40', color: l.segment_color }}>{l.segment_label}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">🦷 Tratamientos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Principal</span><p className="font-medium">{l.tratamiento_principal || 'Sin plan'}</p></div>
                <div><span className="text-muted-foreground">Planes</span><p>{l.tratamientos_count || 0} · {l.tratamientos_abiertos || 0} abiertos</p></div>
                <div><span className="text-muted-foreground">Presupuesto</span><p>${Number(l.presupuesto_total || 0).toLocaleString('es-MX')}</p></div>
                <div><span className="text-muted-foreground">Abonado / Deuda</span><p>${Number(l.abonado_total || 0).toLocaleString('es-MX')} / <span className={l.deuda_total > 0 ? 'text-destructive' : ''}>${Number(l.deuda_total || 0).toLocaleString('es-MX')}</span></p></div>
              </div>
              {l.tratamientos?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {l.tratamientos.map(t => <Badge key={t} variant="secondary">{t}</Badge>)}
                </div>
              )}
            </CardContent>
          </Card>

          {l.pagos_count > 0 && (
            <Card>
              <CardHeader><CardTitle className="font-display text-lg">💰 Pagos ({l.pagos_count})</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div><span className="text-muted-foreground text-xs">Total</span><p className="text-2xl font-semibold text-[--lime-pulse]">${Number(l.pagado_total_api || 0).toLocaleString('es-MX')}</p></div>
                  <div><span className="text-muted-foreground text-xs">Último</span><p>{l.ultimo_pago_fecha || '—'}</p></div>
                  <div><span className="text-muted-foreground text-xs">Medios</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {l.medios_pago?.map(m => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {l.citas?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="font-display text-lg">Historial de citas ({l.citas.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {l.citas.slice().reverse().map(c => (
                    <div key={c.id} className="flex justify-between py-2 border-b border-border text-sm">
                      <span>{c.fecha} {c.hora}</span>
                      <span className={c.estado === 'Cancelada' || c.estado === 'No Asistió' ? 'text-destructive' : c.estado === 'Atendida' ? 'text-[--lime-pulse]' : 'text-muted-foreground'}>{c.estado}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  // ── DASHBOARD ──
  const leads = data?.leads || []
  const segSummary = data?.segment_summary || {}
  const totalLeads = data?.metadata?.total_leads || 0
  const totalPages = data?.metadata?.total_pages || 1
  const [currentView, setCurrentView] = useState('#dashboard')

  useEffect(() => {
    const onHash = () => setCurrentView(window.location.hash || '#dashboard')
    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <AppShell>
      {currentView === '#reactivation' ? (
        <ReactivationView leads={[]} data={data} />
      ) : currentView === '#attribution' ? (
        <AttributionView />
      ) : (
      <Dashboard leads={leads} data={data} />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {Object.entries(SEGMENTS).map(([key, cfg]) => {
          const count = segSummary[key]
          if (!count) return null
          return (
            <button key={key} onClick={() => { setFilterSegment(key); setPage(1) }}
              className={`rounded-lg border p-3 text-left text-sm transition-all ${filterSegment === key ? 'border-[--lime-pulse] bg-[--lime-pulse]/5' : 'border-border bg-card hover:bg-accent'}`}>
              <div className="text-lg">{cfg.icon}</div>
              <div className="text-xl font-semibold mt-1" style={{ color: cfg.color }}>{count}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{cfg.label}</div>
            </button>
          )
        })}
        <button onClick={() => { setFilterSegment('todos'); setPage(1) }}
          className={`rounded-lg border p-3 text-left text-sm transition-all ${filterSegment === 'todos' ? 'border-[--lime-pulse] bg-[--lime-pulse]/5' : 'border-border bg-card hover:bg-accent'}`}>
          <div className="text-lg">📊</div>
          <div className="text-xl font-semibold mt-1">{totalLeads}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Todos</div>
        </button>
      </div>

      {/* Search & filters */}
      <div className="flex gap-2">
        <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Buscar nombre, email, teléfono..." className="flex-1" />
        <Select value={filterSegment} onValueChange={v => { setFilterSegment(v); setPage(1) }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Segmento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {Object.entries(SEGMENTS).map(([k, c]) => <SelectItem key={k} value={k}>{c.label} ({segSummary[k] || 0})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">{error}</div>}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left p-3 font-medium">Paciente</th>
                <th className="text-left p-3 font-medium">Contacto</th>
                <th className="text-left p-3 font-medium">Tratamiento</th>
                <th className="text-left p-3 font-medium">Segmento</th>
                <th className="text-right p-3 font-medium">Presupuesto</th>
                <th className="text-right p-3 font-medium">Pagado</th>
                <th className="text-center p-3 font-medium">Citas</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id} onClick={() => setLeadDetail(l)}
                  className="border-b border-border cursor-pointer hover:bg-accent/50 transition-colors">
                  <td className="p-3 font-medium">{l.nombre}</td>
                  <td className="p-3">
                    {l.phone && <div>{l.phone}</div>}
                    {l.email && <div className="text-xs text-muted-foreground truncate max-w-[180px]">{l.email}</div>}
                  </td>
                  <td className="p-3">
                    <div className="text-[--lime-pulse] text-xs font-medium truncate max-w-[160px]">{l.tratamiento_principal || '—'}</div>
                    {l.tratamientos?.length > 1 && <div className="text-xs text-muted-foreground">+{l.tratamientos.length - 1} más</div>}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" style={{ borderColor: l.segment_color + '40', color: l.segment_color, background: l.segment_color + '15' }}>{l.segment_label}</Badge>
                  </td>
                  <td className="p-3 text-right">{l.presupuesto_total ? `$${Number(l.presupuesto_total).toLocaleString('es-MX')}` : '—'}</td>
                  <td className="p-3 text-right">
                    {l.pagos_count > 0 ? (
                      <><div className="text-[--lime-pulse] font-medium">${Number(l.pagado_total_api || 0).toLocaleString('es-MX')}</div><div className="text-xs text-muted-foreground">{l.pagos_count} · {l.ultimo_pago_fecha || '—'}</div></>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3 text-center text-muted-foreground">{l.total_citas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>← Anterior</Button>
          <span className="text-sm text-muted-foreground">Pág {page} de {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente →</Button>
        </div>
      )}
    </AppShell>
  )
}
