use crate::config::RobotConfig;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default soft-limit margin in radians (~10 degrees). Velocity/torque commands ramp
/// down linearly within this zone when pushing toward a limit.
pub const DEFAULT_SOFT_LIMIT_MARGIN_RAD: f32 = 0.175;

/// Epsilon (rad) when testing whether a candidate `pos + n*2pi` lies inside joint limits.
pub const JOINT_UNWRAP_EPS: f32 = 0.12;

// ---------------------------------------------------------------------------
// Config lookup helpers
// ---------------------------------------------------------------------------

/// Look up the joint limits for a motor by its CAN ID across all config sections.
/// Returns `Some((min_rad, max_rad))` if found, `None` if the CAN ID is not assigned.
pub fn limits_for_motor(config: &RobotConfig, can_id: u8) -> Option<(f32, f32)> {
    let arms = [config.arm_left.as_ref(), config.arm_right.as_ref()];
    for arm in arms.iter().flatten() {
        for (_name, joint) in arm.joints() {
            if joint.can_id == Some(can_id) {
                return Some((joint.limits.0 as f32, joint.limits.1 as f32));
            }
        }
    }
    if let Some(ref waist) = config.waist {
        for (_name, joint) in waist {
            if joint.can_id == Some(can_id) {
                return Some((joint.limits.0 as f32, joint.limits.1 as f32));
            }
        }
    }
    None
}

