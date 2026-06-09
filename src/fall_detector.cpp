#include "fall_detector.h"

#include <cmath>

#include "app_logging.h"

FallAlert FallDetector::update(const SensorReading& reading) {
  FallAlert alert;

  if (!reading.valid) {
    return alert;
  }

  refreshBaseline(reading);

  const unsigned long nowMs = reading.timestampMs;
  const unsigned long sampleDeltaMs =
      (lastSampleAtMs_ == 0 || nowMs < lastSampleAtMs_) ? 0 : (nowMs - lastSampleAtMs_);
  lastSampleAtMs_ = nowMs;

  // Maquina de estados simples: impacto -> orientacao -> imobilidade.
  switch (state_) {
    case State::Monitoring:
      if (isImpact(reading)) {
        // Congela a referencia de postura para comparar a mudanca apos o impacto.
        state_ = State::WaitingForOrientationChange;
        stateStartedAtMs_ = nowMs;
        candidateStartedAtMs_ = nowMs;
        immobileAccumulatedMs_ = 0;
        samplesConsidered_ = 1;
        referencePitchDeg_ = baselinePitchDeg_;
        referenceRollDeg_ = baselineRollDeg_;
        peakAccelMagnitudeG_ = reading.accelMagnitudeG;
        peakGyroMagnitudeDegPerSec_ = reading.gyroMagnitudeDegPerSec;
        peakOrientationDeltaDeg_ = 0.0f;
        AppLog::warnf("[fall] impact detected mode=%s accel=%.2f threshold=%.2f gyro=%.1f threshold=%.1f\n",
                      demoMode_ ? "demo" : "normal",
                      reading.accelMagnitudeG,
                      impactThresholdG_,
                      reading.gyroMagnitudeDegPerSec,
                      impactGyroThresholdDps_);
      }
      break;

    case State::WaitingForOrientationChange:
      // Guarda os maiores picos para incluir no payload final.
      ++samplesConsidered_;
      peakAccelMagnitudeG_ = fmaxf(peakAccelMagnitudeG_, reading.accelMagnitudeG);
      peakGyroMagnitudeDegPerSec_ =
          fmaxf(peakGyroMagnitudeDegPerSec_, reading.gyroMagnitudeDegPerSec);
      peakOrientationDeltaDeg_ = fmaxf(peakOrientationDeltaDeg_, orientationDeltaDeg(reading));

      if (orientationDeltaDeg(reading) >= orientationThresholdDeg_) {
        state_ = State::WaitingForImmobility;
        stateStartedAtMs_ = nowMs;
        immobileAccumulatedMs_ = 0;
        AppLog::warnf("[fall] orientation detected mode=%s delta=%.1f threshold=%.1f\n",
                      demoMode_ ? "demo" : "normal",
                      peakOrientationDeltaDeg_,
                      orientationThresholdDeg_);
      } else if ((nowMs - stateStartedAtMs_) > orientationWindowMs_) {
        AppLog::infof("[fall] candidate rejected reason=missing_orientation mode=%s window_ms=%lu peak_delta=%.1f\n",
                      demoMode_ ? "demo" : "normal",
                      orientationWindowMs_,
                      peakOrientationDeltaDeg_);
        reset();
      }
      break;

    case State::WaitingForImmobility:
      // Uma queda real tende a terminar em um curto periodo de pouca movimentacao.
      ++samplesConsidered_;
      peakAccelMagnitudeG_ = fmaxf(peakAccelMagnitudeG_, reading.accelMagnitudeG);
      peakGyroMagnitudeDegPerSec_ =
          fmaxf(peakGyroMagnitudeDegPerSec_, reading.gyroMagnitudeDegPerSec);
      peakOrientationDeltaDeg_ = fmaxf(peakOrientationDeltaDeg_, orientationDeltaDeg(reading));

      if (isImmobile(reading)) {
        immobileAccumulatedMs_ += sampleDeltaMs;
      } else {
        immobileAccumulatedMs_ = 0;
      }

      if (immobileAccumulatedMs_ >= requiredImmobilityMs_) {
        AppLog::warnf("[fall] confirmed reason=impact_orientation_immobility mode=%s immobility_ms=%lu required_ms=%lu samples=%u\n",
                      demoMode_ ? "demo" : "normal",
                      immobileAccumulatedMs_,
                      requiredImmobilityMs_,
                      samplesConsidered_);
        alert.detected = true;
        alert.candidate = true;
        alert.immobilityConfirmed = true;
        alert.decisionSource = "firmware";
        alert.algorithmVersion = AppConfig::FALL_DECISION_ENGINE_VERSION;
        alert.activityStateEstimate = "queda_confirmada";
        alert.confidence = 0.76f;
        alert.accelMagnitudeG = peakAccelMagnitudeG_;
        alert.gyroMagnitudeDegPerSec = peakGyroMagnitudeDegPerSec_;
        alert.peakAccelG = peakAccelMagnitudeG_;
        alert.peakGyroDps = peakGyroMagnitudeDegPerSec_;
        alert.pitchDeg = reading.pitchDeg;
        alert.rollDeg = reading.rollDeg;
        alert.orientationDeltaDeg = peakOrientationDeltaDeg_;
        alert.immobilityDurationMs = immobileAccumulatedMs_;
        alert.analysisWindowMs =
            candidateStartedAtMs_ == 0U || nowMs < candidateStartedAtMs_
                ? 0U
                : nowMs - candidateStartedAtMs_;
        alert.windowStartedAtMs = candidateStartedAtMs_;
        alert.windowEndedAtMs = nowMs;
        alert.sampleCount = samplesConsidered_;
        alert.samplesConsidered = samplesConsidered_;
        alert.detectorMode = demoMode_ ? "demo" : "normal";
        alert.thresholdProfile = alert.detectorMode;
        alert.impactDetected = true;
        alert.orientationChangeDetected = true;
        alert.immobilityDetected = true;
        alert.impactAccelThresholdG = impactThresholdG_;
        alert.impactGyroThresholdDps = impactGyroThresholdDps_;
        alert.orientationThresholdDeg = orientationThresholdDeg_;
        alert.immobilityRequiredMs = requiredImmobilityMs_;
        alert.sampleIntervalMs = demoMode_ ? AppConfig::SENSOR_DEMO_SAMPLE_INTERVAL_MS
                                           : AppConfig::SENSOR_NORMAL_SAMPLE_INTERVAL_MS;
        alert.telemetryIntervalMs = demoMode_ ? AppConfig::TELEMETRY_DEMO_REPORT_INTERVAL_MS
                                              : AppConfig::TELEMETRY_NORMAL_REPORT_INTERVAL_MS;
        alert.timestampMs = nowMs;
        reset();
      } else if ((nowMs - stateStartedAtMs_) > immobilityWindowMs_) {
        AppLog::infof("[fall] candidate rejected reason=missing_immobility mode=%s window_ms=%lu accumulated_ms=%lu\n",
                      demoMode_ ? "demo" : "normal",
                      immobilityWindowMs_,
                      immobileAccumulatedMs_);
        reset();
      }
      break;
  }

  return alert;
}

