import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useState } from "react"

const PRIORITY_DATA = {
  alta: { label: 'Alta', color: '#ef4444', icon: '🔴' },
  media: { label: 'Media', color: '#f97316', icon: '🟡' },
  baja: { label: 'Baja', color: '#6b7280', icon: '🟢' },
  nula: { label: 'Sin valor', color: '#9ca3af', icon: '⚪' },
}

const SEGMENTS = {
  'inactivo-90d': { label: '+90 días', icon: '⏰', priority: 'Alta' },
  'solo-cancelaciones': { label: 'Solo canceló', icon: '❌', priority: 'Media' },
  'ultima-no-asistio': { label: 'Última no asistió', icon: '⚠️', priority: 'Alta' },
  'inactivo-30d': { label: '+30 días', icon: '🔔', priority: 'Media' },
  'inactivo-60d': { label: '+60 días', icon: '⏳', priority: 'Media' },
  'nunca-agendo': { label: 'Nunca agendó', icon: '🆕', priority: 'Alta' },
  'plan-sin-cita': { label: 'Plan sin cita', icon: '📋', priority: 'Alta' },
  'anticipo-sin-cita': { label: 'Abono sin cita', icon: '💳', priority: 'Alta' },
}

const PHASES = [
  { week: '1-2', label: 'Alta prioridad · WhatsApp', band: 'alta', channel: 'whatsapp+email', desc: 'Contactar pacientes alta prioridad con WhatsApp' },
  { week: '3-4', label: 'Alta prioridad · Email follow-up', band: 'alta', channel: 'email', desc: 'Follow-up por email a quienes no respondieron WhatsApp' },
  { week: '5-6', label: 'Media prioridad · WhatsApp', band: 'media', channel: 'whatsapp+email', desc: 'Contactar pacientes media prioridad' },
  { week: '7-8', label: 'Media prioridad · Email follow-up', band: 'media', channel: 'email', desc: 'Follow-up por email a media prioridad' },
  { week: '9+', label: 'Baja prioridad · Campaña masiva', band: 'baja', channel: 'email', desc: 'Campaña general con oferta' },
]

