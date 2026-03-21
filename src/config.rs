use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct RobotConfig {
    pub bus: BusConfig,
    pub actuators: HashMap<String, ActuatorSpec>,
    pub arm_left: Option<ArmConfig>,
    pub arm_right: Option<ArmConfig>,
    pub waist: Option<HashMap<String, JointConfig>>,
    pub torso: Option<TorsoConfig>,
}

#[derive(Debug, Deserialize)]
pub struct BusConfig {
    pub port: String,
    pub baud: u32,
    pub can_bitrate: u32,
    pub host_id: u32,
}

#[derive(Debug, Deserialize)]
pub struct ActuatorSpec {
    pub max_torque: f64,
    pub max_speed: f64,
    pub max_current: f64,
    pub gear_ratio: f64,
    pub weight_kg: f64,
    pub voltage_nominal: f64,
}

#[derive(Debug, Deserialize)]
pub struct ArmConfig {
    pub shoulder_pitch: JointConfig,
    pub shoulder_roll: JointConfig,
    pub upper_arm_yaw: JointConfig,
    pub elbow_pitch: JointConfig,
}

fn default_home_rad() -> f64 {
    0.0
}

fn default_startup_large_error_rad() -> f64 {
    0.35
}

fn default_startup_max_step_rad() -> f64 {
    0.04
}

fn default_startup_settle_tolerance_rad() -> f64 {
    0.03
}

fn default_startup_kp_soft() -> f32 {
    15.0
}

fn default_startup_kd_soft() -> f32 {
    0.9
}

fn default_startup_step_period_ms() -> u64 {
    40
}

fn default_startup_recovery_timeout_secs() -> f64 {
    90.0
}

fn default_true() -> bool {
    true
}

fn default_approach_max_step_rad() -> f64 {
    0.12
}

fn default_approach_kp() -> f32 {
    20.0
}

fn default_approach_kd() -> f32 {
    1.0
}

fn default_approach_step_period_ms() -> u64 {
    25
}

fn default_approach_handoff_rad() -> f64 {
    0.28
}

fn default_approach_max_secs() -> f64 {
    45.0
}

fn default_resistance_torque_nm() -> f32 {
    12.0
}

fn default_resistance_velocity_rads() -> f32 {
    0.15
}

fn default_resistance_confirm_ticks() -> u32 {
    2
}

fn default_resistance_backoff_ms() -> u64 {
    1000
}

fn default_post_stall_motion_scale() -> f64 {
    0.5
}

/// When |position − home| exceeds `large_error_rad` at startup: optional **fast approach** toward
/// home, then **gradual** small steps. If torque stays high while velocity is near zero (stall /
/// contact), the joint holds, waits `resistance_backoff_ms`, then **continues** the same routine
/// with gains and step sizes scaled by `post_stall_motion_scale`.
#[derive(Debug, Deserialize, Clone)]
pub struct StartupRecoveryConfig {
    #[serde(default = "default_startup_large_error_rad")]
    pub large_error_rad: f64,
    #[serde(default = "default_startup_max_step_rad")]
    pub max_step_rad: f64,
    #[serde(default = "default_startup_settle_tolerance_rad")]
    pub settle_tolerance_rad: f64,
    #[serde(default = "default_startup_kp_soft")]
    pub kp_soft: f32,
    #[serde(default = "default_startup_kd_soft")]
    pub kd_soft: f32,
    #[serde(default = "default_startup_step_period_ms")]
    pub step_period_ms: u64,
    #[serde(default = "default_startup_recovery_timeout_secs")]
    pub recovery_timeout_secs: f64,
    #[serde(default = "default_true")]
    pub approach_enabled: bool,
    #[serde(default = "default_approach_max_step_rad")]
    pub approach_max_step_rad: f64,
    #[serde(default = "default_approach_kp")]
    pub approach_kp: f32,
    #[serde(default = "default_approach_kd")]
    pub approach_kd: f32,
    #[serde(default = "default_approach_step_period_ms")]
    pub approach_step_period_ms: u64,
    /// When |error| falls below this, approach stops and the gradual phase finishes the move.
    #[serde(default = "default_approach_handoff_rad")]
    pub approach_handoff_rad: f64,
    /// Wall-clock cap for the approach phase; after this, gradual motion continues until
    /// `recovery_timeout_secs` overall or success.
    #[serde(default = "default_approach_max_secs")]
    pub approach_max_secs: f64,
    #[serde(default = "default_resistance_torque_nm")]
    pub resistance_torque_nm: f32,
    #[serde(default = "default_resistance_velocity_rads")]
    pub resistance_velocity_rads: f32,
    #[serde(default = "default_resistance_confirm_ticks")]
    pub resistance_confirm_ticks: u32,
    /// Hold at the current angle this long after a stall so the obstacle can clear (e.g. 1 s).
    #[serde(
        default = "default_resistance_backoff_ms",
        alias = "resistance_hold_ms"
    )]
    pub resistance_backoff_ms: u64,
    /// After the first stall in a recovery, multiply approach/gradual step sizes and kp/kd by this
    /// (e.g. 0.5 for “half speed / torque”).
    #[serde(default = "default_post_stall_motion_scale")]
    pub post_stall_motion_scale: f64,
    /// For revolute joints: plan motion using the shortest angular path (wrap error to (‑π, π]).
    /// Set false for prismatic / non-periodic position semantics.
    #[serde(default = "default_true")]
    pub prefer_shortest_angle: bool,
}

