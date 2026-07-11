import React from "react"
import { LabelList, Pie, PieChart } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent } from "@/components/ui/chart"

const SLICE_PALETTE = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"
]
const MAX_NAMED_SLICES = 4

// Real treatment data computed from leads
import { treatmentCategories } from "./revenue-chart-data"

function consolidateTopFourAndOthers(data) {
  if (data.length <= MAX_NAMED_SLICES) return [...data]
  const sorted = [...data].sort((a, b) => b.count - a.count)
  const head = sorted.slice(0, MAX_NAMED_SLICES)
  const tail = sorted.slice(MAX_NAMED_SLICES)
  const othersCount = tail.reduce((sum, row) => sum + row.count, 0)
  return [...head, { category: "Otros", count: othersCount }]
}

function buildSlices(data) {
  const total = data.reduce((s, r) => s + r.count, 0) || 1
  const chartConfig = { count: { label: "Pacientes" } }
  const pieData = data.map((row, i) => {
    const key = `s${i}`
    const color = SLICE_PALETTE[i % SLICE_PALETTE.length]
    chartConfig[key] = { label: row.category, color }
    return { key, category: row.category, share: Math.round(row.count / total * 100), fill: `var(--color-${key})` }
  })
  return { chartConfig, pieData }
}

export function CategoryRankChart() {
  const { chartConfig, pieData } = React.useMemo(() => buildSlices(consolidateTopFourAndOthers(treatmentCategories)), [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tratamientos más comunes</CardTitle>
        <CardDescription>Distribución de pacientes por tratamiento</CardDescription>
      </CardHeader>
      <CardContent className="my-auto p-0">
        <ChartContainer className="aspect-auto h-72 w-full" config={chartConfig}>
          <PieChart accessibilityLayer>
            <Pie cornerRadius={4} data={pieData} dataKey="share" innerRadius={50} nameKey="key" outerRadius="88%" stroke="var(--card)" strokeWidth={4}>
              <LabelList className="fill-background font-medium" dataKey="share" fill="currentColor" fontWeight={500}
                formatter={(label) => { const n = Number(label); return Number.isFinite(n) ? `${n}%` : String(label ?? "") }}
                position="inside" stroke="none" />
            </Pie>
            <ChartLegend content={<ChartLegendContent className="flex flex-wrap gap-3 pt-2" nameKey="key" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
