use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::AppState;
use crate::telemetry::build_joint_name_map;

#[derive(Serialize)]
struct MotorInfo {
    can_id: u8,
    joint_name: String,
    actuator_type: String,
    limits: (f64, f64),
    online: bool,
}

#[derive(Serialize)]
struct MotorDetail {
    can_id: u8,
    joint_name: String,
    actuator_type: String,
    limits: (f64, f64),
    online: bool,
    angle_rad: f32,
    velocity_rads: f32,
    torque_nm: f32,
    temperature_c: f32,
    mode: String,
    faults: Vec<String>,
}

#[derive(Deserialize)]
struct MoveRequest {
    position_rad: f32,
    kp: Option<f32>,
    kd: Option<f32>,
}

#[derive(Deserialize)]
struct ControlRequest {
    position: f32,
    velocity: f32,
    kp: f32,
    kd: f32,
    torque: f32,
}

#[derive(Serialize)]
struct CommandResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    angle_rad: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    velocity_rads: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    torque_nm: Option<f32>,
}

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/config", get(get_config))
        .route("/cert-hash", get(get_cert_hash))
        .route("/motors", get(get_motors))
        .route("/motors/{id}", get(get_motor))
        .route("/motors/{id}/enable", post(enable_motor))
        .route("/motors/{id}/disable", post(disable_motor))
        .route("/motors/{id}/zero", post(zero_motor))
        .route("/motors/{id}/move", post(move_motor))
        .route("/motors/{id}/control", post(control_motor))
}

async fn get_config(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(serde_json::to_value(&state.config).unwrap())
}

async fn get_cert_hash(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    #[derive(Serialize)]
    struct CertHash {
        hash_b64: String,
        port: u16,
    }
    Json(CertHash {
        hash_b64: state.cert_hash_b64.clone(),
        port: state.wt_port,
    })
}

async fn get_motors(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let joint_map = build_joint_name_map(&state);
    let motors = state.motors.lock().await;

    let mut infos: Vec<MotorInfo> = Vec::new();

    for (&can_id, _motor) in motors.iter() {
        let joint_name = joint_map
            .get(&can_id)
            .cloned()
            .unwrap_or_else(|| format!("motor_{}", can_id));

        let (actuator_type, limits) = find_joint_config(&state, can_id);

        infos.push(MotorInfo {
            can_id,
            joint_name,
            actuator_type,
            limits,
            online: true,
        });
    }

    collect_configured_motors(&state, &motors, &joint_map, &mut infos);

    infos.sort_by_key(|m| m.can_id);
    Json(infos)
}

async fn get_motor(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u8>,
) -> Result<impl IntoResponse, StatusCode> {
    let mut motors = state.motors.lock().await;
    let joint_map = build_joint_name_map(&state);

    let motor = motors.get_mut(&id).ok_or(StatusCode::NOT_FOUND)?;
    let joint_name = joint_map
        .get(&id)
        .cloned()
        .unwrap_or_else(|| format!("motor_{}", id));
    let (actuator_type, limits) = find_joint_config(&state, id);

    match motor.read_state().await {
        Ok(ms) => Ok(Json(MotorDetail {
            can_id: id,
            joint_name,
            actuator_type,
            limits,
            online: true,
            angle_rad: ms.angle_rad,
            velocity_rads: ms.velocity_rads,
            torque_nm: ms.torque_nm,
            temperature_c: ms.temperature_c,
            mode: format!("{:?}", ms.mode),
            faults: ms.faults.iter().map(|s| s.to_string()).collect(),
        })),
        Err(_) => Ok(Json(MotorDetail {
            can_id: id,
            joint_name,
            actuator_type,
            limits,
            online: false,
            angle_rad: 0.0,
            velocity_rads: 0.0,
            torque_nm: 0.0,
            temperature_c: 0.0,
            mode: "Unknown".into(),
            faults: vec!["communication error".into()],
        })),
    }
}

async fn enable_motor(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u8>,
) -> Result<impl IntoResponse, StatusCode> {
    let mut motors = state.motors.lock().await;
    let motor = motors.get_mut(&id).ok_or(StatusCode::NOT_FOUND)?;
    match motor.enable().await {
        Ok(ms) => Ok(Json(CommandResponse {
            success: true,
            error: None,
            angle_rad: Some(ms.angle_rad),
            velocity_rads: Some(ms.velocity_rads),
            torque_nm: Some(ms.torque_nm),
        })),
        Err(e) => Ok(Json(CommandResponse {
            success: false,
            error: Some(format!("{:#}", e)),
            angle_rad: None,
            velocity_rads: None,
            torque_nm: None,
        })),
    }
}

