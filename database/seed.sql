-- Ambiente demo multi-organizacao:
-- usuario admin: admin@queda.local
-- senha: Admin@123

USE queda_monitor;

INSERT INTO users (name, email, password_hash, global_role, status)
VALUES (
  'Administradora Demo',
  'admin@queda.local',
  '$2b$10$6rr3vuhijE5a7A3wlBnKJOnYiaLD8rBsJ0V8vhxCAQh/TZh6Kijgu',
  'user',
  'active'
);

SET @demo_user_id = LAST_INSERT_ID();

INSERT INTO organizations (name, type, status)
VALUES ('Familia Demo', 'family', 'active');

SET @demo_org_id = LAST_INSERT_ID();

INSERT INTO organization_members (
  organization_id,
  user_id,
  role,
  status
)
VALUES (@demo_org_id, @demo_user_id, 'organization_admin', 'active');

SET @demo_member_id = LAST_INSERT_ID();

INSERT INTO patients (
  organization_id,
  full_name,
  birth_date,
  weight_kg,
  height_cm,
  notes,
  status
)
VALUES (
  @demo_org_id,
  'Paciente Demo',
  '1948-08-18',
  72.50,
  168.00,
  'Paciente inicial para demonstracao multi-tenant.',
  'active'
);

SET @demo_patient_id = LAST_INSERT_ID();

INSERT INTO caregiver_assignments (organization_member_id, patient_id)
VALUES (@demo_member_id, @demo_patient_id);

INSERT INTO devices (
  organization_id,
  current_patient_id,
  device_uid,
  device_identifier,
  name,
  location,
  claim_status,
  claimed_at,
  claimed_by_user_id,
  is_active
)
VALUES (
  @demo_org_id,
  @demo_patient_id,
  'legacy:esp32_01',
  'esp32_01',
  'Pulseira ESP32 Principal',
  'Quarto 01',
  'claimed',
  UTC_TIMESTAMP(),
  @demo_user_id,
  1
);

SET @demo_device_id = LAST_INSERT_ID();

INSERT INTO device_assignment_history (
  device_id,
  organization_id,
  patient_id,
  assigned_by_user_id,
  assignment_started_at,
  reason,
  notes
)
VALUES (
  @demo_device_id,
  @demo_org_id,
  @demo_patient_id,
  @demo_user_id,
  UTC_TIMESTAMP(),
  'seed_initial_assignment',
  'Vinculo inicial do ambiente demo.'
);

SET @demo_assignment_id = LAST_INSERT_ID();

UPDATE devices
SET current_assignment_history_id = @demo_assignment_id
WHERE id = @demo_device_id;

INSERT INTO device_status (
  device_id,
  organization_id,
  patient_id,
  device_assignment_history_id,
  online,
  wifi_rssi,
  battery_percent,
  firmware_version,
  sensor_ready,
  sensor_valid,
  sensor_read_ok,
  sensor_sample_age_ms,
  sensor_failures,
  i2c_error_count,
  i2c_recovery_count,
  i2c_last_error,
  last_status_topic,
  last_telemetry_topic,
  last_seen_at
)
VALUES (
  @demo_device_id,
  @demo_org_id,
  @demo_patient_id,
  @demo_assignment_id,
  1,
  -58,
  86,
  '1.0.0',
  1,
  1,
  1,
  0,
  0,
  0,
  0,
  'none',
  'queda/devices/esp32_01/status',
  'queda/devices/esp32_01/telemetry',
  UTC_TIMESTAMP()
);

INSERT INTO telemetry_logs (
  organization_id,
  patient_id,
  device_id,
  device_assignment_history_id,
  ax,
  ay,
  az,
  gx,
  gy,
  gz,
  accel_magnitude,
  gyro_magnitude,
  pitch_deg,
  roll_deg,
  created_at
)
VALUES
  (@demo_org_id, @demo_patient_id, @demo_device_id, @demo_assignment_id, 0.04, -0.02, 0.98, 5.2, -1.1, 3.6, 0.98, 6.4, -3.1, 2.7, UTC_TIMESTAMP()),
  (@demo_org_id, @demo_patient_id, @demo_device_id, @demo_assignment_id, 0.06, 0.01, 1.01, 6.8, 1.9, 2.5, 1.01, 7.5, -1.6, 3.3, UTC_TIMESTAMP());

