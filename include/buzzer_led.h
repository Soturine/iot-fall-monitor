#pragma once

#include <Arduino.h>

enum class IndicatorState {
  Booting,
  WifiConnecting,
  Online,
  Warning,
  Error
};

class BuzzerLed {
 public:
  void begin(uint8_t ledPin, uint8_t buzzerPin);
  void setState(IndicatorState state);
  void triggerAlarm(uint8_t cycles = 6);
  void triggerPulse(unsigned long durationMs);
  void update();

 private:
  void renderState(unsigned long nowMs);
  void writeOutputs(bool ledOn, bool buzzerOn);

  uint8_t ledPin_ = 0;
  uint8_t buzzerPin_ = 0;
  bool configured_ = false;
  bool ledState_ = false;
  bool buzzerState_ = false;

  IndicatorState state_ = IndicatorState::Booting;

  uint8_t alarmTogglesRemaining_ = 0;
  unsigned long lastAlarmToggleMs_ = 0;
  bool pulseActive_ = false;
  unsigned long pulseStartedAtMs_ = 0;
  unsigned long pulseDurationMs_ = 0;
};
