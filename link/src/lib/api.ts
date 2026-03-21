export interface MotorInfo {
  can_id: number
  joint_name: string
  actuator_type: string
  limits: [number, number]
  online: boolean
}

export interface MotorDetail extends MotorInfo {
  angle_rad: number
  velocity_rads: number
  torque_nm: number
  temperature_c: number
  mode: string
  faults: string[]
}

export interface CommandResponse {
  success: boolean
  error?: string
  angle_rad?: number
  velocity_rads?: number
  torque_nm?: number
}

export interface RobotConfig {
  bus: {
    port: string
    baud: number
    can_bitrate: number
    host_id: number
  }
  actuators: Record<string, {
    max_torque: number
    max_speed: number
    max_current: number
    gear_ratio: number
    weight_kg: number
    voltage_nominal: number
  }>
  arm_left?: Record<string, unknown>
  arm_right?: Record<string, unknown>
  waist?: Record<string, unknown>
  torso?: {
    frame: string
    dimensions_mm: [number, number, number]
  }
}

const BASE = '/api'

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  return res.json()
}

export function getConfig(): Promise<RobotConfig> {
  return fetchJson('/config')
}

export function getMotors(): Promise<MotorInfo[]> {
  return fetchJson('/motors')
}

export function getMotor(id: number): Promise<MotorDetail> {
  return fetchJson(`/motors/${id}`)
}

export function enableMotor(id: number): Promise<CommandResponse> {
  return fetchJson(`/motors/${id}/enable`, { method: 'POST' })
}

export function disableMotor(id: number): Promise<CommandResponse> {
  return fetchJson(`/motors/${id}/disable`, { method: 'POST' })
}

export function zeroMotor(id: number): Promise<CommandResponse> {
  return fetchJson(`/motors/${id}/zero`, { method: 'POST' })
}

export function moveMotor(
  id: number,
  position_rad: number,
  kp?: number,
  kd?: number,
): Promise<CommandResponse> {
  return fetchJson(`/motors/${id}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position_rad, kp, kd }),
  })
}

export function controlMotor(
  id: number,
  position: number,
  velocity: number,
  kp: number,
  kd: number,
  torque: number,
): Promise<CommandResponse> {
  return fetchJson(`/motors/${id}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position, velocity, kp, kd, torque }),
  })
}
