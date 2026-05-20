const CURRENT_BEHAVIOR_STATES = Object.freeze([
  "pre_calibracao",
  "desconhecido",
  "sem_telemetria_suficiente",
  "sensor_sem_leitura_valida",
  "telemetria_desatualizada",
  "em_reposo",
  "repouso_provavel",
  "deitado",
  "sentado",
  "sentado_deitado_provavel",
  "em_movimento",
  "movimento_leve",
  "movimento_intenso",
  "queda_suspeita",
  "queda_confirmada",
  "sos_manual",
  "calibracao_pendente",
  "em_calibracao",
]);

const FUTURE_BEHAVIOR_STATES = Object.freeze([
  "andando",
  "correndo",
  "caido",
  "queda_com_imobilidade",
]);

const BEHAVIOR_CONFIDENCE_LEVELS = Object.freeze([
  "baixo",
  "medio",
  "alto",
]);

const PRE_CALIBRATION_MIN_SAMPLES = 4;
const PRE_CALIBRATION_WINDOW_MS = 75_000;
const PRE_CALIBRATION_MIN_WINDOW_SECONDS = 6;
const TELEMETRY_FRESHNESS_WINDOW_MS = 45_000;
const UNKNOWN_AFTER_MS = 3 * 60_000;
const RECENT_FALL_WINDOW_MS = 2 * 60_000;
const RECENT_SOS_WINDOW_MS = 2 * 60_000;
const RECENT_CALIBRATION_WINDOW_MS = 10 * 60_000;
const REST_GYRO_THRESHOLD = 12;
const REST_ACCEL_DELTA_THRESHOLD = 0.08;
const MOVEMENT_LIGHT_AVG_GYRO_THRESHOLD = 18;
const MOVEMENT_LIGHT_PEAK_GYRO_THRESHOLD = 42;
const MOVEMENT_LIGHT_AVG_ACCEL_DELTA_THRESHOLD = 0.14;
const MOVEMENT_LIGHT_PEAK_ACCEL_DELTA_THRESHOLD = 0.24;
const MOVEMENT_INTENSE_AVG_GYRO_THRESHOLD = 55;
const MOVEMENT_INTENSE_PEAK_GYRO_THRESHOLD = 100;
const MOVEMENT_INTENSE_AVG_ACCEL_DELTA_THRESHOLD = 0.34;
const MOVEMENT_INTENSE_PEAK_ACCEL_DELTA_THRESHOLD = 0.55;
const ORIENTATION_STABILITY_RANGE = 18;
const LYING_TILT_THRESHOLD = 55;
const SITTING_TILT_THRESHOLD = 20;

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function clampConfidence(level) {
  if (BEHAVIOR_CONFIDENCE_LEVELS.includes(level)) {
    return level;
  }

  return "baixo";
}

function buildBehavior(state, confidence, reason, details = {}) {
  return {
    state,
    confidence: clampConfidence(confidence),
    reason,
    experimental: true,
    version: "heuristic_v2",
    source: details.source || "fallback",
    updatedAt: toIso(details.updatedAt),
    telemetrySampleCount: Number(details.telemetrySampleCount || 0),
    telemetryWindowSeconds: Number(details.telemetryWindowSeconds || 0),
    plannedFutureStates: FUTURE_BEHAVIOR_STATES,
  };
}

