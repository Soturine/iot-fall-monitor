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
  void begin(uint8_t ledPin,
             uint8_t buzzerPin,
             bool buzzerActiveHigh = true,
             bool ledEnabled = true,
             bool buzzerEnabled = true);
  void setBuzzerEnabled(bool enabled);
  void setState(IndicatorState state);
  void triggerAlarm(uint8_t cycles = 6, const char* reason = "alert");
  void triggerPulse(unsigned long durationMs, const char* reason = "test");
  void update();

 private:
  void renderState(unsigned long nowMs);
  void writeOutputs(bool ledOn, bool buzzerOn);

  uint8_t ledPin_ = 0;
  uint8_t buzzerPin_ = 0;
  bool configured_ = false;
  bool ledEnabled_ = true;
  bool buzzerEnabled_ = true;
  bool buzzerActiveHigh_ = true;
  bool ledState_ = false;
  bool buzzerState_ = false;

  IndicatorState state_ = IndicatorState::Booting;

  uint8_t alarmTogglesRemaining_ = 0;
  unsigned long lastAlarmToggleMs_ = 0;
  bool alarmActive_ = false;
  bool pulseActive_ = false;
  const char* alarmReason_ = "none";
  const char* pulseReason_ = "none";
  unsigned long pulseStartedAtMs_ = 0;
  unsigned long pulseDurationMs_ = 0;
};
