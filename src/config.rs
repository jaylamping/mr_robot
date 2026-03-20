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

#[derive(Debug, Deserialize)]
pub struct JointConfig {
    pub can_id: Option<u8>,
    pub actuator: String,
    pub limits: (f64, f64),
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
