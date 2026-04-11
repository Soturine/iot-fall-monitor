#pragma once

#include <Arduino.h>

struct SensorReading {
  bool valid = false;
  float accelXG = 0.0f;
  float accelYG = 0.0f;
  float accelZG = 0.0f;
  float gyroXDegPerSec = 0.0f;
  float gyroYDegPerSec = 0.0f;
  float gyroZDegPerSec = 0.0f;
  float accelMagnitudeG = 0.0f;
  float gyroMagnitudeDegPerSec = 0.0f;
  float pitchDeg = 0.0f;
  float rollDeg = 0.0f;
  unsigned long timestampMs = 0;
};

struct FallAlert {
  bool detected = false;
  bool immobilityConfirmed = false;
  float accelMagnitudeG = 0.0f;
  float gyroMagnitudeDegPerSec = 0.0f;
  unsigned long timestampMs = 0;
};

struct BufferedEvent {
  String topic;
  String payload;
  unsigned long queuedAtMs = 0;
};