async fn disable_motor(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u8>,
) -> Result<impl IntoResponse, StatusCode> {
    let mut motors = state.motors.lock().await;
    let motor = motors.get_mut(&id).ok_or(StatusCode::NOT_FOUND)?;
    match motor.disable().await {
        Ok(ms) => Ok(Json(CommandResponse {
            success: true,
            error: None,
            angle_rad: Some(ms.angle_rad),
            velocity_rads: Some(ms.velocity_rads),
            torque_nm: Some(ms.torque_nm),
        })),
        Err(e) => Ok(Json(CommandResponse {
            success: false,
            error: Some(format!("{:#}", e)),
            angle_rad: None,
            velocity_rads: None,
            torque_nm: None,
        })),
    }
}

async fn zero_motor(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u8>,
) -> Result<impl IntoResponse, StatusCode> {
    let mut motors = state.motors.lock().await;
    let motor = motors.get_mut(&id).ok_or(StatusCode::NOT_FOUND)?;
    match motor.set_zero().await {
        Ok(()) => Ok(Json(CommandResponse {
            success: true,
            error: None,
            angle_rad: None,
            velocity_rads: None,
            torque_nm: None,
        })),
        Err(e) => Ok(Json(CommandResponse {
            success: false,
            error: Some(format!("{:#}", e)),
            angle_rad: None,
            velocity_rads: None,
            torque_nm: None,
        })),
    }
}

async fn move_motor(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u8>,
    Json(req): Json<MoveRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let mut motors = state.motors.lock().await;
    let motor = motors.get_mut(&id).ok_or(StatusCode::NOT_FOUND)?;
    match motor.move_to(req.position_rad, req.kp, req.kd).await {
        Ok(ms) => Ok(Json(CommandResponse {
            success: true,
            error: None,
            angle_rad: Some(ms.angle_rad),
            velocity_rads: Some(ms.velocity_rads),
            torque_nm: Some(ms.torque_nm),
        })),
        Err(e) => Ok(Json(CommandResponse {
            success: false,
            error: Some(format!("{:#}", e)),
            angle_rad: None,
            velocity_rads: None,
            torque_nm: None,
        })),
    }
}

async fn control_motor(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u8>,
    Json(req): Json<ControlRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let mut motors = state.motors.lock().await;
    let motor = motors.get_mut(&id).ok_or(StatusCode::NOT_FOUND)?;
    match motor
        .send_control(req.position, req.velocity, req.kp, req.kd, req.torque)
        .await
    {
        Ok(ms) => Ok(Json(CommandResponse {
            success: true,
            error: None,
            angle_rad: Some(ms.angle_rad),
            velocity_rads: Some(ms.velocity_rads),
            torque_nm: Some(ms.torque_nm),
        })),
        Err(e) => Ok(Json(CommandResponse {
            success: false,
            error: Some(format!("{:#}", e)),
            angle_rad: None,
            velocity_rads: None,
            torque_nm: None,
        })),
    }
}

fn find_joint_config(state: &AppState, can_id: u8) -> (String, (f64, f64)) {
    let arms = [
        state.config.arm_left.as_ref(),
        state.config.arm_right.as_ref(),
    ];
    for arm in arms.iter().flatten() {
        for (_name, joint) in arm.joints() {
            if joint.can_id == Some(can_id) {
                return (joint.actuator.clone(), joint.limits);
            }
        }
    }
    if let Some(ref waist) = state.config.waist {
        for (_name, joint) in waist {
            if joint.can_id == Some(can_id) {
                return (joint.actuator.clone(), joint.limits);
            }
        }
    }
    ("unknown".into(), (-3.14, 3.14))
}

fn collect_configured_motors(
    state: &AppState,
    motors: &std::collections::HashMap<u8, cortex::motor::Motor>,
    joint_map: &std::collections::HashMap<u8, String>,
    infos: &mut Vec<MotorInfo>,
) {
    let all_configured = all_configured_can_ids(state);
    for (can_id, actuator_type, limits) in all_configured {
        if motors.contains_key(&can_id) {
            continue;
        }
        let joint_name = joint_map
            .get(&can_id)
            .cloned()
            .unwrap_or_else(|| format!("motor_{}", can_id));
        infos.push(MotorInfo {
            can_id,
            joint_name,
            actuator_type,
            limits,
            online: false,
        });
    }
}

fn all_configured_can_ids(state: &AppState) -> Vec<(u8, String, (f64, f64))> {
    let mut ids = Vec::new();
    let arms = [
        state.config.arm_left.as_ref(),
        state.config.arm_right.as_ref(),
    ];
    for arm in arms.iter().flatten() {
        for (_name, joint) in arm.joints() {
            if let Some(id) = joint.can_id {
                ids.push((id, joint.actuator.clone(), joint.limits));
            }
        }
    }
    if let Some(ref waist) = state.config.waist {
        for (_name, joint) in waist {
            if let Some(id) = joint.can_id {
                ids.push((id, joint.actuator.clone(), joint.limits));
            }
        }
    }
    ids
}