function summarizeTelemetry(telemetrySamples) {
  const normalizedSamples = telemetrySamples
    .map((sample) => ({
      accelMagnitude:
        sample.accelMagnitude == null ? null : Number(sample.accelMagnitude),
      gyroMagnitude:
        sample.gyroMagnitude == null ? null : Number(sample.gyroMagnitude),
      pitchDeg: sample.pitchDeg == null ? null : Number(sample.pitchDeg),
      rollDeg: sample.rollDeg == null ? null : Number(sample.rollDeg),
      createdAt: toDate(sample.createdAt),
    }))
    .filter((sample) => sample.createdAt);

  normalizedSamples.sort((left, right) => right.createdAt - left.createdAt);

  if (!normalizedSamples.length) {
    return null;
  }

  const latestSample = normalizedSamples[0];
  const telemetryWindowSeconds = latestSample.createdAt && normalizedSamples.at(-1)?.createdAt
    ? Math.max(
        0,
        Math.round((latestSample.createdAt - normalizedSamples.at(-1).createdAt) / 1000),
      )
    : 0;

  const accelDeltas = normalizedSamples
    .map((sample) =>
      sample.accelMagnitude == null ? null : Math.abs(sample.accelMagnitude - 1),
    )
    .filter((value) => value != null);
  const gyroMagnitudes = normalizedSamples
    .map((sample) => sample.gyroMagnitude)
    .filter((value) => value != null);
  const pitches = normalizedSamples
    .map((sample) => sample.pitchDeg)
    .filter((value) => value != null);
  const rolls = normalizedSamples
    .map((sample) => sample.rollDeg)
    .filter((value) => value != null);

  const average = (values) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const range = (values) =>
    values.length ? Math.max(...values) - Math.min(...values) : null;

  return {
    latestSample,
    sampleCount: normalizedSamples.length,
    telemetryWindowSeconds,
    averageGyroMagnitude: average(gyroMagnitudes),
    peakGyroMagnitude: gyroMagnitudes.length ? Math.max(...gyroMagnitudes) : null,
    averageAccelDelta: average(accelDeltas),
    peakAccelDelta: accelDeltas.length ? Math.max(...accelDeltas) : null,
    pitchRange: range(pitches),
    rollRange: range(rolls),
    latestPitchAbs:
      latestSample.pitchDeg == null ? null : Math.abs(latestSample.pitchDeg),
    latestRollAbs:
      latestSample.rollDeg == null ? null : Math.abs(latestSample.rollDeg),
    orientationSampleCount: Math.min(pitches.length, rolls.length),
  };
}

function normalizeRecentEvents(recentEvents) {
  return recentEvents
    .map((event) => ({
      eventType: event.eventType,
      severity: event.severity,
      immobility: Boolean(event.immobility),
      evidenceStatus: event.evidenceStatus || "none",
      evidenceSampleCount: Number(event.evidenceSampleCount || 0),
      eventTime: toDate(event.eventTime || event.createdAt),
    }))
    .filter((event) => event.eventTime)
    .sort((left, right) => right.eventTime - left.eventTime);
}

function findRecentEvent(recentEvents, eventTypes, now, windowMs) {
  return normalizeRecentEvents(recentEvents)
    .filter((event) => eventTypes.includes(event.eventType))
    .find((event) => now - event.eventTime <= windowMs) || null;
}

