const assert = require("node:assert/strict");
const test = require("node:test");

const { computeDeviceBehavior } = require("../../src/services/deviceBehaviorService");

const now = new Date("2026-05-19T12:00:00.000Z");

function telemetrySample(secondsAgo, overrides = {}) {
  return {
    accelMagnitude: 1,
    gyroMagnitude: 3,
    pitchDeg: 2,
    rollDeg: 3,
    createdAt: new Date(now.getTime() - secondsAgo * 1000).toISOString(),
    ...overrides,
  };
}

test("computeDeviceBehavior diferencia sensor invalido de falta de telemetria", () => {
  const behavior = computeDeviceBehavior({
    status: {
      online: true,
      sensorReady: true,
      sensorValid: false,
      lastSeenAt: now.toISOString(),
    },
    telemetrySamples: [],
    recentEvents: [],
    now,
  });

  assert.equal(behavior.state, "sensor_sem_leitura_valida");
  assert.equal(behavior.source, "device_status");
});

test("computeDeviceBehavior classifica telemetria stale explicitamente", () => {
  const behavior = computeDeviceBehavior({
    status: {
      online: true,
      sensorReady: true,
      sensorValid: true,
      lastSeenAt: now.toISOString(),
    },
    telemetrySamples: [telemetrySample(90)],
    recentEvents: [],
    now,
  });

  assert.equal(behavior.state, "telemetria_desatualizada");
});

test("computeDeviceBehavior separa movimento leve e intenso", () => {
  const light = computeDeviceBehavior({
    status: { online: true, sensorReady: true, sensorValid: true },
    telemetrySamples: [
      telemetrySample(8, { accelMagnitude: 1.04, gyroMagnitude: 12 }),
      telemetrySample(6, { accelMagnitude: 1.08, gyroMagnitude: 18 }),
      telemetrySample(4, { accelMagnitude: 1.18, gyroMagnitude: 45 }),
      telemetrySample(2, { accelMagnitude: 1.12, gyroMagnitude: 22 }),
    ],
    recentEvents: [],
    now,
  });
  const intense = computeDeviceBehavior({
    status: { online: true, sensorReady: true, sensorValid: true },
    telemetrySamples: [
      telemetrySample(8, { accelMagnitude: 1.1, gyroMagnitude: 20 }),
      telemetrySample(6, { accelMagnitude: 1.2, gyroMagnitude: 38 }),
      telemetrySample(4, { accelMagnitude: 1.72, gyroMagnitude: 125 }),
      telemetrySample(2, { accelMagnitude: 1.18, gyroMagnitude: 30 }),
    ],
    recentEvents: [],
    now,
  });

  assert.equal(light.state, "movimento_leve");
  assert.equal(intense.state, "movimento_intenso");
});

test("computeDeviceBehavior prioriza queda e SOS recentes", () => {
  const fall = computeDeviceBehavior({
    status: { online: true },
    telemetrySamples: [],
    recentEvents: [
      {
        eventType: "fall_detected",
        severity: "critical",
        immobility: true,
        evidenceStatus: "linked",
        evidenceSampleCount: 4,
        eventTime: new Date(now.getTime() - 20_000).toISOString(),
      },
    ],
    now,
  });
  const sos = computeDeviceBehavior({
    status: { online: true },
    telemetrySamples: [],
    recentEvents: [
      {
        eventType: "sos_pressed",
        eventTime: new Date(now.getTime() - 10_000).toISOString(),
      },
    ],
    now,
  });

  assert.equal(fall.state, "queda_confirmada");
  assert.equal(sos.state, "sos_manual");
});

test("computeDeviceBehavior usa eventos experimentais recentes do firmware", () => {
  const suspected = computeDeviceBehavior({
    status: { online: true },
    telemetrySamples: [],
    recentEvents: [
      {
        eventType: "fall_suspected",
        severity: "high",
        immobility: false,
        evidenceStatus: "none",
        evidenceSampleCount: 0,
        eventTime: new Date(now.getTime() - 15_000).toISOString(),
      },
    ],
    now,
  });
  const movement = computeDeviceBehavior({
    status: { online: true },
    telemetrySamples: [],
    recentEvents: [
      {
        eventType: "movement_detected",
        severity: "medium",
        eventTime: new Date(now.getTime() - 15_000).toISOString(),
      },
    ],
    now,
  });

  assert.equal(suspected.state, "queda_suspeita");
  assert.equal(movement.state, "movimento_intenso");
});
