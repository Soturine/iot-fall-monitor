#include "buzzer_led.h"

void BuzzerLed::begin(uint8_t ledPin, uint8_t buzzerPin, bool buzzerActiveHigh) {
  ledPin_ = ledPin;
  buzzerPin_ = buzzerPin;
  buzzerActiveHigh_ = buzzerActiveHigh;
  configured_ = true;

  pinMode(ledPin_, OUTPUT);
  pinMode(buzzerPin_, OUTPUT);

  writeOutputs(false, false);
}

void BuzzerLed::setState(IndicatorState state) {
  state_ = state;
}

void BuzzerLed::triggerAlarm(uint8_t cycles) {
  // Cada ciclo alterna LED e buzzer duas vezes para formar um padrao perceptivel.
  alarmTogglesRemaining_ = cycles * 2U;
  lastAlarmToggleMs_ = 0;
  pulseActive_ = false;
  pulseStartedAtMs_ = 0;
  pulseDurationMs_ = 0;
}

void BuzzerLed::triggerPulse(unsigned long durationMs) {
  if (durationMs == 0U) {
    return;
  }

  pulseActive_ = true;
  pulseStartedAtMs_ = 0;
  pulseDurationMs_ = durationMs;
}

void BuzzerLed::update() {
  if (!configured_) {
    return;
  }

  const unsigned long nowMs = millis();

  if (alarmTogglesRemaining_ > 0U) {
    // O alarme tem prioridade sobre os estados normais de sinalizacao.
    if (lastAlarmToggleMs_ == 0U || (nowMs - lastAlarmToggleMs_) >= 150U) {
      lastAlarmToggleMs_ = nowMs;
      writeOutputs(!ledState_, !buzzerState_);
      --alarmTogglesRemaining_;
    }
    return;
  }

  if (pulseActive_) {
    if (pulseStartedAtMs_ == 0U) {
      pulseStartedAtMs_ = nowMs;
      writeOutputs(ledState_, true);
      return;
    }

    if ((nowMs - pulseStartedAtMs_) < pulseDurationMs_) {
      writeOutputs(ledState_, true);
      return;
    }

    pulseActive_ = false;
    pulseStartedAtMs_ = 0;
    pulseDurationMs_ = 0;
    writeOutputs(ledState_, false);
  }

  renderState(nowMs);
}

void BuzzerLed::renderState(unsigned long nowMs) {
  bool ledOn = false;

  // Cada estado usa um padrao visual diferente para facilitar diagnostico em bancada.
  switch (state_) {
    case IndicatorState::Booting:
      ledOn = ((nowMs / 500U) % 2U) == 0U;
      break;

    case IndicatorState::WifiConnecting:
      ledOn = ((nowMs / 250U) % 2U) == 0U;
      break;

    case IndicatorState::Online:
      ledOn = true;
      break;

    case IndicatorState::Warning:
      ledOn = ((nowMs / 125U) % 2U) == 0U;
      break;

    case IndicatorState::Error: {
      const unsigned long phase = nowMs % 900U;
      ledOn = (phase < 100U) || (phase >= 200U && phase < 300U);
      break;
    }
  }

  writeOutputs(ledOn, false);
}

void BuzzerLed::writeOutputs(bool ledOn, bool buzzerOn) {
  // So escrevemos no GPIO quando ha mudanca real de estado.
  if (ledOn != ledState_) {
    digitalWrite(ledPin_, ledOn ? HIGH : LOW);
    ledState_ = ledOn;
  }

  if (buzzerOn != buzzerState_) {
    const uint8_t buzzerLevel = buzzerOn
                                    ? (buzzerActiveHigh_ ? HIGH : LOW)
                                    : (buzzerActiveHigh_ ? LOW : HIGH);
    digitalWrite(buzzerPin_, buzzerLevel);
    buzzerState_ = buzzerOn;
  }
}
