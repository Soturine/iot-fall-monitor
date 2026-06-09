#pragma once

#include "app_config.h"
#include "models.h"

class FallDetector {
 public:
  FallAlert update(const SensorReading& reading);
  void reset();
  void setDemoMode(bool enabled);

  bool hasPendingCandidate() const;

 private:
  enum class State {
    Monitoring,
    WaitingForOrientationChange,
    WaitingForImmobility
  };

  void refreshBaseline(const SensorReading& reading);
  bool isImpact(const SensorReading& reading) const;
  bool isImmobile(const SensorReading& reading) const;
  float orientationDeltaDeg(const SensorReading& reading) const;

  State state_ = State::Monitoring;

  bool baselineInitialized_ = false;
  float baselinePitchDeg_ = 0.0f;
  float baselineRollDeg_ = 0.0f;

  float referencePitchDeg_ = 0.0f;
  float referenceRollDeg_ = 0.0f;
  float peakAccelMagnitudeG_ = 0.0f;
  float peakGyroMagnitudeDegPerSec_ = 0.0f;
  float peakOrientationDeltaDeg_ = 0.0f;

  unsigned long stateStartedAtMs_ = 0;
  unsigned long candidateStartedAtMs_ = 0;
  unsigned long lastSampleAtMs_ = 0;
  unsigned long immobileAccumulatedMs_ = 0;
  unsigned int samplesConsidered_ = 0;
  bool demoMode_ = false;
  float impactThresholdG_ = AppConfig::IMPACT_THRESHOLD_G;
  float impactGyroThresholdDps_ = AppConfig::IMPACT_GYRO_THRESHOLD_DPS;
  float orientationThresholdDeg_ = AppConfig::ORIENTATION_CHANGE_THRESHOLD_DEG;
  unsigned long orientationWindowMs_ = AppConfig::ORIENTATION_WINDOW_MS;
  unsigned long immobilityWindowMs_ = AppConfig::IMMOBILITY_WINDOW_MS;
  unsigned long requiredImmobilityMs_ = AppConfig::REQUIRED_IMMOBILITY_MS;
};
