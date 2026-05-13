CREATE DATABASE IF NOT EXISTS queda_monitor
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE queda_monitor;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS alert_actions;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS event_telemetry_evidence;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS telemetry_logs;
DROP TABLE IF EXISTS device_status;
DROP TABLE IF EXISTS device_pairing_sessions;
DROP TABLE IF EXISTS caregiver_assignments;
DROP TABLE IF EXISTS device_assignment_history;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  global_role ENUM('platform_admin', 'user') NOT NULL DEFAULT 'user',
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
);

CREATE TABLE IF NOT EXISTS organizations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(180) NOT NULL,
  type ENUM('family', 'clinic', 'hospital') NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_organizations_type_status (type, status)
);

CREATE TABLE IF NOT EXISTS organization_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('organization_admin', 'caregiver', 'operator', 'viewer') NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_organization_member (organization_id, user_id),
  KEY idx_organization_members_user (user_id, status),
  CONSTRAINT fk_organization_members_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_organization_members_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS patients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(180) NOT NULL,
  birth_date DATE NULL,
  weight_kg DECIMAL(5,2) NULL,
  height_cm DECIMAL(5,2) NULL,
  notes TEXT NULL,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_patients_org_status (organization_id, status),
  KEY idx_patients_name (full_name),
  CONSTRAINT fk_patients_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NULL,
  current_patient_id BIGINT UNSIGNED NULL,
  device_uid VARCHAR(120) NOT NULL,
  device_identifier VARCHAR(120) NOT NULL,
  name VARCHAR(180) NOT NULL,
  location VARCHAR(180) NULL,
  claim_status ENUM('unclaimed', 'claimed', 'disabled') NOT NULL DEFAULT 'unclaimed',
  claimed_at DATETIME NULL,
  claimed_by_user_id BIGINT UNSIGNED NULL,
  device_sync_token_hash CHAR(64) NULL,
  device_sync_token_issued_at DATETIME NULL,
  current_assignment_history_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_devices_uid (device_uid),
  KEY idx_devices_identifier (device_identifier),
  KEY idx_devices_org_claim (organization_id, claim_status),
  KEY idx_devices_patient (current_patient_id),
  CONSTRAINT fk_devices_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_devices_patient
    FOREIGN KEY (current_patient_id) REFERENCES patients (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_devices_claimed_by
    FOREIGN KEY (claimed_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS device_assignment_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id BIGINT UNSIGNED NOT NULL,
  organization_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NULL,
  assigned_by_user_id BIGINT UNSIGNED NULL,
  assignment_started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assignment_ended_at DATETIME NULL,
  reason VARCHAR(120) NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_device_assignment_device_current (device_id, assignment_ended_at),
  KEY idx_device_assignment_patient (patient_id, assignment_started_at),
  CONSTRAINT fk_assignment_device
    FOREIGN KEY (device_id) REFERENCES devices (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_assignment_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_assignment_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_assignment_user
    FOREIGN KEY (assigned_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS caregiver_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_member_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_caregiver_assignment (organization_member_id, patient_id),
  KEY idx_caregiver_assignments_patient (patient_id),
  CONSTRAINT fk_caregiver_assignment_member
    FOREIGN KEY (organization_member_id) REFERENCES organization_members (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_caregiver_assignment_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_pairing_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NULL,
  pairing_code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  used_by_device_id BIGINT UNSIGNED NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pairing_code_hash (pairing_code_hash),
  KEY idx_pairing_org_expiry (organization_id, expires_at),
  KEY idx_pairing_used (used_at),
  CONSTRAINT fk_pairing_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_pairing_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_pairing_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_pairing_used_device
    FOREIGN KEY (used_by_device_id) REFERENCES devices (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS device_status (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id BIGINT UNSIGNED NOT NULL,
  organization_id BIGINT UNSIGNED NULL,
  patient_id BIGINT UNSIGNED NULL,
  device_assignment_history_id BIGINT UNSIGNED NULL,
  online TINYINT(1) NOT NULL DEFAULT 0,
  wifi_rssi INT NULL,
  battery_percent TINYINT UNSIGNED NULL,
  firmware_version VARCHAR(64) NULL,
  last_seen_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_device_status_device (device_id),
  KEY idx_device_status_scope (organization_id, patient_id),
  KEY idx_device_status_online (online),
  KEY idx_device_status_online_last_seen (online, last_seen_at),
  KEY idx_device_status_last_seen (last_seen_at),
  CONSTRAINT fk_device_status_device
    FOREIGN KEY (device_id) REFERENCES devices (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_device_status_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_device_status_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_device_status_assignment
    FOREIGN KEY (device_assignment_history_id) REFERENCES device_assignment_history (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS telemetry_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NULL,
  patient_id BIGINT UNSIGNED NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  device_assignment_history_id BIGINT UNSIGNED NULL,
  ax DOUBLE NULL,
  ay DOUBLE NULL,
  az DOUBLE NULL,
  gx DOUBLE NULL,
  gy DOUBLE NULL,
  gz DOUBLE NULL,
  accel_magnitude DOUBLE NULL,
  gyro_magnitude DOUBLE NULL,
  pitch_deg DOUBLE NULL,
  roll_deg DOUBLE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_telemetry_scope_created (organization_id, patient_id, created_at),
  KEY idx_telemetry_org_created (organization_id, created_at),
  KEY idx_telemetry_device_created (device_id, created_at),
  KEY idx_telemetry_device_created_id (device_id, created_at, id),
  CONSTRAINT fk_telemetry_device
    FOREIGN KEY (device_id) REFERENCES devices (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_telemetry_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_telemetry_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_telemetry_assignment
    FOREIGN KEY (device_assignment_history_id) REFERENCES device_assignment_history (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NULL,
  patient_id BIGINT UNSIGNED NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  device_assignment_history_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(80) NOT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  intensity DOUBLE NULL,
  immobility TINYINT(1) NOT NULL DEFAULT 0,
  message VARCHAR(255) NULL,
  evidence_status ENUM('none', 'partial', 'linked') NOT NULL DEFAULT 'none',
  evidence_telemetry_id BIGINT UNSIGNED NULL,
  evidence_sample_count INT UNSIGNED NOT NULL DEFAULT 0,
  evidence_window_seconds DECIMAL(8, 3) NULL,
  evidence_summary_json JSON NULL,
  event_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_payload_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_scope_time (organization_id, patient_id, event_time),
  KEY idx_events_org_time (organization_id, event_time),
  KEY idx_events_device_time (device_id, event_time),
  KEY idx_events_device_type_time (device_id, event_type, event_time),
  KEY idx_events_type (event_type),
  KEY idx_events_severity (severity),
  KEY idx_events_evidence_status (evidence_status),
  KEY idx_events_evidence_telemetry (evidence_telemetry_id),
  CONSTRAINT fk_events_device
    FOREIGN KEY (device_id) REFERENCES devices (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_events_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_events_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_events_assignment
    FOREIGN KEY (device_assignment_history_id) REFERENCES device_assignment_history (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_events_evidence_telemetry
    FOREIGN KEY (evidence_telemetry_id) REFERENCES telemetry_logs (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS event_telemetry_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  telemetry_log_id BIGINT UNSIGNED NOT NULL,
  relative_ms INT NOT NULL,
  role ENUM('before_peak', 'peak', 'after_peak', 'nearest') NOT NULL DEFAULT 'nearest',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_telemetry_evidence (event_id, telemetry_log_id),
  KEY idx_event_evidence_event_role (event_id, role),
  KEY idx_event_evidence_telemetry (telemetry_log_id),
  CONSTRAINT fk_event_evidence_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_event_evidence_telemetry
    FOREIGN KEY (telemetry_log_id) REFERENCES telemetry_logs (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NULL,
  patient_id BIGINT UNSIGNED NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  status ENUM('open', 'acknowledged', 'canceled', 'resolved') NOT NULL DEFAULT 'open',
  acknowledged_by BIGINT UNSIGNED NULL,
  acknowledged_at DATETIME NULL,
  canceled_by BIGINT UNSIGNED NULL,
  canceled_at DATETIME NULL,
  resolved_by BIGINT UNSIGNED NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alerts_event (event_id),
  KEY idx_alerts_scope_status (organization_id, patient_id, status),
  KEY idx_alerts_org_status_updated (organization_id, status, updated_at),
  KEY idx_alerts_device_status (device_id, status),
  KEY idx_alerts_updated (updated_at),
  CONSTRAINT fk_alerts_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_alerts_device
    FOREIGN KEY (device_id) REFERENCES devices (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_alerts_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_alerts_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_alerts_ack_user
    FOREIGN KEY (acknowledged_by) REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_alerts_cancel_user
    FOREIGN KEY (canceled_by) REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_alerts_resolve_user
    FOREIGN KEY (resolved_by) REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS alert_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  alert_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  action_type ENUM('acknowledge', 'cancel', 'resolve') NOT NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alert_actions_alert_created (alert_id, created_at),
  CONSTRAINT fk_alert_actions_alert
    FOREIGN KEY (alert_id) REFERENCES alerts (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_alert_actions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id BIGINT UNSIGNED NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_action (action),
  KEY idx_audit_logs_entity (entity_type, entity_id),
  KEY idx_audit_logs_org (organization_id),
  CONSTRAINT fk_audit_logs_org
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE SET NULL
);