void FallDetector::setDemoMode(bool enabled) {
  if (demoMode_ == enabled) {
    return;
  }

  demoMode_ = enabled;
  impactThresholdG_ = enabled ? AppConfig::DEMO_IMPACT_THRESHOLD_G
                              : AppConfig::IMPACT_THRESHOLD_G;
  impactGyroThresholdDps_ = enabled ? AppConfig::DEMO_IMPACT_GYRO_THRESHOLD_DPS
                                    : AppConfig::IMPACT_GYRO_THRESHOLD_DPS;
  orientationThresholdDeg_ = enabled ? AppConfig::DEMO_ORIENTATION_CHANGE_THRESHOLD_DEG
                                     : AppConfig::ORIENTATION_CHANGE_THRESHOLD_DEG;
  orientationWindowMs_ = enabled ? AppConfig::DEMO_ORIENTATION_WINDOW_MS
                                 : AppConfig::ORIENTATION_WINDOW_MS;
  immobilityWindowMs_ = enabled ? AppConfig::DEMO_IMMOBILITY_WINDOW_MS
                                : AppConfig::IMMOBILITY_WINDOW_MS;
  requiredImmobilityMs_ = enabled ? AppConfig::DEMO_REQUIRED_IMMOBILITY_MS
                                  : AppConfig::REQUIRED_IMMOBILITY_MS;
  reset();
}

void FallDetector::reset() {
  // Reinicia apenas o estado transitivo; a baseline de postura continua sendo aprendida.
  state_ = State::Monitoring;
  stateStartedAtMs_ = 0;
  immobileAccumulatedMs_ = 0;
  peakAccelMagnitudeG_ = 0.0f;
  peakGyroMagnitudeDegPerSec_ = 0.0f;
  peakOrientationDeltaDeg_ = 0.0f;
  candidateStartedAtMs_ = 0;
  samplesConsidered_ = 0;
}

bool FallDetector::hasPendingCandidate() const {
  return state_ != State::Monitoring;
}

void FallDetector::refreshBaseline(const SensorReading& reading) {
  // A baseline so e atualizada quando o dispositivo parece estar em postura estavel.
  const bool stableForBaseline =
      reading.gyroMagnitudeDegPerSec < 25.0f && fabsf(reading.accelMagnitudeG - 1.0f) < 0.20f;

  if (!stableForBaseline) {
    return;
  }

  if (!baselineInitialized_) {
    baselinePitchDeg_ = reading.pitchDeg;
    baselineRollDeg_ = reading.rollDeg;
    baselineInitialized_ = true;
    return;
  }

  // Media exponencial lenta evita que pequenos movimentos desloquem a referencia abruptamente.
  baselinePitchDeg_ = 0.85f * baselinePitchDeg_ + 0.15f * reading.pitchDeg;
  baselineRollDeg_ = 0.85f * baselineRollDeg_ + 0.15f * reading.rollDeg;
}

bool FallDetector::isImpact(const SensorReading& reading) const {
  // Exigir impacto e giro ao mesmo tempo reduz disparos por sacudidas leves.
  return reading.accelMagnitudeG >= impactThresholdG_ &&
         reading.gyroMagnitudeDegPerSec >= impactGyroThresholdDps_;
}

bool FallDetector::isImmobile(const SensorReading& reading) const {
  // O repouso esperado apos a queda fica perto de 1 g e baixo giro.
  return fabsf(reading.accelMagnitudeG - 1.0f) <= AppConfig::IMMOBILE_ACCEL_TOLERANCE_G &&
         reading.gyroMagnitudeDegPerSec <= AppConfig::IMMOBILE_GYRO_THRESHOLD_DPS;
}

float FallDetector::orientationDeltaDeg(const SensorReading& reading) const {
  const float pitchDelta = fabsf(reading.pitchDeg - referencePitchDeg_);
  const float rollDelta = fabsf(reading.rollDeg - referenceRollDeg_);
  return fmaxf(pitchDelta, rollDelta);
}
