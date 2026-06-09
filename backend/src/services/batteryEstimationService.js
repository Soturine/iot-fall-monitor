const { execute } = require("../db/pool");
const { toNullableNumber } = require("../utils/formatters");

const INITIAL_MINUTES_PER_PERCENT = 33.5;
const MIN_OBSERVED_MINUTES_PER_PERCENT = 5;
const MAX_OBSERVED_MINUTES_PER_PERCENT = 120;
const MIN_LEARNING_ELAPSED_MINUTES = 10;

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function estimateBattery({
  manualPercent,
  manualUpdatedAt,
  minutesPerPercent = INITIAL_MINUTES_PER_PERCENT,
  now = new Date(),
}) {
  if (
    !Number.isFinite(manualPercent) ||
    manualPercent < 0 ||
    manualPercent > 100 ||
    !(manualUpdatedAt instanceof Date) ||
    Number.isNaN(manualUpdatedAt.getTime()) ||
    !Number.isFinite(minutesPerPercent) ||
    minutesPerPercent <= 0
  ) {
    return null;
  }

  const elapsedMinutes = Math.max(0, (now.getTime() - manualUpdatedAt.getTime()) / 60000);
  const percent = clampPercent(manualPercent - elapsedMinutes / minutesPerPercent);

  return {
    percent,
    elapsedMinutes,
    remainingMinutes: Math.max(0, Math.floor(percent * minutesPerPercent)),
  };
}

function calculateLearnedRate({
  previousPercent,
  previousAt,
  currentPercent,
  currentAt,
  currentRate = INITIAL_MINUTES_PER_PERCENT,
}) {
  if (currentPercent > previousPercent) {
    return { appliedRate: currentRate, observedRate: null, ignoredReason: "percent_increased" };
  }

  const percentDrop = previousPercent - currentPercent;
  if (percentDrop <= 0) {
    return { appliedRate: currentRate, observedRate: null, ignoredReason: "no_percent_drop" };
  }

  const elapsedMinutes = (currentAt.getTime() - previousAt.getTime()) / 60000;
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < MIN_LEARNING_ELAPSED_MINUTES) {
    return { appliedRate: currentRate, observedRate: null, ignoredReason: "elapsed_too_short" };
  }

  const observedRate = elapsedMinutes / percentDrop;
  if (
    observedRate < MIN_OBSERVED_MINUTES_PER_PERCENT ||
    observedRate > MAX_OBSERVED_MINUTES_PER_PERCENT
  ) {
    return { appliedRate: currentRate, observedRate, ignoredReason: "observed_rate_out_of_range" };
  }

  return {
    appliedRate: currentRate * 0.7 + observedRate * 0.3,
    observedRate,
    ignoredReason: null,
  };
}

function resolveCalibrationAt(payload, receivedAt) {
  const epochSeconds = toNullableNumber(payload.battery_manual_updated_at);
  if (epochSeconds && epochSeconds >= 1700000000) {
    const candidate = new Date(epochSeconds * 1000);
    const skewMs = Math.abs(receivedAt.getTime() - candidate.getTime());
    if (!Number.isNaN(candidate.getTime()) && skewMs <= 24 * 60 * 60 * 1000) {
      return candidate;
    }
  }

  return receivedAt;
}

async function queryOne(executor, sql, params) {
  const rows = await execute(executor, sql, params);
  return rows[0] || null;
}

