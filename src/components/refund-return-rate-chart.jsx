"use client"

import { IconPlaceholder } from "@/components/ui/icon-placeholder"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta"

// Mock cancellation data
const cancellationData = [
  { day: "Mon", rate: 12 },
  { day: "Tue", rate: 8 },
  { day: "Wed", rate: 15 },
  { day: "Thu", rate: 7 },
  { day: "Fri", rate: 10 },
  { day: "Sat", rate: 5 },
  { day: "Sun", rate: 3 },
]

const chartConfig = {
  rate: {
    label: "Cancelaciones",
    color: "var(--chart-4)",
  },
}

export function RefundReturnRateChart() {
  // Average cancellation rate
  const avgRate = cancellationData.reduce((s, d) => s + d.rate, 0) / cancellationData.length
  const weekAvg = 8.5 // benchmark

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Tasa de cancelación</CardTitle>
          <CardDescription>Últimos 7 días</CardDescription>
        </div>
        <div className="text-right">
          <p className="font-semibold text-2xl tabular-nums">{avgRate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">de citas canceladas</p>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer className="aspect-auto h-40 w-full p-0" config={chartConfig}>
          <LineChart
            accessibilityLayer
            data={cancellationData}
            margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid horizontal={false} strokeDasharray="2 2" />
            <XAxis
              axisLine={false}
              dataKey="day"
              tickLine={false}
              tickMargin={6}
              fontSize={11}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="min-w-28"
                  indicator="line"
                  labelFormatter={(label) => `${label}`}
                />
              }
            />
            <Line
              dataKey="rate"
              dot={false}
              stroke="var(--color-rate)"
              strokeWidth={2}
              type="monotone"
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-muted-foreground text-xs">
          <Delta value={((avgRate - weekAvg) / weekAvg) * 100}>
            <DeltaIcon />
            <DeltaValue />
          </Delta>
          <p>vs promedio semanal</p>
        </div>
        <Button asChild className="text-muted-foreground" size="xs" variant="ghost">
          <a href="#">
            Ver detalle
            <IconPlaceholder lucide="ArrowRight" className="ml-1" />
          </a>
        </Button>
      </CardFooter>
    </Card>
  )
}
