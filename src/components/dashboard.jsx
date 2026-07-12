import { CategoryRankChart } from "@/components/category-rank-chart"
import { RefundReturnRateChart } from "@/components/refund-return-rate-chart"
import { RevenueChart } from "@/components/revenue-chart"
import { DashboardStats } from "@/components/stats"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function Dashboard({ leads, data }) {
  const allLeads = data?.leads || leads || []
  const totalLeads = data?.metadata?.total_leads || allLeads?.length || 0
  const totalPagos = allLeads?.reduce((s, l) => s + (l.pagado_total_api || 0), 0) || 0
  const reactivables = data?.segment_summary ?
    ['anticipo-sin-cita','plan-sin-cita','nunca-agendo','solo-cancelaciones','ultima-no-asistio','inactivo-90d','inactivo-60d']
      .reduce((s, k) => s + (data.segment_summary[k] || 0), 0) : 0
  const totalCitas = allLeads?.reduce((s, l) => s + (l.total_citas || 0), 0) || 0

  // Elevator stats
  const inElevator = allLeads?.filter(l => l.elevator_id).length || 0
  const withOpp = allLeads?.filter(l => l.elevator_opportunity_id).length || 0
  const pendingElevator = allLeads?.filter(l => l.is_reactivable && !l.elevator_id && !l.elevator_exclude).length || 0

  // Contact stats
  const contacted = allLeads?.filter(l => l.contact_history?.length > 0).length || 0
  const optedOut = allLeads?.filter(l => l.opt_out).length || 0

  // Pilot segment counts
  const pilotSegments = ['anticipo-sin-cita', 'plan-sin-cita', 'nunca-agendo', 'ultima-no-asistio']
  const pilotCount = allLeads?.filter(l => l.is_reactivable && pilotSegments.includes(l.segment) && !l.elevator_exclude).length || 0

  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: Enhanced stats */}
      <DashboardStats totalLeads={totalLeads} totalPagos={totalPagos} reactivables={reactivables} totalCitas={totalCitas} data={data} />

      {/* Row 2: Pipeline health cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Elevator pipeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span>🔄 Elevator</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sincronizados</span>
                <span className="font-semibold">{inElevator}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Con oportunidad</span>
                <span className="font-semibold text-[--lime-pulse]">{withOpp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pendientes de sync</span>
                <span className="font-semibold text-amber-500">{pendingElevator}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact tracking */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span>📞 Contactos</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contactados</span>
                <span className="font-semibold">{contacted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opt-out</span>
                <span className="font-semibold text-red-500">{optedOut}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Por contactar</span>
                <span className="font-semibold text-[--lime-pulse]">{(allLeads?.length || 0) - contacted}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pilot quick-start */}
        <Card className="border-[--lime-pulse]/30 bg-[--lime-pulse]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span>🧪 Piloto reactivación</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Leeds prioritarios</span>
                <span className="font-semibold text-lg">{pilotCount}</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                <Badge variant="outline" className="text-[10px]">5 💳 anticipo</Badge>
                <Badge variant="outline" className="text-[10px]">10 📋 plan</Badge>
                <Badge variant="outline" className="text-[10px]">22 🆕 nunca agendó</Badge>
                <Badge variant="outline" className="text-[10px]">87 ⚠️ última no asistió</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                Primeros en contactar — mensaje: "dejaste un anticipo, ¿agendamos?"
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Revenue chart (wide) */}
      <RevenueChart />

      {/* Row 4: Two panels — cancelación + tratamientos */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RefundReturnRateChart />
        <CategoryRankChart />
      </div>
    </div>
  )
}