impl Default for StartupRecoveryConfig {
    fn default() -> Self {
        Self {
            large_error_rad: default_startup_large_error_rad(),
            max_step_rad: default_startup_max_step_rad(),
            settle_tolerance_rad: default_startup_settle_tolerance_rad(),
            kp_soft: default_startup_kp_soft(),
            kd_soft: default_startup_kd_soft(),
            step_period_ms: default_startup_step_period_ms(),
            recovery_timeout_secs: default_startup_recovery_timeout_secs(),
            approach_enabled: default_true(),
            approach_max_step_rad: default_approach_max_step_rad(),
            approach_kp: default_approach_kp(),
            approach_kd: default_approach_kd(),
            approach_step_period_ms: default_approach_step_period_ms(),
            approach_handoff_rad: default_approach_handoff_rad(),
            approach_max_secs: default_approach_max_secs(),
            resistance_torque_nm: default_resistance_torque_nm(),
            resistance_velocity_rads: default_resistance_velocity_rads(),
            resistance_confirm_ticks: default_resistance_confirm_ticks(),
            resistance_backoff_ms: default_resistance_backoff_ms(),
            post_stall_motion_scale: default_post_stall_motion_scale(),
            prefer_shortest_angle: default_true(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct JointConfig {
    pub can_id: Option<u8>,
    pub actuator: String,
    pub limits: (f64, f64),
    /// Command-space “home” used for startup distance checks (radians).
    #[serde(default = "default_home_rad")]
    pub home_rad: f64,
    #[serde(default)]
    pub startup_recovery: StartupRecoveryConfig,
}

#[derive(Debug, Deserialize)]
pub struct TorsoConfig {
    pub frame: String,
    pub dimensions_mm: (u32, u32, u32),
}

impl RobotConfig {
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let contents = std::fs::read_to_string(path.as_ref())
            .with_context(|| format!("Failed to read config: {}", path.as_ref().display()))?;
        let config: RobotConfig = serde_yaml::from_str(&contents)
            .with_context(|| "Failed to parse robot.yaml")?;
        Ok(config)
    }
}

impl ArmConfig {
    pub fn joints(&self) -> [(&str, &JointConfig); 4] {
        [
            ("shoulder_pitch", &self.shoulder_pitch),
            ("shoulder_roll", &self.shoulder_roll),
            ("upper_arm_yaw", &self.upper_arm_yaw),
            ("elbow_pitch", &self.elbow_pitch),
        ]
    }

    pub fn active_joints(&self) -> Vec<(&str, &JointConfig)> {
        self.joints()
            .into_iter()
            .filter(|(_, j)| j.can_id.is_some())
            .collect()
    }
}
