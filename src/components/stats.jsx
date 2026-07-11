import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta"

export function DashboardStats({ totalLeads, totalPagos, reactivables, totalCitas }) {
  const stats = [
    { label: "Total leads", value: String(totalLeads || 0), delta: 0, hint: "en base" },
    { label: "Reactivables", value: String(reactivables || 0), delta: 0, hint: "para campaña" },
    { label: "En pagos", value: `$${(totalPagos || 0).toLocaleString('es-MX')}`, delta: 0, hint: "histórico" },
    { label: "Citas totales", value: String(totalCitas || 0), delta: 0, hint: "registradas" },
  ]

  return (
    <>
      {stats.map((s) => (
        <Card key={s.label}>
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-xs">{s.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-balance font-semibold text-2xl tabular-nums tracking-tight">{s.value}</p>
          </CardContent>
          <CardFooter className="gap-1.5 text-xs">
            <span className="text-pretty text-muted-foreground">{s.hint}</span>
          </CardFooter>
        </Card>
      ))}
    </>
  )
}
