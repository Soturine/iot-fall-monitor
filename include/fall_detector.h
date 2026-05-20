#pragma once

#include "app_config.h"
#include "models.h"

class FallDetector {
 public:
  FallAlert update(const SensorReading& reading);
  void reset();

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
};
