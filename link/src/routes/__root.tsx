import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { useWebTransport } from '../hooks/useWebTransport'
import { useTelemetryStore } from '../stores/telemetry'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  useWebTransport()
  const connected = useTelemetryStore((s) => s.connected)

  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-lg font-bold tracking-tight text-zinc-100">
            Link
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Robot Control</p>
        </div>

        <div className="flex-1 p-3 space-y-1">
          <NavLink to="/" label="Overview" />
        </div>

        <div className="p-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
            {connected ? 'Telemetry connected' : 'Telemetry disconnected'}
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="block px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
      activeProps={{ className: 'block px-3 py-2 rounded-md text-sm text-zinc-100 bg-zinc-800' }}
    >
      {label}
    </Link>
  )
}
