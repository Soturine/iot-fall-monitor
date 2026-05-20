const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildEvidenceSummaryForPayload,
  buildTelemetryEvidence,
  deriveSeverity,
  shouldCreateAlert,
  shouldCreateAlertForEvent,
  validateTelemetryPayload,
} = require("../../src/services/eventService");

test("deriveSeverity classifica eventos criticos de queda, SOS e sensor", () => {
  assert.equal(
    deriveSeverity("fall_detected", { immobility_confirmed: true }),
    "critical",
  );
  assert.equal(
    deriveSeverity("fall_detected", { immobility_confirmed: false }),
    "high",
  );
  assert.equal(deriveSeverity("sos_pressed", {}), "high");
  assert.equal(deriveSeverity("manual_sos", {}), "high");
  assert.equal(deriveSeverity("sensor_fault", {}), "high");
  assert.equal(deriveSeverity("unknown_event", {}), "medium");
});

test("deriveSeverity preserva severidade explicita do payload", () => {
  assert.equal(deriveSeverity("fall_detected", { severity: "low" }), "low");
});

test("shouldCreateAlert cria alerta apenas para eventos criticos", () => {
  assert.equal(shouldCreateAlert("fall_detected"), true);
  assert.equal(shouldCreateAlert("sos_pressed"), true);
  assert.equal(shouldCreateAlert("manual_sos"), true);
  assert.equal(shouldCreateAlert("sensor_fault"), true);
  assert.equal(shouldCreateAlert("device_status"), false);
  assert.equal(shouldCreateAlert("heartbeat"), false);
});

test("shouldCreateAlertForEvent exige evidencia para queda e preserva SOS manual", () => {
  assert.equal(
    shouldCreateAlertForEvent({ eventType: "fall_detected", evidenceStatus: "linked" }),
    true,
  );
  assert.equal(
    shouldCreateAlertForEvent({ eventType: "fall_detected", evidenceStatus: "partial" }),
    true,
  );
  assert.equal(
    shouldCreateAlertForEvent({ eventType: "fall_detected", evidenceStatus: "none" }),
    false,
  );
  assert.equal(
    shouldCreateAlertForEvent({ eventType: "sos_pressed", evidenceStatus: "none" }),
    true,
  );
  assert.equal(
    shouldCreateAlertForEvent({ eventType: "manual_sos", evidenceStatus: "none" }),
    true,
  );
  assert.equal(
    shouldCreateAlertForEvent({ eventType: "sensor_fault", evidenceStatus: "none" }),
    true,
  );
});

test("buildTelemetryEvidence resume janela e escolhe amostra mais proxima", () => {
  const eventTime = new Date("2026-05-13T14:38:10.000Z");
  const evidence = buildTelemetryEvidence(
    [
      {
        id: 1,
        accel_magnitude: 1.2,
        gyro_magnitude: 20,
        created_at: new Date("2026-05-13T14:38:02.000Z"),
      },
      {
        id: 2,
        accel_magnitude: 3.8,
        gyro_magnitude: 180,
        created_at: new Date("2026-05-13T14:38:09.900Z"),
      },
      {
        id: 3,
        accel_magnitude: 1.1,
        gyro_magnitude: 12,
        created_at: new Date("2026-05-13T14:38:11.000Z"),
      },
    ],
    eventTime,
    true,
  );

  assert.equal(evidence.status, "linked");
  assert.equal(evidence.telemetryId, 2);
  assert.equal(evidence.sampleCount, 3);
  assert.equal(evidence.summary.maxAccelMagnitude, 3.8);
  assert.equal(evidence.summary.maxGyroMagnitude, 180);
  assert.equal(evidence.summary.immobilityConfirmed, true);
  assert.equal(evidence.links.find((link) => link.telemetryLogId === 2).role, "nearest");
});

test("buildTelemetryEvidence marca queda sem amostras como none", () => {
  const evidence = buildTelemetryEvidence([], new Date("2026-05-13T14:38:10.000Z"), false);

  assert.equal(evidence.status, "none");
  assert.equal(evidence.telemetryId, null);
  assert.equal(evidence.sampleCount, 0);
});

test("buildEvidenceSummaryForPayload preserva decisao e features do firmware", () => {
  const eventTime = new Date("2026-05-13T14:38:10.000Z");
  const evidence = buildTelemetryEvidence(
    [
      {
        id: 2,
        accel_magnitude: 3.8,
        gyro_magnitude: 180,
        created_at: eventTime,
      },
    ],
    eventTime,
    true,
  );
  const summary = buildEvidenceSummaryForPayload(evidence, {
    event_type: "fall_detected",
    decision_source: "firmware",
    algorithm_version: "threshold_fsm_v2_time_features_v1",
    detected: true,
    candidate: true,
    reason: "impact_orientation_immobility",
    activity_state_estimate: "queda_confirmada",
    confidence: 0.76,
    peak_accel_g: 3.8,
    peak_gyro_dps: 180,
    features_time_domain: {
      available: true,
      sample_count: 64,
      peak_jerk: 8.2,
    },
    features_frequency_domain: {
      available: false,
      experimental: true,
      reason: "fft_experimental_disabled",
    },
  });

  assert.equal(summary.maxAccelMagnitude, 3.8);
  assert.equal(summary.firmwareDecision.decisionSource, "firmware");
  assert.equal(
    summary.firmwareDecision.algorithmVersion,
    "threshold_fsm_v2_time_features_v1",
  );
  assert.equal(summary.firmwareDecision.featuresTimeDomain.sample_count, 64);
  assert.equal(summary.firmwareDecision.featuresFrequencyDomain.available, false);
  assert.equal(summary.linkedTelemetryWindow.status, "partial");
});

test("validateTelemetryPayload exige eixos reais e sensor valido", () => {
  assert.equal(
    validateTelemetryPayload({
      ax: 0,
      ay: 0,
      az: 1,
      gx: 0,
      gy: 0,
      gz: 0,
      sensor_valid: true,
    }).valid,
    true,
  );

  const missingAxes = validateTelemetryPayload({ ax: 0, ay: 0, az: 1 });
  assert.equal(missingAxes.valid, false);
  assert.equal(missingAxes.reason, "missing_sensor_axes");

  const invalidSensor = validateTelemetryPayload({
    ax: 0,
    ay: 0,
    az: 1,
    gx: 0,
    gy: 0,
    gz: 0,
    sensor_valid: false,
  });
  assert.equal(invalidSensor.valid, false);
  assert.equal(invalidSensor.reason, "sensor_invalid");
});
