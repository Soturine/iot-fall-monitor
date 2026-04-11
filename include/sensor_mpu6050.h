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

 private:
  void applyLowPass(float rawAccelX,
                    float rawAccelY,
                    float rawAccelZ,
                    float rawGyroX,
                    float rawGyroY,
                    float rawGyroZ);
  void computeDerivedValues();

  bool configureSensor();
  bool readRawSample(int16_t& accelX,
                     int16_t& accelY,
                     int16_t& accelZ,
                     int16_t& gyroX,
                     int16_t& gyroY,
                     int16_t& gyroZ);

  SensorReading reading_;
  bool ready_ = false;
  bool filterInitialized_ = false;
  TwoWire* wire_ = nullptr;
  uint8_t address_ = 0x68;
  uint8_t whoAmI_ = 0;

  float filteredAccelXG_ = 0.0f;
  float filteredAccelYG_ = 0.0f;
  float filteredAccelZG_ = 0.0f;
  float filteredGyroXDegPerSec_ = 0.0f;
  float filteredGyroYDegPerSec_ = 0.0f;
  float filteredGyroZDegPerSec_ = 0.0f;
};
