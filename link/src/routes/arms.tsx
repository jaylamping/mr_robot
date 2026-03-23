import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getArms, enableArm, disableArm, homeArm, setArmPose, type ArmInfo, type CommandResponse } from '@/lib/api'
import { useTelemetryStore } from '@/stores/telemetry'
import { PoseEditor } from '@/components/PoseEditor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { LuPower, LuPowerOff, LuHouse } from 'react-icons/lu'

export const Route = createFileRoute('/arms')({
  component: ArmsPage,
})

function ArmsPage() {
  const [arms, setArms] = useState<ArmInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getArms()
      .then(setArms)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Loading arm configuration...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    )
  }

  if (arms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <h2 className="text-lg font-medium mb-1">No arms configured</h2>
        <p className="text-sm text-muted-foreground">
          Add arm joint CAN IDs to <code className="text-xs bg-muted px-1 py-0.5 rounded">config/robot.yaml</code>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Arm Control</h2>
      <div className="space-y-6">
        {arms.map((arm) => (
          <ArmPanel key={arm.side} arm={arm} />
        ))}
      </div>
    </div>
  )
}

function ArmPanel({ arm }: { arm: ArmInfo }) {
  const [busy, setBusy] = useState(false)
  const motors = useTelemetryStore((s) => s.motors)

  const onlineJoints = arm.joints.filter((j) => j.can_id != null && motors[j.can_id]?.online)
  const totalJoints = arm.joints.filter((j) => j.can_id != null).length

  async function exec(label: string, fn: () => Promise<CommandResponse>) {
    setBusy(true)
    try {
      const res = await fn()
      if (res.success) {
        toast.success(`${arm.side} arm: ${label}`, {
          description: res.error ?? undefined,
        })
      } else {
        toast.error(`${arm.side} arm: ${label} failed`, { description: res.error })
      }
    } catch (e) {
      toast.error(`${arm.side} arm: ${label} failed`, {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="capitalize">{arm.side} Arm</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {onlineJoints.length}/{totalJoints} joints online
            </p>
          </div>
          <div className="flex gap-2">
            <ConfirmAction
              label="Enable All"
              icon={<LuPower className="size-4" />}
              description={`Enable all ${totalJoints} joints on the ${arm.side} arm. Motors will energize.`}
              disabled={busy}
              onConfirm={() => exec('Enable All', () => enableArm(arm.side))}
            />
            <ConfirmAction
              label="Disable All"
              icon={<LuPowerOff className="size-4" />}
              description={`Disable all joints on the ${arm.side} arm. Motors will de-energize and may drop.`}
              variant="destructive"
              disabled={busy}
              onConfirm={() => exec('Disable All', () => disableArm(arm.side))}
            />
            <ConfirmAction
              label="Home"
              icon={<LuHouse className="size-4" />}
              description={`Run startup recovery on all ${arm.side} arm joints. Joints will move toward home position.`}
              disabled={busy}
              onConfirm={() => exec('Home', () => homeArm(arm.side))}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {arm.joints.map((joint) => (
          <JointSlider key={joint.name} joint={joint} />
        ))}

        <Separator />

        <PoseEditor
          armSide={arm.side}
          joints={arm.joints}
          onApply={(pose) =>
            exec('Set Pose', () => setArmPose(arm.side, { joints: pose }))
          }
        />
      </CardContent>
    </Card>
  )
}

function JointSlider({
  joint,
}: {
  joint: ArmInfo['joints'][number]
}) {
  const motor = useTelemetryStore((s) => joint.can_id != null ? s.motors[joint.can_id] : undefined)

  const minDeg = (joint.limits[0] * 180) / Math.PI
  const maxDeg = (joint.limits[1] * 180) / Math.PI
  const currentDeg = motor ? (motor.angle_rad * 180) / Math.PI : null
  const isOnline = motor?.online ?? false

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{formatJointName(joint.name)}</span>
          {joint.can_id != null && (
            <Link
              to="/motor/$id"
              params={{ id: String(joint.can_id) }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              CAN {joint.can_id}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentDeg != null && (
            <span className="text-xs font-mono text-muted-foreground">{currentDeg.toFixed(1)}°</span>
          )}
          <Badge variant={isOnline ? 'default' : 'secondary'} className="text-xs">
            {isOnline ? 'Online' : joint.can_id == null ? 'N/A' : 'Offline'}
          </Badge>
        </div>
      </div>
      <div className="relative">
        <Slider
          value={currentDeg != null ? [currentDeg] : [0]}
          min={minDeg}
          max={maxDeg}
          step={0.5}
          disabled
        />
        <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground font-mono">
          <span>{minDeg.toFixed(0)}°</span>
          <span>home: {((joint.home_rad * 180) / Math.PI).toFixed(0)}°</span>
          <span>{maxDeg.toFixed(0)}°</span>
        </div>
      </div>
    </div>
  )
}

function ConfirmAction({
  label,
  icon,
  description,
  variant = 'outline',
  disabled,
  onConfirm,
}: {
  label: string
  icon: React.ReactNode
  description: string
  variant?: 'outline' | 'destructive'
  disabled?: boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} size="sm" disabled={disabled} />}>
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm: {label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant={variant === 'destructive' ? 'destructive' : 'default'} onClick={() => { setOpen(false); onConfirm() }}>
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatJointName(name: string): string {
  return name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
