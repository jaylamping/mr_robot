import { createRootRoute, Link, Outlet, useMatches } from '@tanstack/react-router'
import { useState } from 'react'
import { useWebTransport } from '@/hooks/useWebTransport'
import { useTelemetryStore } from '@/stores/telemetry'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboardIcon,
  CpuIcon,
  ArmchairIcon,
  SettingsIcon,
  ScrollTextIcon,
  MenuIcon,
  BotIcon,
} from 'lucide-react'

export const Route = createRootRoute({
  component: RootLayout,
})

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboardIcon },
  { to: '/system', label: 'System', icon: CpuIcon },
  { to: '/arms', label: 'Arms', icon: ArmchairIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/logs', label: 'Logs', icon: ScrollTextIcon },
] as const

function RootLayout() {
  useWebTransport()
  const connected = useTelemetryStore((s) => s.connected)
  const motorCount = useTelemetryStore((s) => Object.keys(s.motors).length)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <nav className="hidden w-56 shrink-0 border-r md:flex md:flex-col">
        <SidebarContent connected={connected} motorCount={motorCount} />
      </nav>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="flex h-12 items-center border-b px-3 md:hidden">
          <SheetTrigger render={<Button variant="ghost" size="icon" />}>
            <MenuIcon className="size-5" />
          </SheetTrigger>
          <span className="ml-2 text-sm font-semibold">Link</span>
        </div>
        <SheetContent side="left" className="w-56 p-0">
          <SidebarContent
            connected={connected}
            motorCount={motorCount}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function SidebarContent({
  connected,
  motorCount,
  onNavigate,
}: {
  connected: boolean
  motorCount: number
  onNavigate?: () => void
}) {
  const matches = useMatches()
  const currentPath = matches[matches.length - 1]?.fullPath ?? '/'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-4">
        <BotIcon className="size-5 text-primary" />
        <div>
          <h1 className="text-base font-bold leading-tight">Link</h1>
          <p className="text-xs text-muted-foreground">Robot Control</p>
        </div>
      </div>

      <ScrollArea className="flex-1 p-2">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.to === '/'
              ? currentPath === '/'
              : currentPath.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </ScrollArea>

      <Separator />
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`inline-block size-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
          {connected ? 'Telemetry connected' : 'Telemetry disconnected'}
        </div>
        {motorCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {motorCount} motor{motorCount !== 1 ? 's' : ''} registered
          </p>
        )}
      </div>
    </div>
  )
}