export function ReactivationView({ leads, data }) {
  const [view, setView] = useState('plan')
  const allLeads = data?.leads || leads || []
  const totalReactivables = data?.metadata?.reactivable_automatizable || 0

  // Stats
  const byBand = {}
  const byChannel = { 'whatsapp+email': 0, 'whatsapp': 0, 'email': 0, 'solo_telefono': 0 }
  const bySegment = {}

  for (const l of allLeads) {
    if (!l.is_reactivable || l.elevator_exclude) continue
    const band = l.priority_band || 'baja'
    byBand[band] = (byBand[band] || 0) + 1
    const seg = l.segment || '?'
    bySegment[seg] = (bySegment[seg] || 0) + 1
    // channel detection
    const phone = String(l.phone || '')
    const email = String(l.email || '')
    const hasWA = phone.startsWith('+52')
    const hasEmail = Boolean(email.trim()) && email.includes('@') && !email.includes('..') && !['','na','no indica','no porporciona','prueba'].includes(email.trim())
    if (hasWA && hasEmail) byChannel['whatsapp+email']++
    else if (hasWA) byChannel['whatsapp']++
    else if (hasEmail) byChannel['email']++
    else byChannel['solo_telefono']++
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-semibold tracking-tight">Plan de Reactivación</h2>
          <p className="text-sm text-muted-foreground">{totalReactivables} leads reactivables listos para campaña</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === 'plan' ? 'default' : 'outline'} size="sm" onClick={() => setView('plan')}>📋 Plan</Button>
          <Button variant={view === 'data' ? 'default' : 'outline'} size="sm" onClick={() => setView('data')}>📊 Datos</Button>
          <Button variant={view === 'leads' ? 'default' : 'outline'} size="sm" onClick={() => setView('leads')}>👥 Leads</Button>
        </div>
      </div>

      {view === 'plan' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(PRIORITY_DATA).map(([k, cfg]) => (
              <Card key={k} className="border-l-4" style={{ borderLeftColor: cfg.color }}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cfg.icon}</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">{cfg.label}</span>
                  </div>
                  <div className="text-2xl font-bold mt-1">{byBand[k] || 0}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* By segment */}
          <Card>
            <CardHeader><CardTitle className="font-display text-lg">Por segmento</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(SEGMENTS).map(([k, cfg]) => (
                  <div key={k} className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
                    <div>
                      <span className="text-sm">{cfg.icon} {cfg.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">{cfg.priority}</span>
                    </div>
                    <Badge variant="secondary">{bySegment[k] || 0}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Campaign phases */}
          <Card>
            <CardHeader><CardTitle className="font-display text-lg">🧭 Flujo de campaña sugerido</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {PHASES.map((p, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-border bg-card">
                    <div className="w-12 h-12 rounded-full bg-[--lime-pulse]/10 flex items-center justify-center text-sm font-bold text-[--lime-pulse]">
                      S{p.week}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.desc}</div>
                    </div>
                    <Badge variant="outline" style={{
                      borderColor: PRIORITY_DATA[p.band]?.color + '40',
                      color: PRIORITY_DATA[p.band]?.color
                    }}>
                      {byBand[p.band] || 0} leads
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
                ⏸️ Las campañas están <strong>pausadas</strong> hasta que Héctor y Dibo definan mensajes y activen envíos.
              </div>
            </CardContent>
          </Card>

          {/* Channel readiness */}
          <Card>
            <CardHeader><CardTitle className="font-display text-lg">📡 Canales disponibles</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-[--lime-pulse]/5 border border-[--lime-pulse]/20 text-center">
                  <div className="text-2xl font-bold text-[--lime-pulse]">{byChannel['whatsapp+email']}</div>
                  <div className="text-xs text-muted-foreground">WhatsApp + Email</div>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-center">
                  <div className="text-2xl font-bold text-blue-500">{byChannel['whatsapp']}</div>
                  <div className="text-xs text-muted-foreground">Solo WhatsApp</div>
                </div>
                <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 text-center">
                  <div className="text-2xl font-bold text-purple-500">{byChannel['email']}</div>
                  <div className="text-xs text-muted-foreground">Solo Email</div>
                </div>
                <div className="p-3 rounded-lg bg-gray-500/5 border border-gray-500/20 text-center">
                  <div className="text-2xl font-bold text-gray-500">{byChannel['solo_telefono']}</div>
                  <div className="text-xs text-muted-foreground">Solo llamada</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {view === 'data' && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">📊 Desglose completo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Datos exportados en archivos CSV listos para usar:
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 p-2 rounded bg-card border border-border">
                <span>📄</span>
                <span className="font-mono text-xs">reactivation-leads.csv</span>
                <span className="text-muted-foreground">— Todos los leads reactivables</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-card border border-border">
                <span>📄</span>
                <span className="font-mono text-xs">reactivation-whatsapp+email.csv</span>
                <span className="text-muted-foreground">— {byChannel['whatsapp+email']} leads con ambos canales</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-card border border-border">
                <span>📄</span>
                <span className="font-mono text-xs">reactivation-whatsapp.csv</span>
                <span className="text-muted-foreground">— {byChannel['whatsapp']} leads solo WhatsApp</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-card border border-border">
                <span>📄</span>
                <span className="font-mono text-xs">reactivation-email.csv</span>
                <span className="text-muted-foreground">— {byChannel['email']} leads solo email</span>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted text-sm">
              📁 Los CSV están en la carpeta <code className="text-xs bg-background px-1 rounded">public/</code> del proyecto.
            </div>
          </CardContent>
        </Card>
      )}

      {view === 'leads' && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">👥 Lista completa de reactivables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left p-2 font-medium">Nombre</th>
                    <th className="text-left p-2 font-medium">Prioridad</th>
                    <th className="text-left p-2 font-medium">Segmento</th>
                    <th className="text-left p-2 font-medium">Canal</th>
                    <th className="text-left p-2 font-medium">Tratamiento</th>
                    <th className="text-right p-2 font-medium">Presupuesto</th>
                    <th className="text-center p-2 font-medium">Elevator</th>
                  </tr>
                </thead>
                <tbody>
                  {allLeads
                    .filter(l => l.is_reactivable && !l.elevator_exclude)
                    .sort((a, b) => {
                      const order = { alta: 0, media: 1, baja: 2, nula: 3 }
                      return (order[a.priority_band] || 99) - (order[b.priority_band] || 99) ||
                        (b.presupuesto_total || 0) - (a.presupuesto_total || 0)
                    })
                    .slice(0, 50)
                    .map(l => {
                      const phone = String(l.phone || '')
                      const email = String(l.email || '')
                      const hasWA = phone.startsWith('+52')
                      const hasEmail = Boolean(email.trim()) && email.includes('@')
                      const ch = hasWA && hasEmail ? '📱📧' : hasWA ? '📱' : hasEmail ? '📧' : '📞'
                      return (
                        <tr key={l.id} className="border-b border-border hover:bg-accent/50 text-xs">
                          <td className="p-2 font-medium">{l.nombre}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-[10px]" style={{
                              borderColor: PRIORITY_DATA[l.priority_band]?.color + '30',
                              color: PRIORITY_DATA[l.priority_band]?.color
                            }}>{PRIORITY_DATA[l.priority_band]?.label || l.priority_band}</Badge>
                          </td>
                          <td className="p-2 text-muted-foreground">{SEGMENTS[l.segment]?.label || l.segment}</td>
                          <td className="p-2 text-center">{ch}</td>
                          <td className="p-2 truncate max-w-[150px]">{l.tratamiento_principal || '—'}</td>
                          <td className="p-2 text-right">${(l.presupuesto_total || 0).toLocaleString('es-MX')}</td>
                          <td className="p-2 text-center">{l.elevator_opportunity_id ? '✅' : l.elevator_id ? '📌' : '—'}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
              {allLeads.filter(l => l.is_reactivable && !l.elevator_exclude).length > 50 && (
                <div className="text-center text-xs text-muted-foreground mt-3">
                  Mostrando 50 de {allLeads.filter(l => l.is_reactivable && !l.elevator_exclude).length} leads.
                  Usa los CSVs para ver el listado completo.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
