#pragma once

#include <Wire.h>

#include "app_config.h"
#include "models.h"

class SensorMPU6050 {
 public:
  bool begin(TwoWire& wire = Wire, uint8_t address = 0x68);
  bool update();

  const SensorReading& getReading() const;
  bool isReady() const;
  bool lastReadSucceeded() const;
  unsigned long consecutiveFailureCount() const;
  unsigned long totalI2cErrorCount() const;
  unsigned long i2cRecoveryCount() const;
  const char* lastI2cError() const;
  uint8_t activeAddress() const;
  uint8_t whoAmI() const;
  const char* detectedModelName() const;
  uint8_t accelRangeG() const;
  uint16_t gyroRangeDegPerSec() const;
  float accelLsbPerG() const;
  float gyroLsbPerDegPerSec() const;
  bool accelCalibrationApplied() const;
  const char* calibrationStatus() const;

 private:
  void applyLowPass(float rawAccelX,
                    float rawAccelY,
                    float rawAccelZ,
                    float rawGyroX,
                    float rawGyroY,
                    float rawGyroZ);
  void computeDerivedValues();
  void calibrateAccelerometer();
  bool refreshScaleFromRegisters();
  void logI2cErrorSummaryIfDue(unsigned long nowMs);
  bool recoverI2CBus(const char* reason);

  bool configureSensor(bool runCalibration = true);
  bool readRawSample(int16_t& accelX,
                     int16_t& accelY,
                     int16_t& accelZ,
                     int16_t& gyroX,
                     int16_t& gyroY,
                     int16_t& gyroZ);

  SensorReading reading_;
  bool ready_ = false;
  bool filterInitialized_ = false;
  bool lastReadSucceeded_ = false;
  TwoWire* wire_ = nullptr;
  uint8_t address_ = 0x68;
  uint8_t whoAmI_ = 0;
  const char* detectedModelName_ = "desconhecido";
  uint8_t accelFsBits_ = 0x10;
  uint8_t gyroFsBits_ = 0x08;
  uint8_t accelRangeG_ = 8;
  uint16_t gyroRangeDegPerSec_ = 500;
  float accelLsbPerG_ = 4096.0f;
  float gyroLsbPerDegPerSec_ = 65.5f;
  bool accelCalibrationApplied_ = false;
  bool scaleReadbackMismatchAccepted_ = false;
  const char* calibrationStatus_ = "not_started";
  const char* lastI2cError_ = "none";
  unsigned long consecutiveReadFailures_ = 0;
  unsigned long totalI2cErrors_ = 0;
  unsigned long i2cErrorsSinceSummary_ = 0;
  unsigned long i2cErrorsSinceRecovery_ = 0;
  unsigned long i2cRecoveryCount_ = 0;
  unsigned long lastI2cSummaryAtMs_ = 0;
  unsigned long lastRecoveryAttemptAtMs_ = 0;
  float accelOffsetXG_ = 0.0f;
  float accelOffsetYG_ = 0.0f;
  float accelOffsetZG_ = 0.0f;

  float filteredAccelXG_ = 0.0f;
  float filteredAccelYG_ = 0.0f;
  float filteredAccelZG_ = 0.0f;
  float filteredGyroXDegPerSec_ = 0.0f;
  float filteredGyroYDegPerSec_ = 0.0f;
  float filteredGyroZDegPerSec_ = 0.0f;
};
