import { CategoryRankChart } from "@/components/category-rank-chart"
import { QuickActions } from "@/components/quick-actions"
import { RefundReturnRateChart } from "@/components/refund-return-rate-chart"
import { RevenueChart } from "@/components/revenue-chart"
import { DashboardStats } from "@/components/stats"

export function Dashboard({ leads, data }) {
  const totalLeads = data?.metadata?.total_leads || leads?.length || 0
  const totalPagos = data?.metadata?.pagos_api_total || 0
  const reactivables = data?.segment_summary ?
    ['anticipo-sin-cita','plan-sin-cita','nunca-agendo','solo-cancelaciones','ultima-no-asistio','inactivo-90d','inactivo-60d']
      .reduce((s, k) => s + (data.segment_summary[k] || 0), 0) : 0
  const totalCitas = leads?.reduce((s, l) => s + (l.total_citas || 0), 0) || 0

  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: Summary stats cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardStats totalLeads={totalLeads} totalPagos={totalPagos} reactivables={reactivables} totalCitas={totalCitas} />
      </div>

      {/* Row 2: Revenue chart (wide) */}
      <RevenueChart />

      {/* Row 3: Three panels */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <RefundReturnRateChart />
        <CategoryRankChart />
        <QuickActions />
      </div>
    </div>
  )
}
