import { createFileRoute, Link } from '@tanstack/react-router'
import { useTelemetryStore } from '../stores/telemetry'
import { TelemetryChart } from '../components/TelemetryChart'
import { MotorControl } from '../components/MotorControl'

export const Route = createFileRoute('/motor/$id')({
  component: MotorDetailPage,
})

function MotorDetailPage() {
  const { id } = Route.useParams()
  const canId = Number(id)

  const motor = useTelemetryStore((s) => s.motors[canId])
  const history = useTelemetryStore((s) => s.history[canId] ?? [])

  if (!motor) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 mb-4">No telemetry data for motor {canId}</p>
        <p className="text-xs text-zinc-600 mb-4">
          The motor may be offline or telemetry is not yet connected.
        </p>
        <Link to="/" className="text-sm text-blue-400 hover:underline">
          Back to overview
        </Link>
      </div>
    )
  }

  const hasFaults = motor.faults.length > 0
  const highTemp = motor.temperature_c > 60

  return (
    <div>
      <div className="mb-6">
        <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          &larr; Overview
        </Link>
        <h2 className="text-xl font-semibold text-zinc-100 mt-2">
          {formatJointName(motor.joint_name)}
        </h2>
        <p className="text-sm text-zinc-500">
          CAN ID {motor.can_id} · {motor.mode} ·{' '}
          <span className={motor.online ? 'text-emerald-400' : 'text-zinc-500'}>
            {motor.online ? 'Online' : 'Offline'}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Position"
          value={`${(motor.angle_rad * 180 / Math.PI).toFixed(1)}°`}
          sub={`${motor.angle_rad.toFixed(3)} rad`}
        />
        <StatCard
          label="Velocity"
          value={`${motor.velocity_rads.toFixed(3)}`}
          sub="rad/s"
        />
        <StatCard
          label="Torque"
          value={`${motor.torque_nm.toFixed(3)}`}
          sub="N·m"
        />
        <StatCard
          label="Temperature"
          value={`${motor.temperature_c.toFixed(1)}°C`}
          warn={highTemp}
        />
      </div>

      <div className="space-y-4 mb-6">
        <TelemetryChart
          history={history}
          dataKey="angle_rad"
          label="Position (rad)"
          unit="rad"
          color="#3b82f6"
        />
        <TelemetryChart
          history={history}
          dataKey="velocity_rads"
          label="Velocity (rad/s)"
          unit="rad/s"
          color="#10b981"
        />
        <TelemetryChart
          history={history}
          dataKey="torque_nm"
          label="Torque (N·m)"
          unit="N·m"
          color="#f59e0b"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MotorControl canId={canId} currentAngleRad={motor.angle_rad} />

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Faults</h3>
          {!hasFaults ? (
            <p className="text-sm text-emerald-400">No faults</p>
          ) : (
            <ul className="space-y-1">
              {motor.faults.map((f, i) => (
                <li key={i} className="text-sm text-red-400 font-mono">{f}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string
  value: string
  sub?: string
  warn?: boolean
}) {
  return (
    <div className={`rounded-lg border bg-zinc-900 p-3 ${warn ? 'border-amber-500/50' : 'border-zinc-800'}`}>
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className={`text-lg font-mono leading-tight ${warn ? 'text-amber-400' : 'text-zinc-100'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}

function formatJointName(name: string): string {
  return name
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
