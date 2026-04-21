export type GlobalRole = "platform_admin" | "user";
export type OrganizationType = "family" | "clinic" | "hospital";
export type OrganizationRole =
  | "organization_admin"
  | "caregiver"
  | "operator"
  | "viewer"
  | "platform_admin";

export interface Organization {
  id: number;
  name: string;
  type: OrganizationType;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OrganizationMembership {
  id: number;
  role: Exclude<OrganizationRole, "platform_admin">;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  organization: Organization;
}

export interface User {
  id: number;
  name: string;
  email: string;
  globalRole: GlobalRole;
  activeRole: OrganizationRole | null;
  activeOrganizationId: number | null;
  activeOrganization: Organization | null;
  memberships: OrganizationMembership[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DeviceStatus {
  online: boolean;
  wifiRssi: number | null;
  batteryPercent: number | null;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  updatedAt: string | null;
}

export type DeviceBehaviorState =
  | "pre_calibracao"
  | "desconhecido"
  | "em_reposo"
  | "deitado"
  | "sentado"
  | "em_movimento"
  | "queda_suspeita"
  | "queda_confirmada"
  | "andando"
  | "correndo"
  | "caido";

export type DeviceBehaviorConfidence = "baixo" | "medio" | "alto";

export interface DeviceBehavior {
  state: DeviceBehaviorState;
  confidence: DeviceBehaviorConfidence;
  reason: string;
  experimental: boolean;
  version: string;
  source: string;
  updatedAt: string | null;
  telemetrySampleCount: number;
  telemetryWindowSeconds: number;
  plannedFutureStates: DeviceBehaviorState[];
}

export interface PatientRef {
  id: number;
  fullName: string;
}

export interface PatientProfileSummary {
  patientName: string | null;
  weightKg: number | null;
  heightCm: number | null;
  fallSensitivityPreset: string | null;
  syncedAt?: string | null;
}

export interface NetworkInfoResponse {
  suggestedBackendApiBaseUrl: string | null;
  primaryBackendApiBaseUrl?: string | null;
  fallbackBackendApiBaseUrls?: string[];
  candidateBackendApiBaseUrls: string[];
}

export interface Device {
  id: number;
  deviceUid: string;
  deviceIdentifier: string;
  name: string;
  location: string;
  isActive: boolean;
  claimStatus: "unclaimed" | "claimed" | "disabled";
  claimedAt: string | null;
  currentAssignmentHistoryId: number | null;
  organization: Organization | null;
  currentPatient: PatientRef | null;
  patientName: string;
  activeAlerts: number;
  status: DeviceStatus;
  behavior: DeviceBehavior;
}

export interface TelemetryLog {
  id: number;
  deviceId: number;
  organizationId: number | null;
  patientId: number | null;
  ax: number | null;
  ay: number | null;
  az: number | null;
  gx: number | null;
  gy: number | null;
  gz: number | null;
  accelMagnitude: number | null;
  gyroMagnitude: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
  createdAt: string | null;
}

export interface TelemetryRealtimeEvent extends TelemetryLog {
  deviceIdentifier?: string;
  deviceBehavior?: DeviceBehavior;
}

export interface DeviceRef {
  id: number;
  deviceUid?: string;
  deviceIdentifier: string;
  name: string | null;
  patientName?: string;
}

export interface EventRecord {
  id: number;
  organizationId: number | null;
  patientId: number | null;
  assignmentHistoryId: number | null;
  eventType: string;
  severity: string;
  intensity: number | null;
  immobility: boolean;
  message: string;
  eventTime: string | null;
  rawPayloadJson: unknown;
  createdAt: string | null;
  device: DeviceRef;
  patient: PatientRef | null;
  alert?: {
    id: number;
    status: string;
  } | null;
}

export interface AlertAction {
  id: number;
  actionType: string;
  note: string | null;
  createdAt: string | null;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

export interface AlertRecord {
  id: number;
  organizationId: number | null;
  patientId: number | null;
  status: string;
  acknowledgedAt: string | null;
  canceledAt: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  acknowledgedBy: { id: number; name: string } | null;
  canceledBy: { id: number; name: string } | null;
  resolvedBy: { id: number; name: string } | null;
  device: DeviceRef;
  patient: PatientRef | null;
  event: {
    id: number;
    eventType: string;
    severity: string;
    intensity: number | null;
    immobility: boolean;
    message: string;
    eventTime: string | null;
    rawPayloadJson: unknown;
  };
  actions?: AlertAction[];
}

export interface DashboardSummary {
  organization: Organization | null;
  metrics: {
    totalDevices: number;
    totalPatients: number;
    onlineDevices: number;
    offlineDevices: number;
    activeAlerts: number;
    criticalAlerts: number;
    eventsLast24h: number;
    telemetryLastHour: number;
  };
  systemStatus: {
    state: string;
    lastSeenAt: string | null;
    generatedAt: string;
  };
  recentEvents: EventRecord[];
}

export interface AssignmentHistoryEntry {
  id: number;
  patient: PatientRef | null;
  assignedBy: { id: number; name: string } | null;
  assignmentStartedAt: string | null;
  assignmentEndedAt: string | null;
  reason: string | null;
  notes: string | null;
}

export interface DeviceDetailResponse {
  device: Device;
  recentTelemetry: TelemetryLog[];
  recentEvents: EventRecord[];
  recentAlerts: AlertRecord[];
  assignmentHistory: AssignmentHistoryEntry[];
}

export interface OrganizationMember {
  id: number;
  role: Exclude<OrganizationRole, "platform_admin">;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  user: {
    id: number;
    name: string;
    email: string;
    globalRole: GlobalRole;
    status: string;
  };
}

export interface CaregiverAssignment {
  organizationMemberId: number;
  role: Exclude<OrganizationRole, "platform_admin">;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

export interface PatientRecord {
  id: number;
  organizationId: number;
  fullName: string;
  birthDate: string | null;
  weightKg: number | null;
  heightCm: number | null;
  notes: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  currentDevice: {
    id: number;
    deviceUid: string;
    deviceIdentifier: string;
    name: string;
    claimStatus: string;
  } | null;
  assignedCaregivers: CaregiverAssignment[];
}

export interface PairingSession {
  id: number;
  pairingCode: string;
  organizationId: number;
  organizationName: string;
  patientId: number | null;
  patientName: string | null;
  expiresAt: string | null;
  createdAt: string | null;
}

export interface PairingClaimRealtimeEvent {
  pairingSessionId: number;
  device: Device;
  patientProfile: {
    patientName: string | null;
    weightKg?: number | null;
    heightCm?: number | null;
    fallSensitivityPreset?: string | null;
    syncedAt?: string | null;
  } | null;
}
