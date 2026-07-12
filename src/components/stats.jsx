import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function DashboardStats({ totalLeads, totalPagos, reactivables, totalCitas, data }) {
  const meta = data?.metadata || {}
  const elevSynced = meta.with_elevator_id || data?.leads?.filter?.(l => l.elevator_id).length || 0
  const elevOpps = meta.with_opportunity || data?.leads?.filter?.(l => l.elevator_opportunity_id).length || 0
  const automatizable = meta.reactivable_automatizable || reactivables
  const excluded = meta.excluded_datos_insuficientes || 0

  const stats = [
    { label: "Total pacientes", value: String(totalLeads || 0), color: "#4ade80", hint: "en base" },
    { label: "Reactivables", value: String(automatizable || 0), color: "#f97316", hint: "para campaña" },
    { label: "En Elevator", value: String(elevSynced || 0), color: "#a855f7", hint: "sincronizados" },
    { label: "Oportunidades", value: String(elevOpps || 0), color: "#22c55e", hint: "creadas" },
    { label: "Valor pagos", value: `$${(totalPagos || 0).toLocaleString('es-MX')}`, color: "#fbbf24", hint: "histórico" },
    { label: "Excluidos", value: String(excluded || 0), color: "#6b7280", hint: "sin datos" },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((s) => (
        <Card key={s.label} className="border-l-4" style={{ borderLeftColor: s.color }}>
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-xs font-normal text-muted-foreground">{s.label}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <p className="text-xl font-bold tabular-nums">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
