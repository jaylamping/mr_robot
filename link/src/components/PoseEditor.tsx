import { useState } from 'react'
import { useTelemetryStore } from '@/stores/telemetry'
import type { ArmJointInfo } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { LuSave, LuPlay, LuCamera, LuTrash2 } from 'react-icons/lu'

interface Pose {
  name: string
  joints: Record<string, number>
}

const BUILTIN_POSES: Pose[] = [
  {
    name: 'Arms Down',
    joints: { shoulder_pitch: 0, shoulder_roll: 0, upper_arm_yaw: 0, elbow_pitch: 0 },
  },
  {
    name: 'Wave',
    joints: { shoulder_pitch: 1.57, shoulder_roll: 0, upper_arm_yaw: 0, elbow_pitch: 1.2 },
  },
  {
    name: 'T-Pose',
    joints: { shoulder_pitch: 1.57, shoulder_roll: 0, upper_arm_yaw: 0, elbow_pitch: 0 },
  },
]

const STORAGE_KEY = 'link-poses'

function loadSavedPoses(): Pose[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePoses(poses: Pose[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(poses))
}

interface PoseEditorProps {
  armSide: string
  joints: ArmJointInfo[]
  onApply: (jointPositions: Record<string, number>) => void
}

export function PoseEditor({ joints, onApply }: PoseEditorProps) {
  const [customPoses, setCustomPoses] = useState<Pose[]>(loadSavedPoses)
  const [selectedPose, setSelectedPose] = useState<string>('')
  const [editValues, setEditValues] = useState<Record<string, number>>({})
  const motors = useTelemetryStore((s) => s.motors)

  const allPoses = [...BUILTIN_POSES, ...customPoses]

  function selectPose(poseName: string) {
    setSelectedPose(poseName)
    const pose = allPoses.find((p) => p.name === poseName)
    if (pose) {
      setEditValues({ ...pose.joints })
    }
  }

  function updateJointValue(jointName: string, value: number) {
    setEditValues((prev) => ({ ...prev, [jointName]: value }))
  }

  function teachFromCurrent() {
    const positions: Record<string, number> = {}
    for (const joint of joints) {
      if (joint.can_id != null) {
        const m = motors[joint.can_id]
        positions[joint.name] = m?.angle_rad ?? 0
      }
    }
    setEditValues(positions)
    setSelectedPose('')
  }

  function handleApply() {
    onApply(editValues)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Poses</p>
        <Button variant="ghost" size="xs" onClick={teachFromCurrent}>
          <LuCamera className="size-3" />
          Teach
        </Button>
      </div>

      <div className="flex gap-2">
        <Select value={selectedPose} onValueChange={(v) => { if (v) selectPose(v) }}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a pose..." />
          </SelectTrigger>
          <SelectContent>
            {BUILTIN_POSES.map((p) => (
              <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
            ))}
            {customPoses.length > 0 && (
              <>
                {customPoses.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.name} (custom)
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {Object.keys(editValues).length > 0 && (
        <div className="space-y-2">
          {joints.map((joint) => {
            const val = editValues[joint.name]
            if (val == null) return null
            const minDeg = (joint.limits[0] * 180) / Math.PI
            const maxDeg = (joint.limits[1] * 180) / Math.PI
            const valDeg = (val * 180) / Math.PI

            return (
              <div key={joint.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{formatJointName(joint.name)}</span>
                  <span className="font-mono">{valDeg.toFixed(1)}°</span>
                </div>
                <Slider
                  value={[valDeg]}
                  onValueChange={(v) => {
                    const arr = Array.isArray(v) ? v : [v]
                    updateJointValue(joint.name, (arr[0] * Math.PI) / 180)
                  }}
                  min={minDeg}
                  max={maxDeg}
                  step={0.5}
                />
              </div>
            )
          })}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleApply} className="flex-1">
              <LuPlay className="size-4" />
              Apply Pose
            </Button>
            <SavePoseDialog
              values={editValues}
              onSave={(name) => {
                const pose: Pose = { name, joints: { ...editValues } }
                const updated = [...customPoses.filter((p) => p.name !== name), pose]
                setCustomPoses(updated)
                savePoses(updated)
                setSelectedPose(name)
              }}
            />
            {customPoses.some((p) => p.name === selectedPose) && (
              <Button
                variant="destructive"
                size="icon"
                onClick={() => {
                  const updated = customPoses.filter((p) => p.name !== selectedPose)
                  setCustomPoses(updated)
                  savePoses(updated)
                  setSelectedPose('')
                  setEditValues({})
                }}
              >
                <LuTrash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SavePoseDialog({
  values,
  onSave,
}: {
  values: Record<string, number>
  onSave: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="icon" />}>
        <LuSave className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Pose</DialogTitle>
        </DialogHeader>
        <div>
          <label className="text-sm text-muted-foreground">Pose Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Pose"
            className="mt-1"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {Object.entries(values).map(([k, v]) => (
            <span key={k} className="mr-3">{k}: {((v * 180) / Math.PI).toFixed(1)}°</span>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              onSave(name.trim())
              setOpen(false)
              setName('')
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatJointName(name: string): string {
  return name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
