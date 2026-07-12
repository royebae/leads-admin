import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useState } from "react"

function formatCurrency(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n || 0)
}

export function AttributionView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useState(() => {
    fetch('/conversion-events.json')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  if (loading) return <Card><CardContent className="p-6 text-center text-muted-foreground">Cargando atribución...</CardContent></Card>
  if (error) return <Card><CardContent className="p-6 text-center text-muted-foreground">Sin datos de atribución aún</CardContent></Card>
  if (!data) return <Card><CardContent className="p-6 text-center text-muted-foreground">Ejecuta build-conversion-events.mjs para generar datos</CardContent></Card>

  const events = Array.isArray(data) ? data : (data.events || [])
  const meta = data.metadata || {}
  const dryRun = meta.dry_run !== false

  // Stats
  const ready = events.filter(e => e.status === 'ready').length || meta.ready_with_click_id || 0
  const review = events.filter(e => e.status !== 'ready').length || meta.manual_review || 0
  const totalValue = events.reduce((s, e) => s + (e.custom_data?.value || 0), 0)
  const attributedValue = events.filter(e => e.status === 'ready').reduce((s, e) => s + (e.custom_data?.value || 0), 0)

  // By channel
  const byChannel = { google: 0, meta: 0, tiktok: 0, organic: 0, unknown: 0 }
  let byChannelValue = { google: 0, meta: 0, tiktok: 0, organic: 0, unknown: 0 }
  for (const e of events) {
    const ud = e.user_data || {}
    let ch = 'unknown'
    if (ud.gclid) ch = 'google'
    else if (ud.fbclid || ud.fbc) ch = 'meta'
    else if (ud.ttclid) ch = 'tiktok'
    else ch = 'organic'
    byChannel[ch]++
    byChannelValue[ch] += (e.custom_data?.value || 0)
  }

  const channels = [
    { key: 'google', label: 'Google Ads', color: '#4ade80', icon: '🔍' },
    { key: 'meta', label: 'Meta / Facebook', color: '#a855f7', icon: '📘' },
    { key: 'tiktok', label: 'TikTok', color: '#f43f5e', icon: '🎵' },
    { key: 'organic', label: 'Orgánico / Directo', color: '#6b7280', icon: '🌐' },
    { key: 'unknown', label: 'Sin atribuir', color: '#9ca3af', icon: '❓' },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-semibold tracking-tight">Atribución de pagos</h2>
          <p className="text-sm text-muted-foreground">
            {dryRun ? '🔬 Vista previa — no se ha enviado nada a las plataformas' : '✅ Datos enviados a plataformas'}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-[--lime-pulse]">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total eventos</div>
            <div className="text-2xl font-bold mt-1">{events.length}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">conversiones generadas</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-green-500">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Con click ID</div>
            <div className="text-2xl font-bold mt-1 text-green-500">{ready}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">listos para enviar</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-amber-500">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Sin atribuir</div>
            <div className="text-2xl font-bold mt-1 text-amber-500">{review}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">revisión manual</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-purple-500">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Valor atribuido</div>
            <div className="text-xl font-bold mt-1 text-purple-500">{formatCurrency(attributedValue)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">con click ID</div>
          </CardContent>
        </Card>
      </div>

      {/* Attribution by channel */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">📊 Atribución por canal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {channels.map(ch => {
              const count = byChannel[ch.key] || 0
              const value = byChannelValue[ch.key] || 0
              return (
                <div key={ch.key} className="flex items-center gap-3">
                  <span className="text-lg w-6 text-center">{ch.icon}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm">
                      <span>{ch.label}</span>
                      <span className="font-medium">{count} eventos</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 mt-1">
                      <div className="h-2 rounded-full transition-all" style={{
                        width: `${events.length ? (count / events.length * 100) : 0}%`,
                        backgroundColor: ch.color
                      }} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{formatCurrency(value)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Event log */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">📋 Últimas conversiones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-2 font-medium">Fecha</th>
                  <th className="text-left p-2 font-medium">Paciente</th>
                  <th className="text-right p-2 font-medium">Valor</th>
                  <th className="text-left p-2 font-medium">ID Click</th>
                  <th className="text-center p-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {[...events].reverse().slice(0, 30).map((e, i) => {
                  const ud = e.user_data || {}
                  const clickId = ud.fbclid || ud.gclid || ud.ttclid || null
                  const channel = ud.gclid ? '🔍' : ud.fbclid ? '📘' : ud.ttclid ? '🎵' : ud.fbc ? '📘' : '🌐'
                  return (
                    <tr key={e.event_id || i} className="border-b border-border hover:bg-accent/50 text-xs">
                      <td className="p-2 text-muted-foreground">{(e.occurred_at || '').slice(0, 10)}</td>
                      <td className="p-2 font-medium">{e.custom_data?.patient_name || '—'}</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(e.custom_data?.value || 0)}</td>
                      <td className="p-2">{channel} {clickId ? clickId.slice(0, 16) + '…' : '—'}</td>
                      <td className="p-2 text-center">
                        {e.status === 'ready' ? (
                          <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-500 border-green-500/20">✅</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">⚠️</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
