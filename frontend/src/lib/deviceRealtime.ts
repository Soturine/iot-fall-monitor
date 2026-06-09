import type {
  Device,
  DeviceDetailResponse,
  DeviceStatus,
  TelemetryLog,
  TelemetryRealtimeEvent,
} from "../types/api";

function buildStatusPatch(
  currentStatus: DeviceStatus,
  telemetryEvent: TelemetryRealtimeEvent,
): DeviceStatus {
  const nextPatch = telemetryEvent.deviceStatusPatch;
  const createdAt = telemetryEvent.createdAt || currentStatus.lastSeenAt;

  return {
    ...currentStatus,
    ...nextPatch,
    online: nextPatch?.online ?? true,
    lastSeenAt: nextPatch?.lastSeenAt || createdAt || currentStatus.lastSeenAt,
    updatedAt: nextPatch?.updatedAt || createdAt || currentStatus.updatedAt,
  };
}

function toTelemetryLog(telemetryEvent: TelemetryRealtimeEvent): TelemetryLog {
  return {
    id: telemetryEvent.id,
    deviceId: telemetryEvent.deviceId,
    organizationId: telemetryEvent.organizationId,
    patientId: telemetryEvent.patientId,
    ax: telemetryEvent.ax,
    ay: telemetryEvent.ay,
    az: telemetryEvent.az,
    gx: telemetryEvent.gx,
    gy: telemetryEvent.gy,
    gz: telemetryEvent.gz,
    accelMagnitude: telemetryEvent.accelMagnitude,
    gyroMagnitude: telemetryEvent.gyroMagnitude,
    pitchDeg: telemetryEvent.pitchDeg,
    rollDeg: telemetryEvent.rollDeg,
    createdAt: telemetryEvent.createdAt,
  };
}

export function applyTelemetryPatchToDevice(
  device: Device,
  telemetryEvent: TelemetryRealtimeEvent,
): Device {
  return {
    ...device,
    behavior: telemetryEvent.deviceBehavior || device.behavior,
    status: buildStatusPatch(device.status, telemetryEvent),
  };
}

export function applyTelemetryPatchToDeviceList(
  devices: Device[],
  telemetryEvent: TelemetryRealtimeEvent,
): Device[] {
  return devices.map((device) =>
    device.id === telemetryEvent.deviceId
      ? applyTelemetryPatchToDevice(device, telemetryEvent)
      : device,
  );
}

export function applyTelemetryPatchToDetail(
  detail: DeviceDetailResponse,
  telemetryEvent: TelemetryRealtimeEvent,
): DeviceDetailResponse {
  if (detail.device.id !== telemetryEvent.deviceId) {
    return detail;
  }

  const telemetryLog = toTelemetryLog(telemetryEvent);
  const existingIndex = detail.recentTelemetry.findIndex(
    (entry) => entry.id === telemetryLog.id,
  );

  const nextTelemetry =
    existingIndex >= 0
      ? detail.recentTelemetry.map((entry, index) =>
          index === existingIndex ? telemetryLog : entry,
        )
      : [...detail.recentTelemetry, telemetryLog];

  nextTelemetry.sort((left, right) => {
    const leftMs = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightMs = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return leftMs - rightMs || left.id - right.id;
  });

  return {
    ...detail,
    device: applyTelemetryPatchToDevice(detail.device, telemetryEvent),
    recentTelemetry: nextTelemetry.slice(
      detail.device.status.detectorMode === "demo" ? -120 : -60,
    ),
  };
}