function computeDeviceBehavior({
  status = null,
  telemetrySamples = [],
  recentEvents = [],
  now = new Date(),
}) {
  const referenceNow = toDate(now) || new Date();
  const latestSeenAt = toDate(status?.lastSeenAt);
  const recentCalibrationEvent = findRecentEvent(
    recentEvents,
    ["calibration_started", "calibration_sample_started"],
    referenceNow,
    RECENT_CALIBRATION_WINDOW_MS,
  );
  const recentSosEvent = findRecentEvent(
    recentEvents,
    ["sos_pressed", "manual_sos"],
    referenceNow,
    RECENT_SOS_WINDOW_MS,
  );
  const recentFallEvent = findRecentEvent(
    recentEvents,
    ["fall_detected"],
    referenceNow,
    RECENT_FALL_WINDOW_MS,
  );

  if (recentCalibrationEvent) {
    return buildBehavior(
      "em_calibracao",
      "medio",
      "Sessao de calibracao experimental em andamento ou iniciada recentemente.",
      {
        source: "recent_calibration_event",
        updatedAt: recentCalibrationEvent.eventTime,
      },
    );
  }

  if (recentSosEvent && (!recentFallEvent || recentSosEvent.eventTime > recentFallEvent.eventTime)) {
    return buildBehavior(
      "sos_manual",
      "alto",
      "Botao SOS manual acionado recentemente.",
      {
        source: "recent_sos_event",
        updatedAt: recentSosEvent.eventTime,
      },
    );
  }

  if (recentFallEvent) {
    const hasEvidence = ["linked", "partial"].includes(recentFallEvent.evidenceStatus);
    const confirmed =
      hasEvidence && (recentFallEvent.immobility || recentFallEvent.severity === "critical");

    return buildBehavior(
      confirmed ? "queda_confirmada" : "queda_suspeita",
      confirmed ? "alto" : "medio",
      confirmed
        ? "Evento recente de queda com imobilidade confirmada."
        : hasEvidence
          ? "Evento recente de queda ainda em observacao."
          : "Evento recente de queda sem evidencia de telemetria suficiente.",
      {
        source: "recent_fall_event",
        updatedAt: recentFallEvent.eventTime,
        telemetrySampleCount: recentFallEvent.evidenceSampleCount,
      },
    );
  }

  const sensorMarkedInvalid =
    status?.online &&
    (
      status.sensorReady === false ||
      status.sensorValid === false ||
      (status.sensorReadOk === false && !status.lastTelemetryAt)
    );

  if (sensorMarkedInvalid) {
    return buildBehavior(
      "sensor_sem_leitura_valida",
      "alto",
      "O device esta online por status MQTT, mas a saude do sensor indica leitura invalida.",
      {
        source: "device_status",
        updatedAt: latestSeenAt,
      },
    );
  }

  const telemetry = summarizeTelemetry(telemetrySamples);

  if (!telemetry) {
    if (status?.online && latestSeenAt && referenceNow - latestSeenAt <= PRE_CALIBRATION_WINDOW_MS) {
      return buildBehavior(
        "sem_telemetria_suficiente",
        "baixo",
        "Device online por status MQTT, mas ainda sem telemetria real valida suficiente.",
        {
          source: "device_status",
          updatedAt: latestSeenAt,
        },
      );
    }

    return buildBehavior(
      "sem_telemetria_suficiente",
      "baixo",
      "Sem telemetria suficiente para inferir postura ou movimento.",
      {
        source: "fallback",
        updatedAt: latestSeenAt,
      },
    );
  }

  const latestTelemetryAt = telemetry.latestSample.createdAt;
  const telemetryAgeMs = referenceNow - latestTelemetryAt;

  if (
    telemetryAgeMs > UNKNOWN_AFTER_MS ||
    telemetryAgeMs > TELEMETRY_FRESHNESS_WINDOW_MS ||
    (!status?.online && telemetryAgeMs > TELEMETRY_FRESHNESS_WINDOW_MS)
  ) {
    return buildBehavior(
      "telemetria_desatualizada",
      "baixo",
      "A ultima telemetria valida esta stale para inferencia confiavel.",
      {
        source: "fallback",
        updatedAt: latestTelemetryAt,
        telemetrySampleCount: telemetry.sampleCount,
        telemetryWindowSeconds: telemetry.telemetryWindowSeconds,
      },
    );
  }

  if (
    telemetry.sampleCount < PRE_CALIBRATION_MIN_SAMPLES ||
    telemetry.telemetryWindowSeconds < PRE_CALIBRATION_MIN_WINDOW_SECONDS
  ) {
    return buildBehavior(
      "calibracao_pendente",
      "baixo",
      "Janela inicial de telemetria ainda curta para classificar postura com seguranca.",
      {
        source: "telemetry_window",
        updatedAt: latestTelemetryAt,
        telemetrySampleCount: telemetry.sampleCount,
        telemetryWindowSeconds: telemetry.telemetryWindowSeconds,
      },
    );
  }

  const averageGyroMagnitude = telemetry.averageGyroMagnitude ?? 0;
  const peakGyroMagnitude = telemetry.peakGyroMagnitude ?? 0;
  const averageAccelDelta = telemetry.averageAccelDelta ?? 0;
  const peakAccelDelta = telemetry.peakAccelDelta ?? 0;
  const orientationStable =
    telemetry.orientationSampleCount >= PRE_CALIBRATION_MIN_SAMPLES &&
    telemetry.pitchRange != null &&
    telemetry.rollRange != null &&
    telemetry.pitchRange <= ORIENTATION_STABILITY_RANGE &&
    telemetry.rollRange <= ORIENTATION_STABILITY_RANGE;

  const intenseMovementDetected =
    averageGyroMagnitude >= MOVEMENT_INTENSE_AVG_GYRO_THRESHOLD ||
    peakGyroMagnitude >= MOVEMENT_INTENSE_PEAK_GYRO_THRESHOLD ||
    averageAccelDelta >= MOVEMENT_INTENSE_AVG_ACCEL_DELTA_THRESHOLD ||
    peakAccelDelta >= MOVEMENT_INTENSE_PEAK_ACCEL_DELTA_THRESHOLD;
  const lightMovementDetected =
    averageGyroMagnitude >= MOVEMENT_LIGHT_AVG_GYRO_THRESHOLD ||
    peakGyroMagnitude >= MOVEMENT_LIGHT_PEAK_GYRO_THRESHOLD ||
    averageAccelDelta >= MOVEMENT_LIGHT_AVG_ACCEL_DELTA_THRESHOLD ||
    peakAccelDelta >= MOVEMENT_LIGHT_PEAK_ACCEL_DELTA_THRESHOLD;

  if (intenseMovementDetected || lightMovementDetected) {
    return buildBehavior(
      intenseMovementDetected ? "movimento_intenso" : "movimento_leve",
      intenseMovementDetected ? "medio" : telemetry.sampleCount >= 6 ? "alto" : "medio",
      intenseMovementDetected
        ? "Picos recentes de aceleracao/giroscopio indicam movimento intenso."
        : "Variacao recente de aceleracao/giroscopio indica movimento leve acima do repouso.",
      {
        source: "telemetry_window",
        updatedAt: latestTelemetryAt,
        telemetrySampleCount: telemetry.sampleCount,
        telemetryWindowSeconds: telemetry.telemetryWindowSeconds,
      },
    );
  }

  const tiltMagnitude = Math.max(
    telemetry.latestPitchAbs ?? 0,
    telemetry.latestRollAbs ?? 0,
  );

  if (
    orientationStable &&
    averageGyroMagnitude <= REST_GYRO_THRESHOLD &&
    averageAccelDelta <= REST_ACCEL_DELTA_THRESHOLD
  ) {
    if (tiltMagnitude >= LYING_TILT_THRESHOLD) {
      return buildBehavior(
        "sentado_deitado_provavel",
        telemetry.sampleCount >= 6 ? "alto" : "medio",
        "Orientacao horizontal estavel com baixa movimentacao.",
        {
          source: "telemetry_window",
          updatedAt: latestTelemetryAt,
          telemetrySampleCount: telemetry.sampleCount,
          telemetryWindowSeconds: telemetry.telemetryWindowSeconds,
        },
      );
    }

    if (tiltMagnitude >= SITTING_TILT_THRESHOLD) {
      return buildBehavior(
        "sentado_deitado_provavel",
        "medio",
        "Orientacao inclinada estavel com baixa movimentacao.",
        {
          source: "telemetry_window",
          updatedAt: latestTelemetryAt,
          telemetrySampleCount: telemetry.sampleCount,
          telemetryWindowSeconds: telemetry.telemetryWindowSeconds,
        },
      );
    }

    return buildBehavior(
      "repouso_provavel",
      telemetry.sampleCount >= 6 ? "alto" : "medio",
      "Telemetria recente sugere repouso estavel, ainda sem postura especifica forte.",
      {
        source: "telemetry_window",
        updatedAt: latestTelemetryAt,
        telemetrySampleCount: telemetry.sampleCount,
        telemetryWindowSeconds: telemetry.telemetryWindowSeconds,
      },
    );
  }

  if (
    averageGyroMagnitude <= REST_GYRO_THRESHOLD &&
    averageAccelDelta <= REST_ACCEL_DELTA_THRESHOLD
  ) {
    return buildBehavior(
      "repouso_provavel",
      "medio",
      "Baixa movimentacao recente, mas com orientacao ainda pouco confiavel para postura especifica.",
      {
        source: "telemetry_window",
        updatedAt: latestTelemetryAt,
        telemetrySampleCount: telemetry.sampleCount,
        telemetryWindowSeconds: telemetry.telemetryWindowSeconds,
      },
    );
  }

  return buildBehavior(
    "sem_telemetria_suficiente",
    "baixo",
    "Sinais recentes ainda nao permitem uma classificacao postural confiavel.",
    {
      source: "telemetry_window",
      updatedAt: latestTelemetryAt,
      telemetrySampleCount: telemetry.sampleCount,
      telemetryWindowSeconds: telemetry.telemetryWindowSeconds,
    },
  );
}

module.exports = {
  BEHAVIOR_CONFIDENCE_LEVELS,
  CURRENT_BEHAVIOR_STATES,
  FUTURE_BEHAVIOR_STATES,
  computeDeviceBehavior,
};
