import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { MotorInfo } from '@/lib/api'
import { useTelemetryStore, type MotorSnapshot } from '@/stores/telemetry'

interface MotorCardProps {
  motor: MotorInfo
  onClick?: () => void
}

export function MotorCard({ motor, onClick }: MotorCardProps) {
  const live = useTelemetryStore((s) => s.motors[motor.can_id]) as MotorSnapshot | undefined

  const isOnline = live?.online ?? motor.online
  const hasFaults = (live?.faults?.length ?? 0) > 0
  const highTemp = (live?.temperature_c ?? 0) > 60

  const statusVariant = hasFaults
    ? 'destructive'
    : isOnline
      ? 'default'
      : 'secondary'

  const statusLabel = hasFaults
    ? 'Fault'
    : highTemp
      ? 'Hot'
      : isOnline
        ? 'Online'
        : 'Offline'

  const dotColor = hasFaults
    ? 'bg-red-500'
    : highTemp
      ? 'bg-amber-500'
      : isOnline
        ? 'bg-emerald-500 animate-pulse'
        : 'bg-muted-foreground'

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      size="sm"
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{formatJointName(motor.joint_name)}</CardTitle>
          <Badge variant={statusVariant} className="gap-1.5">
            <span className={`inline-block size-1.5 rounded-full ${dotColor}`} />
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <Row label="CAN ID" value={<span className="font-mono">{motor.can_id}</span>} />
          <Row label="Actuator" value={<span className="uppercase">{motor.actuator_type}</span>} />
          {live?.mode && (
            <Row label="Mode" value={live.mode} />
          )}
          {live && isOnline ? (
            <>
              <Row label="Position" value={<span className="font-mono">{((live.angle_rad * 180) / Math.PI).toFixed(1)}°</span>} />
              <Row label="Velocity" value={<span className="font-mono">{live.velocity_rads.toFixed(2)} rad/s</span>} />
              <Row label="Torque" value={<span className="font-mono">{live.torque_nm.toFixed(2)} N·m</span>} />
              <Row
                label="Temp"
                value={
                  <span className={`font-mono ${highTemp ? 'text-amber-400' : ''}`}>
                    {live.temperature_c.toFixed(1)} °C
                  </span>
                }
              />
            </>
          ) : (
            <Row
              label="Limits"
              value={
                <span className="font-mono">
                  {((motor.limits[0] * 180) / Math.PI).toFixed(0)}° / {((motor.limits[1] * 180) / Math.PI).toFixed(0)}°
                </span>
              }
            />
          )}
        </div>

        {hasFaults && live && (
          <div className="mt-2 border-t pt-2">
            {live.faults.map((f, i) => (
              <p key={i} className="truncate font-mono text-xs text-destructive">{f}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}

function formatJointName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
