import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getMotors, type MotorInfo } from '../lib/api'
import { MotorCard } from '../components/MotorCard'

export const Route = createFileRoute('/')({
  component: OverviewPage,
})

function OverviewPage() {
  const [motors, setMotors] = useState<MotorInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getMotors()
      .then(setMotors)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500 text-sm">Loading motors...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-2">Failed to load motors</p>
          <p className="text-zinc-500 text-xs font-mono">{error}</p>
        </div>
      </div>
    )
  }

  const onlineMotors = motors.filter((m) => m.online)
  const offlineMotors = motors.filter((m) => !m.online)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-100">Overview</h2>
        <p className="text-sm text-zinc-500 mt-1">
          {motors.length} motor{motors.length !== 1 ? 's' : ''} configured
          {onlineMotors.length > 0 && (
            <span className="text-emerald-400"> · {onlineMotors.length} online</span>
          )}
        </p>
      </div>

      {onlineMotors.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wider">
            Online
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {onlineMotors.map((motor) => (
              <MotorCard
                key={motor.can_id}
                motor={motor}
                onClick={() => navigate({ to: '/motor/$id', params: { id: String(motor.can_id) } })}
              />
            ))}
          </div>
        </section>
      )}

      {offlineMotors.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wider">
            {onlineMotors.length > 0 ? 'Offline / Unassigned' : 'All Motors'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {offlineMotors.map((motor) => (
              <MotorCard
                key={motor.can_id}
                motor={motor}
                onClick={() => navigate({ to: '/motor/$id', params: { id: String(motor.can_id) } })}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