/// Look up the home position for a motor by its CAN ID.
pub fn home_for_motor(config: &RobotConfig, can_id: u8) -> Option<f32> {
    let arms = [config.arm_left.as_ref(), config.arm_right.as_ref()];
    for arm in arms.iter().flatten() {
        for (_name, joint) in arm.joints() {
            if joint.can_id == Some(can_id) {
                return Some(joint.home_rad as f32);
            }
        }
    }
    if let Some(ref waist) = config.waist {
        for (_name, joint) in waist {
            if joint.can_id == Some(can_id) {
                return Some(joint.home_rad as f32);
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Pure angle/position math
// ---------------------------------------------------------------------------

/// Signed smallest angle from `from_rad` to `to_rad`, in (-pi, pi].
#[inline]
pub fn shortest_angle_err(from_rad: f32, to_rad: f32) -> f32 {
    use std::f32::consts::{PI, TAU};
    let d = to_rad - from_rad;
    (d + PI).rem_euclid(TAU) - PI
}

/// Pick the representative of `pos_rad` modulo 2pi that lies in `[limit_lo, limit_hi]` (with slack).
/// If several candidates fit (range > 2pi), choose the one closest to `home_rad`.
///
/// After power loss the RS03 may report the same physical pose on a different 2pi branch than
/// `home_rad` / limits. This maps the raw reading into the joint configuration frame.
pub fn canonical_joint_angle(
    pos_rad: f32,
    home_rad: f32,
    limit_lo: f32,
    limit_hi: f32,
) -> f32 {
    use std::f32::consts::TAU;
    let mut best: Option<(f32, f32)> = None;
    for k in -4..=4 {
        let p = pos_rad + (k as f32) * TAU;
        if p >= limit_lo - JOINT_UNWRAP_EPS && p <= limit_hi + JOINT_UNWRAP_EPS {
            let d = (p - home_rad).abs();
            match best {
                None => best = Some((p, d)),
                Some((_, bd)) if d < bd => best = Some((p, d)),
                _ => {}
            }
        }
    }
    best.map(|(p, _)| p).unwrap_or(pos_rad)
}

/// Error vs joint home using the canonical 2pi branch inside limits.
#[inline]
pub fn joint_space_error_mag(pos_raw: f32, target_rad: f32, limits: (f32, f32)) -> f32 {
    let cj = canonical_joint_angle(pos_raw, target_rad, limits.0, limits.1);
    (cj - target_rad).abs()
}

/// Raw MIT position command that corresponds to joint angle `target_rad` when the motor
/// currently reads `pos_raw` (handles branch mismatch between feedback and config frame).
#[inline]
pub fn motor_cmd_for_joint_target(pos_raw: f32, target_rad: f32, limits: (f32, f32)) -> f32 {
    let cj = canonical_joint_angle(pos_raw, target_rad, limits.0, limits.1);
    pos_raw + target_rad - cj
}

/// Linear error in the encoder frame (not wrapped).
#[inline]
pub fn linear_error(pos_rad: f32, target_rad: f32) -> f32 {
    target_rad - pos_rad
}

/// Step direction toward target. With **bounded** joints, always linear --
/// shortest arc is wrong for a limited range. Otherwise, shortest arc only
/// when linear error > pi and `prefer_shortest_angle`.
#[inline]
pub fn step_delta_toward_home(
    pos_rad: f32,
    target_rad: f32,
    prefer_shortest_angle: bool,
    bounded_joint: bool,
) -> f32 {
    use std::f32::consts::PI;
    let linear = linear_error(pos_rad, target_rad);
    if bounded_joint || !prefer_shortest_angle || linear.abs() <= PI {
        linear
    } else {
        shortest_angle_err(pos_rad, target_rad)
    }
}

/// Clamp a commanded position to joint limits when limits are set.
#[inline]
pub fn clamp_cmd_to_limits(cmd: f32, joint_limits_rad: Option<(f32, f32)>) -> f32 {
    joint_limits_rad.map_or(cmd, |(lo, hi)| cmd.clamp(lo, hi))
}

// ---------------------------------------------------------------------------
// Multi-turn aware position for limit math
// ---------------------------------------------------------------------------

/// Map a raw encoder position into joint-space for limit checks.
/// If the motor has accumulated multi-turn offset (e.g. 1080 deg after spinning),
/// this finds the equivalent position within the limit band (if one exists).
/// `home_rad` is needed to disambiguate when multiple 2pi branches fit inside limits.
///
/// When no limits are set, returns the raw position unchanged.
pub fn canonical_position_for_limits(
    raw_pos: f32,
    home_rad: f32,
    limits: Option<(f32, f32)>,
) -> f32 {
    match limits {
        Some((lo, hi)) => canonical_joint_angle(raw_pos, home_rad, lo, hi),
        None => raw_pos,
    }
}

/// Check whether a canonical position is within joint limits.
pub fn is_within_limits(canonical_pos: f32, limits: (f32, f32)) -> bool {
    canonical_pos >= limits.0 - JOINT_UNWRAP_EPS && canonical_pos <= limits.1 + JOINT_UNWRAP_EPS
}

// ---------------------------------------------------------------------------
// Soft-limit effort scaling
// ---------------------------------------------------------------------------

/// Scale factor (0.0-1.0) for velocity or torque near joint limits.
///
/// Uses the **canonical** position (not raw encoder) so multi-turn accumulation
/// does not break the math. Positive `signed_effort` pushes toward max, negative
/// toward min. Returns 1.0 if no limits, no position, or comfortably inside range.
#[inline]
pub fn soft_limit_effort_scale(
    joint_limits: Option<(f32, f32)>,
    last_known_position: Option<f32>,
    home_rad: f32,
    margin_rad: f32,
    signed_effort: f32,
) -> f32 {
    let (lo, hi) = match joint_limits {
        Some(l) => l,
        None => return 1.0,
    };
    let raw_pos = match last_known_position {
        Some(p) => p,
        None => return 1.0,
    };
    let margin = margin_rad;
    if margin <= 0.0 {
        return 1.0;
    }

    let pos = canonical_joint_angle(raw_pos, home_rad, lo, hi);

    if signed_effort > 0.0 {
        let dist_to_max = hi - pos;
        if dist_to_max <= 0.0 {
            return 0.0;
        }
        if dist_to_max < margin {
            return (dist_to_max / margin).clamp(0.0, 1.0);
        }
    } else if signed_effort < 0.0 {
        let dist_to_min = pos - lo;
        if dist_to_min <= 0.0 {
            return 0.0;
        }
        if dist_to_min < margin {
            return (dist_to_min / margin).clamp(0.0, 1.0);
        }
    }
    1.0
}

// ---------------------------------------------------------------------------
// Unified command validators
// ---------------------------------------------------------------------------

/// Validate a velocity (spin) command against joint limits.
///
/// Returns `Ok(scaled_velocity)` if the command is allowed (possibly scaled down
/// near limits), or `Err(message)` if the command must be rejected.
///
/// Hard-rejects when the canonical position is outside limits entirely.
/// Soft-scales the velocity linearly to zero within the margin zone.
pub fn validate_velocity_command(
    raw_pos: f32,
    home_rad: f32,
    limits: Option<(f32, f32)>,
    margin_rad: f32,
    velocity_rads: f32,
) -> Result<f32, String> {
    let (lo, hi) = match limits {
        Some(l) => l,
        None => return Ok(velocity_rads),
    };

    let pos = canonical_joint_angle(raw_pos, home_rad, lo, hi);

    if pos < lo - JOINT_UNWRAP_EPS {
        if velocity_rads < 0.0 {
            return Err(format!(
                "position {:.3} rad below min limit {:.3} — only positive velocity allowed to return to range",
                pos, lo
            ));
        }
        return Ok(velocity_rads);
    }
    if pos > hi + JOINT_UNWRAP_EPS {
        if velocity_rads > 0.0 {
            return Err(format!(
                "position {:.3} rad above max limit {:.3} — only negative velocity allowed to return to range",
                pos, hi
            ));
        }
        return Ok(velocity_rads);
    }

    let scale = soft_limit_effort_scale(
        limits,
        Some(pos),
        home_rad,
        margin_rad,
        velocity_rads,
    );
    Ok(velocity_rads * scale)
}

/// Validate a torque command against joint limits. Same pattern as velocity.
pub fn validate_torque_command(
    raw_pos: f32,
    home_rad: f32,
    limits: Option<(f32, f32)>,
    margin_rad: f32,
    torque_nm: f32,
) -> Result<f32, String> {
    let (lo, hi) = match limits {
        Some(l) => l,
        None => return Ok(torque_nm),
    };

    let pos = canonical_joint_angle(raw_pos, home_rad, lo, hi);

    if pos < lo - JOINT_UNWRAP_EPS {
        if torque_nm < 0.0 {
            return Err(format!(
                "position {:.3} rad below min limit {:.3} — only positive torque allowed to return to range",
                pos, lo
            ));
        }
        return Ok(torque_nm);
    }
    if pos > hi + JOINT_UNWRAP_EPS {
        if torque_nm > 0.0 {
            return Err(format!(
                "position {:.3} rad above max limit {:.3} — only negative torque allowed to return to range",
                pos, hi
            ));
        }
        return Ok(torque_nm);
    }

    let scale = soft_limit_effort_scale(
        limits,
        Some(pos),
        home_rad,
        margin_rad,
        torque_nm,
    );
    Ok(torque_nm * scale)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::{PI, TAU};

    #[test]
    fn shortest_angle_small_delta() {
        assert!((shortest_angle_err(0.5, 1.0) - 0.5).abs() < 1e-5);
    }

    #[test]
    fn shortest_angle_wraps_near_tau() {
        let d = shortest_angle_err(6.1, 0.17);
        assert!(d > 0.0 && d < 1.0, "d={}", d);
    }

    #[test]
    fn canonical_maps_wrong_branch() {
        let lo = -1.57_f32;
        let hi = 3.14_f32;
        let home = 0.0_f32;
        let physical = -0.52_f32;
        let raw = physical + TAU;
        let cj = canonical_joint_angle(raw, home, lo, hi);
        assert!((cj - physical).abs() < 0.06, "expected ~{physical}, got {cj}");
    }

    #[test]
    fn canonical_position_multiturn() {
        let limits = Some((-1.309_f32, 1.309_f32));
        let raw = 18.85_f32; // ~3 full turns
        let canon = canonical_position_for_limits(raw, 0.0, limits);
        assert!(
            canon >= -1.309 - JOINT_UNWRAP_EPS && canon <= 1.309 + JOINT_UNWRAP_EPS,
            "expected within limits, got {canon}"
        );
    }

    #[test]
    fn soft_limit_no_limits_full_scale() {
        assert_eq!(soft_limit_effort_scale(None, Some(0.5), 0.0, 0.175, 2.0), 1.0);
    }

    #[test]
    fn soft_limit_ramps_near_max() {
        let limits = Some((-1.0, 1.0));
        let m = 0.175_f32;
        let pos = 1.0 - 0.05;
        let s = soft_limit_effort_scale(limits, Some(pos), 0.0, m, 1.0);
        assert!((s - (0.05 / m)).abs() < 1e-5, "s={s}");
    }

    #[test]
    fn soft_limit_zero_past_max() {
        let s = soft_limit_effort_scale(Some((-1.0, 1.0)), Some(1.01), 0.0, 0.175, 1.0);
        assert_eq!(s, 0.0);
    }

    #[test]
    fn soft_limit_multiturn_uses_canonical() {
        let limits = Some((-1.309, 1.309));
        let raw_pos = 18.85_f32;
        let s = soft_limit_effort_scale(limits, Some(raw_pos), 0.0, 0.175, 1.0);
        assert!(s > 0.0, "multi-turn should map to canonical and not return 0, got {s}");
    }

    #[test]
    fn validate_velocity_rejects_outside_limits_wrong_direction() {
        let result = validate_velocity_command(
            1.5, 0.0, Some((-1.309, 1.309)), 0.175, 2.0,
        );
        assert!(result.is_err(), "should reject positive velocity above max");
    }

    #[test]
    fn validate_velocity_allows_return_to_range() {
        let result = validate_velocity_command(
            1.5, 0.0, Some((-1.309, 1.309)), 0.175, -2.0,
        );
        assert!(result.is_ok(), "should allow negative velocity to return to range");
    }

    #[test]
    fn validate_velocity_scales_near_limit() {
        let result = validate_velocity_command(
            1.2, 0.0, Some((-1.309, 1.309)), 0.175, 2.0,
        );
        match result {
            Ok(v) => assert!(v < 2.0 && v > 0.0, "velocity should be scaled, got {v}"),
            Err(_) => panic!("should not reject within limits"),
        }
    }

    #[test]
    fn validate_velocity_multiturn_maps_correctly() {
        let result = validate_velocity_command(
            18.85, 0.0, Some((-1.309, 1.309)), 0.175, 1.0,
        );
        assert!(result.is_ok(), "multi-turn canonical should be within limits");
    }

    #[test]
    fn is_within_limits_basic() {
        assert!(is_within_limits(0.5, (-1.0, 1.0)));
        assert!(!is_within_limits(1.5, (-1.0, 1.0)));
    }

    #[test]
    fn limits_for_motor_not_found() {
        use crate::config::RobotConfig;
        let config = RobotConfig {
            bus: crate::config::BusConfig {
                transport: "ch341".into(),
                port: "COM5".into(),
                socketcan_interface: None,
                baud: 921600,
                can_bitrate: 1000000,
                host_id: 0xAA,
            },
            actuators: Default::default(),
            arm_left: None,
            arm_right: None,
            waist: None,
            torso: None,
        };
        assert_eq!(limits_for_motor(&config, 127), None);
    }

    #[test]
    fn step_delta_bounded_always_linear() {
        let d = step_delta_toward_home(6.1, 0.17, true, true);
        assert!((d - (0.17 - 6.1)).abs() < 1e-4);
    }

    #[test]
    fn step_delta_unbounded_short_wrap() {
        let d = step_delta_toward_home(6.1, 0.17, true, false);
        assert!(d.abs() < 1.0, "expected short arc, got {}", d);
    }

    #[test]
    fn half_turn() {
        assert!((shortest_angle_err(0.0, PI).abs() - PI).abs() < 1e-4);
    }
}
