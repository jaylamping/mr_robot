import { useNavigate } from '@tanstack/react-router'
import { useTelemetryStore } from '@/stores/telemetry'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface JointDef {
  id: string
  label: string
  canId: number | null
  cx: number
  cy: number
}

interface SegmentDef {
  x1: number
  y1: number
  x2: number
  y2: number
}

const TORSO: { x: number; y: number; w: number; h: number } = { x: 130, y: 80, w: 40, h: 80 }

const SEGMENTS: SegmentDef[] = [
  // Left arm
  { x1: 130, y1: 95, x2: 105, y2: 95 },  // shoulder to shoulder_pitch
  { x1: 105, y1: 95, x2: 85, y2: 95 },   // shoulder_pitch to shoulder_roll
  { x1: 85, y1: 95, x2: 65, y2: 120 },   // shoulder_roll to upper_arm_yaw
  { x1: 65, y1: 120, x2: 55, y2: 155 },  // upper_arm_yaw to elbow
  // Right arm
  { x1: 170, y1: 95, x2: 195, y2: 95 },
  { x1: 195, y1: 95, x2: 215, y2: 95 },
  { x1: 215, y1: 95, x2: 235, y2: 120 },
  { x1: 235, y1: 120, x2: 245, y2: 155 },
  // Waist
  { x1: 150, y1: 160, x2: 150, y2: 175 },
]

interface RobotDiagramProps {
  armLeftCanIds?: (number | null)[]
  armRightCanIds?: (number | null)[]
  waistCanId?: number | null
}

export function RobotDiagram({
  armLeftCanIds = [null, null, null, null],
  armRightCanIds = [null, null, null, null],
  waistCanId = null,
}: RobotDiagramProps) {
  const navigate = useNavigate()
  const motors = useTelemetryStore((s) => s.motors)

  const joints: JointDef[] = [
    // Left arm
    { id: 'left_shoulder_pitch', label: 'L Shoulder Pitch', canId: armLeftCanIds[0], cx: 105, cy: 95 },
    { id: 'left_shoulder_roll', label: 'L Shoulder Roll', canId: armLeftCanIds[1], cx: 85, cy: 95 },
    { id: 'left_upper_arm_yaw', label: 'L Upper Arm Yaw', canId: armLeftCanIds[2], cx: 65, cy: 120 },
    { id: 'left_elbow_pitch', label: 'L Elbow Pitch', canId: armLeftCanIds[3], cx: 55, cy: 155 },
    // Right arm
    { id: 'right_shoulder_pitch', label: 'R Shoulder Pitch', canId: armRightCanIds[0], cx: 195, cy: 95 },
    { id: 'right_shoulder_roll', label: 'R Shoulder Roll', canId: armRightCanIds[1], cx: 215, cy: 95 },
    { id: 'right_upper_arm_yaw', label: 'R Upper Arm Yaw', canId: armRightCanIds[2], cx: 235, cy: 120 },
    { id: 'right_elbow_pitch', label: 'R Elbow Pitch', canId: armRightCanIds[3], cx: 245, cy: 155 },
    // Waist
    { id: 'waist_rotation', label: 'Waist Rotation', canId: waistCanId, cx: 150, cy: 175 },
  ]

  function getJointColor(canId: number | null): string {
    if (canId == null) return 'hsl(var(--muted-foreground))'
    const m = motors[canId]
    if (!m) return 'hsl(var(--muted-foreground))'
    if (m.faults.length > 0) return '#ef4444'
    if (m.temperature_c > 60) return '#f59e0b'
    if (m.online) return '#10b981'
    return 'hsl(var(--muted-foreground))'
  }

  function getJointStatus(canId: number | null): string {
    if (canId == null) return 'Not assigned'
    const m = motors[canId]
    if (!m) return 'No data'
    if (m.faults.length > 0) return `Fault: ${m.faults[0]}`
    if (!m.online) return 'Offline'
    return `${((m.angle_rad * 180) / Math.PI).toFixed(1)}° · ${m.mode}`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Robot</CardTitle>
      </CardHeader>
      <CardContent className="flex justify-center">
        <svg viewBox="20 30 260 180" className="w-full max-w-xs">
          {/* Head */}
          <circle cx={150} cy={55} r={18} fill="none" stroke="hsl(var(--border))" strokeWidth={1.5} />
          <circle cx={144} cy={51} r={2} fill="hsl(var(--muted-foreground))" />
          <circle cx={156} cy={51} r={2} fill="hsl(var(--muted-foreground))" />

          {/* Torso */}
          <rect
            x={TORSO.x}
            y={TORSO.y}
            width={TORSO.w}
            height={TORSO.h}
            rx={4}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={1.5}
          />

          {/* Limb segments */}
          {SEGMENTS.map((seg, i) => (
            <line
              key={i}
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke="hsl(var(--border))"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}

          {/* Joint circles */}
          {joints.map((joint) => (
            <Tooltip key={joint.id}>
              <TooltipTrigger
                render={
                  <circle
                    cx={joint.cx}
                    cy={joint.cy}
                    r={6}
                    fill={getJointColor(joint.canId)}
                    stroke="hsl(var(--background))"
                    strokeWidth={1.5}
                    className="cursor-pointer transition-all hover:opacity-80"
                    onClick={() => {
                      if (joint.canId != null) {
                        navigate({ to: '/motor/$id', params: { id: String(joint.canId) } })
                      }
                    }}
                  />
                }
              />
              <TooltipContent side="top" className="text-xs">
                <p className="font-medium">{joint.label}</p>
                <p className="text-muted-foreground">
                  {joint.canId != null ? `CAN ${joint.canId} · ` : ''}
                  {getJointStatus(joint.canId)}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </svg>
      </CardContent>
    </Card>
  )
}