SET @demo_evidence_telemetry_id = LAST_INSERT_ID();

INSERT INTO events (
  organization_id,
  patient_id,
  device_id,
  device_assignment_history_id,
  event_type,
  severity,
  intensity,
  immobility,
  message,
  evidence_status,
  evidence_telemetry_id,
  evidence_sample_count,
  evidence_window_seconds,
  evidence_summary_json,
  event_time,
  raw_payload_json
)
VALUES (
  @demo_org_id,
  @demo_patient_id,
  @demo_device_id,
  @demo_assignment_id,
  'fall_detected',
  'critical',
  3.74,
  1,
  'Queda simulada para demonstracao multi-organizacao.',
  'linked',
  @demo_evidence_telemetry_id,
  2,
  0.000,
  JSON_OBJECT(
    'maxAccelMagnitude', 3.74,
    'maxGyroMagnitude', 182.5,
    'immobilityConfirmed', TRUE,
    'firstSampleAt', UTC_TIMESTAMP(),
    'lastSampleAt', UTC_TIMESTAMP(),
    'decisionSource', 'firmware',
    'algorithmVersion', 'seed_threshold_fsm_v2_time_features_v1',
    'confidence', 0.76,
    'firmwareDecision', JSON_OBJECT(
      'decisionSource', 'firmware',
      'algorithmVersion', 'seed_threshold_fsm_v2_time_features_v1',
      'reason', 'impact_orientation_immobility',
      'activityStateEstimate', 'queda_confirmada',
      'confidence', 0.76,
      'sampleCount', 72,
      'peakAccelG', 3.74,
      'peakGyroDps', 182.5,
      'immobilityConfirmed', TRUE,
      'featuresTimeDomain', JSON_OBJECT(
        'available', TRUE,
        'sample_count', 64,
        'window_duration_ms', 3200,
        'peak_jerk', 8.4
      ),
      'featuresFrequencyDomain', JSON_OBJECT(
        'available', FALSE,
        'experimental', TRUE,
        'reason', 'fft_experimental_disabled'
      )
    )
  ),
  UTC_TIMESTAMP(),
  JSON_OBJECT(
    'device_uid', 'legacy:esp32_01',
    'device_id', 'esp32_01',
    'event_type', 'fall_detected',
    'timestamp', UNIX_TIMESTAMP(UTC_TIMESTAMP()),
    'accel_magnitude', 3.74,
    'gyro_magnitude', 182.5,
    'immobility_confirmed', TRUE,
    'decision_source', 'firmware',
    'algorithm_version', 'seed_threshold_fsm_v2_time_features_v1',
    'detected', TRUE,
    'candidate', TRUE,
    'reason', 'impact_orientation_immobility',
    'activity_state_estimate', 'queda_confirmada',
    'confidence', 0.76,
    'analysis_window_ms', 3600,
    'sample_count', 72,
    'peak_accel_g', 3.74,
    'peak_gyro_dps', 182.5,
    'battery_level', 86
  )
);

SET @demo_event_id = LAST_INSERT_ID();

INSERT INTO event_telemetry_evidence (
  event_id,
  telemetry_log_id,
  relative_ms,
  role
)
VALUES
  (@demo_event_id, @demo_evidence_telemetry_id, 0, 'nearest'),
  (@demo_event_id, @demo_evidence_telemetry_id + 1, 0, 'peak');

INSERT INTO alerts (
  organization_id,
  patient_id,
  event_id,
  device_id,
  status
)
VALUES (
  @demo_org_id,
  @demo_patient_id,
  @demo_event_id,
  @demo_device_id,
  'open'
);
