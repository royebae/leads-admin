import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const segments = [
  ['Lead nuevo inbound', 'Alta', 'WhatsApp inmediato + llamada si no responde', 'Automatización + recepción'],
  ['Reactivable nunca agendó', 'Alta', 'WhatsApp corto + llamada mismo día', 'Automatización + recepción'],
  ['Canceló / no asistió', 'Alta', 'WhatsApp empático + llamada especial', 'Recepción'],
  ['Preguntó precio / cotización', 'Alta', 'Mensaje de valor + llamada de cierre', 'Recepción'],
  ['Inactivo 60–90 días', 'Media', 'Campaña WhatsApp + Email', 'Automatización'],
  ['Solo email', 'Media', 'Secuencia de email + reporte para posible llamada', 'Automatización + recepción'],
  ['Solo teléfono', 'Media', 'Informe directo para llamada', 'Recepción'],
  ['Sin datos suficientes', 'Nula', 'Excluir de campañas', 'Sistema'],
]

const cadence = [
  ['Día 0', 'WhatsApp + email + reporte', 'Contacto inmediato y lista para recepción si es alta prioridad'],
  ['Día 1', 'Follow-up WhatsApp + llamada', 'Recepción llama a leads calientes sin respuesta'],
  ['Día 3', 'Email de respaldo', 'Mensaje más explicativo con propuesta clara'],
  ['Día 7', 'Último follow-up suave', 'Si no responde, pasa a nutrición futura'],
]

const statuses = ['nuevo', 'mensaje_wa_enviado', 'email_enviado', 'respondio', 'requiere_llamada', 'llamado', 'agendado', 'no_responde', 'seguimiento_especial', 'perdido', 'excluido']

export function InboundMarketingView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-display font-semibold tracking-tight">Inbound Marketing</h2>
          <Badge variant="outline" className="border-[--lime-pulse]/40 text-[--lime-pulse]">Inicio inmediato</Badge>
          <Badge variant="secondary">Email + WhatsApp + Recepción</Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Flujo completo para que cada lead nuevo o reactivable tenga seguimiento automático, prioridad clara para recepción y control de llamadas/citas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">🧭 Flujo completo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ['1', 'Lead entra', 'Inbound, reactivación o captura desde campañas'],
              ['2', 'Clasificación', 'Segmento, prioridad, canal y tratamiento/interés'],
              ['3', 'Automatización', 'WhatsApp + email según datos disponibles'],
              ['4', 'Recepción', 'Informe diario para llamadas y seguimiento especial'],
            ].map(([n, title, desc]) => (
              <div key={n} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[--lime-pulse]/10 text-sm font-bold text-[--lime-pulse]">{n}</div>
                <div className="font-medium">{title}</div>
                <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-display text-lg">⚡ Cadencia inicial</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cadence.map(([day, action, note]) => (
                <div key={day} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline">{day}</Badge>
                    <span className="text-sm font-medium">{action}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{note}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display text-lg">☎️ Informe diario a recepción</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs leading-6 text-muted-foreground">
              <div className="text-foreground">INFORME RECEPCIÓN — DR. DIENTE</div>
              <div>1) Llamar hoy — prioridad alta</div>
              <div>2) Respondieron mensajes</div>
              <div>3) Pendientes sin respuesta</div>
              <div>4) Seguimiento especial</div>
              <div className="mt-3 text-foreground">Casos especiales: canceló/no asistió, pidió precio, urgencia/dolor, anticipo/plan pendiente.</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-display text-lg">🎯 Segmentos operativos</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 text-left font-medium">Segmento</th>
                  <th className="p-3 text-left font-medium">Prioridad</th>
                  <th className="p-3 text-left font-medium">Acción</th>
                  <th className="p-3 text-left font-medium">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {segments.map(([segment, priority, action, owner]) => (
                  <tr key={segment} className="border-b border-border/60">
                    <td className="p-3 font-medium">{segment}</td>
                    <td className="p-3"><Badge variant={priority === 'Alta' ? 'destructive' : priority === 'Media' ? 'secondary' : 'outline'}>{priority}</Badge></td>
                    <td className="p-3 text-muted-foreground">{action}</td>
                    <td className="p-3 text-muted-foreground">{owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-display text-lg">💬 Mensaje WhatsApp inicial</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-sm leading-7">
              Hola {'{{nombre}}'}, soy de Dr. Diente 😊<br />
              Vimos que tenías interés en {'{{interes}}'} y quería ayudarte a resolverlo.<br />
              ¿Te gustaría que te compartamos opciones de horario para una valoración?
            </div>
            <p className="mt-3 text-xs text-amber-500">Pendiente de aprobación antes de activar envíos reales.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display text-lg">📌 Estados del seguimiento</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {statuses.map(status => <Badge key={status} variant="outline" className="font-mono text-xs">{status}</Badge>)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
