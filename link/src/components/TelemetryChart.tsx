import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { MotorSnapshot } from '@/stores/telemetry'

interface TelemetryChartProps {
  history: MotorSnapshot[]
  dataKey: keyof MotorSnapshot
  label: string
  unit: string
  color: string
  rateHz?: number
}

export function TelemetryChart({
  history,
  dataKey,
  label,
  unit,
  color,
  rateHz = 20,
}: TelemetryChartProps) {
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState<MotorSnapshot[]>([])

  const displayData = paused ? frozen : history
  const totalSamples = displayData.length

  const data = displayData.map((snap, i) => ({
    secsAgo: -((totalSamples - 1 - i) / rateHz),
    value: snap[dataKey] as number,
  }))

  function togglePause() {
    if (!paused) {
      setFrozen([...history])
    }
    setPaused(!paused)
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">{label}</CardTitle>
        <CardAction>
          <Button variant="ghost" size="xs" onClick={togglePause}>
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="secsAgo"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickFormatter={(v: number) => `${v.toFixed(0)}s`}
              type="number"
              domain={['dataMin', 0]}
            />
            <YAxis
              width={55}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
                fontSize: '12px',
                color: 'hsl(var(--popover-foreground))',
              }}
              labelStyle={{ display: 'none' }}
              formatter={(value) => [
                `${Number(value).toFixed(3)} ${unit}`,
                label,
              ]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
