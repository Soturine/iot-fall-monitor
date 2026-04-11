#pragma once

#include <Arduino.h>

class SosButton {
 public:
  void begin(uint8_t pin, bool activeLow, unsigned long holdTimeMs);
  void update();

  bool consumePressedEvent();

 private:
  uint8_t pin_ = 0;
  bool activeLow_ = true;
  bool configured_ = false;
  bool lastRawPressed_ = false;
  bool stablePressed_ = false;
  bool eventPending_ = false;

  unsigned long holdTimeMs_ = 0;
  unsigned long lastDebounceAtMs_ = 0;
  unsigned long pressStartedAtMs_ = 0;
};
