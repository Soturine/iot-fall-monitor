#pragma once

#include <Arduino.h>

struct SensorReading {
  bool valid = false;
  int16_t rawAccelX = 0;
  int16_t rawAccelY = 0;
  int16_t rawAccelZ = 0;
  int16_t rawGyroX = 0;
  int16_t rawGyroY = 0;
  int16_t rawGyroZ = 0;
  float accelXG = 0.0f;
  float accelYG = 0.0f;
  float accelZG = 0.0f;
  float gyroXDegPerSec = 0.0f;
  float gyroYDegPerSec = 0.0f;
  float gyroZDegPerSec = 0.0f;
  float rawAccelMagnitudeG = 0.0f;
  float correctedAccelMagnitudeG = 0.0f;
  float accelMagnitudeG = 0.0f;
  float gyroMagnitudeDegPerSec = 0.0f;
  float pitchDeg = 0.0f;
  float rollDeg = 0.0f;
  unsigned long timestampMs = 0;
};

enum class MovementLabel {
  Unknown,
  Rest,
  Sitting,
  Lying,
  Walking,
  Running,
  Fall,
  FallWithImmobility,
  ManualSos
};

enum class ActivityState {
  Unknown,
  InsufficientTelemetry,
  SensorInvalid,
  StaleTelemetry,
  ProbableRest,
  ProbableSittingOrLying,
  LightMovement,
  IntenseMovement,
  PossibleFall,
  ConfirmedFall,
  ManualSos,
  CalibrationPending,
  Calibrating
};

struct FallTimeDomainFeatures {
  bool available = false;
  unsigned int sampleCount = 0;
  unsigned long windowStartedAtMs = 0;
  unsigned long windowEndedAtMs = 0;
  unsigned long windowDurationMs = 0;
  float meanAxG = 0.0f;
  float meanAyG = 0.0f;
  float meanAzG = 0.0f;
  float stdAxG = 0.0f;
  float stdAyG = 0.0f;
  float stdAzG = 0.0f;
  float meanGxDps = 0.0f;
  float meanGyDps = 0.0f;
  float meanGzDps = 0.0f;
  float stdGxDps = 0.0f;
  float stdGyDps = 0.0f;
  float stdGzDps = 0.0f;
  float energyAx = 0.0f;
  float energyAy = 0.0f;
  float energyAz = 0.0f;
  float energyGx = 0.0f;
  float energyGy = 0.0f;
  float energyGz = 0.0f;
  float peakAccelMagnitudeG = 0.0f;
  float peakGyroMagnitudeDps = 0.0f;
  float meanJerkGPerSec = 0.0f;
  float peakJerkGPerSec = 0.0f;
};

struct FallFrequencyDomainFeatures {
  bool available = false;
  bool experimental = true;
  unsigned int windowSize = 0;
  unsigned long sampleIntervalMs = 0;
  unsigned int sampleCount = 0;
  float spectralEnergyAx = 0.0f;
  float spectralEnergyAy = 0.0f;
  float spectralEnergyAz = 0.0f;
  float spectralEnergyGx = 0.0f;
  float spectralEnergyGy = 0.0f;
  float spectralEnergyGz = 0.0f;
  float dominantFrequencyAxHz = 0.0f;
  float dominantFrequencyAyHz = 0.0f;
  float dominantFrequencyAzHz = 0.0f;
  float dominantFrequencyGxHz = 0.0f;
  float dominantFrequencyGyHz = 0.0f;
  float dominantFrequencyGzHz = 0.0f;
};

struct LinkedTelemetryWindowHint {
  bool available = false;
  const char* reason = "backend_links_persisted_telemetry";
  unsigned long windowStartedAtMs = 0;
  unsigned long windowEndedAtMs = 0;
  unsigned int sampleCount = 0;
};

struct FallAlert {
  bool detected = false;
  bool candidate = false;
  bool immobilityConfirmed = false;
  const char* decisionSource = "firmware";
  const char* algorithmVersion = "threshold_fsm_v2_time_features_v1";
  const char* activityStateEstimate = "queda_confirmada";
  float confidence = 0.0f;
  float accelMagnitudeG = 0.0f;
  float gyroMagnitudeDegPerSec = 0.0f;
  float peakAccelG = 0.0f;
  float peakGyroDps = 0.0f;
  float pitchDeg = 0.0f;
  float rollDeg = 0.0f;
  float orientationDeltaDeg = 0.0f;
  unsigned long windowStartedAtMs = 0;
  unsigned long windowEndedAtMs = 0;
  unsigned long analysisWindowMs = 0;
  unsigned long immobilityDurationMs = 0;
  unsigned int sampleCount = 0;
  unsigned int samplesConsidered = 0;
  const char* reason = "impact_orientation_immobility";
  const char* detectorMode = "normal";
  const char* thresholdProfile = "normal";
  bool impactDetected = false;
  bool orientationChangeDetected = false;
  bool immobilityDetected = false;
  float impactAccelThresholdG = 0.0f;
  float impactGyroThresholdDps = 0.0f;
  float orientationThresholdDeg = 0.0f;
  unsigned long immobilityRequiredMs = 0;
  unsigned long sampleIntervalMs = 0;
  unsigned long telemetryIntervalMs = 0;
  unsigned long timestampMs = 0;
  FallTimeDomainFeatures timeDomainFeatures;
  FallFrequencyDomainFeatures frequencyDomainFeatures;
  LinkedTelemetryWindowHint linkedTelemetryWindow;
};

struct FallCalibrationProfile {
  bool available = false;
  const char* profileVersion = "none";
  MovementLabel movementLabel = MovementLabel::Unknown;
  float impactThresholdG = 0.0f;
  float impactGyroThresholdDps = 0.0f;
  float orientationChangeThresholdDeg = 0.0f;
  float immobilityGyroThresholdDps = 0.0f;
  float immobilityAccelToleranceG = 0.0f;
};

struct FallDecisionResult {
  bool experimental = false;
  ActivityState activityState = ActivityState::Unknown;
  MovementLabel movementLabel = MovementLabel::Unknown;
  FallAlert alert;
};

struct BufferedEvent {
  String topic;
  String payload;
  unsigned long queuedAtMs = 0;
};