async function processBatteryPayload({ deviceId, payload, receivedAt }, executor = null) {
  const source = String(payload.battery_percent_source || "").trim().toLowerCase();
  if (source === "not_configured") {
    return {
      batteryPercent: null,
      batteryPercentSource: "not_configured",
      clearBatteryEstimate: true,
    };
  }

  const manualPercent = toNullableNumber(
    payload.battery_manual_percent ??
      (source === "manual" || source === "manual_estimated" ? payload.battery_percent : null),
  );
  if (!Number.isFinite(manualPercent) || manualPercent < 0 || manualPercent > 100) {
    return {
      batteryPercent: toNullableNumber(payload.battery_percent ?? payload.battery_level),
      batteryPercentSource: source || null,
    };
  }

  const calibrationSequence = toNullableNumber(payload.battery_calibration_sequence);
  const calibrationAt = resolveCalibrationAt(payload, receivedAt);
  if (!calibrationSequence || calibrationSequence <= 0) {
    return {
      batteryPercent: clampPercent(manualPercent),
      batteryPercentSource: source || "manual",
    };
  }

  const currentStatus = await queryOne(
    executor,
    `
      SELECT
        battery_manual_percent AS manualPercent,
        battery_manual_updated_at AS manualUpdatedAt,
        battery_minutes_per_percent AS minutesPerPercent,
        battery_calibration_count AS calibrationCount
      FROM device_status
      WHERE device_id = ?
      LIMIT 1
    `,
    [deviceId],
  );
  let minutesPerPercent =
    toNullableNumber(currentStatus?.minutesPerPercent) || INITIAL_MINUTES_PER_PERCENT;
  let calibrationCount = Number(currentStatus?.calibrationCount || 0);
  let isNewCalibration = false;

  if (calibrationSequence && calibrationSequence > 0) {
    const duplicate = await queryOne(
      executor,
      `
        SELECT id
        FROM battery_calibrations
        WHERE device_id = ? AND calibration_sequence = ?
        LIMIT 1
      `,
      [deviceId, calibrationSequence],
    );

    if (!duplicate) {
      const previous = await queryOne(
        executor,
        `
          SELECT battery_percent AS batteryPercent, calibrated_at AS calibratedAt
          FROM battery_calibrations
          WHERE device_id = ?
          ORDER BY calibrated_at DESC, id DESC
          LIMIT 1
        `,
        [deviceId],
      );
      const learning = previous
        ? calculateLearnedRate({
            previousPercent: Number(previous.batteryPercent),
            previousAt: new Date(previous.calibratedAt),
            currentPercent: manualPercent,
            currentAt: calibrationAt,
            currentRate: minutesPerPercent,
          })
        : {
            appliedRate: minutesPerPercent,
            observedRate: null,
            ignoredReason: "first_calibration",
          };

      minutesPerPercent = learning.appliedRate;
      await execute(
        executor,
        `
          INSERT INTO battery_calibrations (
            device_id,
            battery_percent,
            calibrated_at,
            source,
            calibration_sequence,
            observed_minutes_per_percent,
            applied_minutes_per_percent,
            ignored_reason
          )
          VALUES (?, ?, ?, 'portal_manual', ?, ?, ?, ?)
        `,
        [
          deviceId,
          manualPercent,
          calibrationAt,
          calibrationSequence,
          learning.observedRate,
          learning.appliedRate,
          learning.ignoredReason,
        ],
      );
      calibrationCount += 1;
      isNewCalibration = true;
    }
  }

  const effectiveManualPercent = isNewCalibration
    ? manualPercent
    : toNullableNumber(currentStatus?.manualPercent) ?? manualPercent;
  const effectiveManualAt = isNewCalibration
    ? calibrationAt
    : currentStatus?.manualUpdatedAt
      ? new Date(currentStatus.manualUpdatedAt)
      : calibrationAt;
  const estimate = estimateBattery({
    manualPercent: effectiveManualPercent,
    manualUpdatedAt: effectiveManualAt,
    minutesPerPercent,
    now: receivedAt,
  });

  return {
    batteryPercent: estimate?.percent ?? manualPercent,
    batteryPercentSource: isNewCalibration ? "manual" : "manual_estimated",
    batteryManualPercent: effectiveManualPercent,
    batteryManualUpdatedAt: effectiveManualAt,
    batteryMinutesPerPercent: minutesPerPercent,
    batteryEstimatedRemainingMinutes: estimate?.remainingMinutes ?? null,
    batteryCalibrationCount: calibrationCount,
  };
}

module.exports = {
  INITIAL_MINUTES_PER_PERCENT,
  calculateLearnedRate,
  estimateBattery,
  processBatteryPayload,
};
