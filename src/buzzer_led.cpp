#include "buzzer_led.h"

#include "app_logging.h"

void BuzzerLed::begin(uint8_t ledPin,
                      uint8_t buzzerPin,
                      bool buzzerActiveHigh,
                      bool ledEnabled,
                      bool buzzerEnabled) {
  ledPin_ = ledPin;
  buzzerPin_ = buzzerPin;
  buzzerActiveHigh_ = buzzerActiveHigh;
  ledEnabled_ = ledEnabled;
  buzzerEnabled_ = buzzerEnabled;
  configured_ = ledEnabled_ || buzzerEnabled_;

  if (ledEnabled_) {
    pinMode(ledPin_, OUTPUT);
  }

  if (buzzerEnabled_) {
    pinMode(buzzerPin_, OUTPUT);
  }

  writeOutputs(false, false);
}

void BuzzerLed::setBuzzerEnabled(bool enabled) {
  if (buzzerEnabled_ == enabled) {
    return;
  }

  buzzerEnabled_ = enabled;
  configured_ = ledEnabled_ || buzzerEnabled_;

  if (enabled) {
    pinMode(buzzerPin_, OUTPUT);
  } else {
    pinMode(buzzerPin_, OUTPUT);
    digitalWrite(buzzerPin_, buzzerActiveHigh_ ? LOW : HIGH);
    buzzerState_ = false;
  }

  AppLog::infof("[buzzer] runtime enabled=%u\n", enabled ? 1U : 0U);
}

void BuzzerLed::setState(IndicatorState state) {
  state_ = state;
}

void BuzzerLed::triggerAlarm(uint8_t cycles) {
  // Cada ciclo alterna LED e buzzer duas vezes para formar um padrao perceptivel.
  if (cycles == 0U) {
    return;
  }

  alarmTogglesRemaining_ = cycles * 2U;
  lastAlarmToggleMs_ = 0;
  alarmActive_ = true;
  pulseActive_ = false;
  pulseStartedAtMs_ = 0;
  pulseDurationMs_ = 0;
  AppLog::warnf("[buzzer] alert pulse start cycles=%u buzzer_enabled=%u\n",
                cycles,
                buzzerEnabled_ ? 1U : 0U);
}

void BuzzerLed::triggerPulse(unsigned long durationMs) {
  if (durationMs == 0U) {
    return;
  }

  pulseActive_ = true;
  pulseStartedAtMs_ = 0;
  pulseDurationMs_ = durationMs;
  AppLog::warnf("[buzzer] test pulse start duration_ms=%lu buzzer_enabled=%u\n",
                durationMs,
                buzzerEnabled_ ? 1U : 0U);
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
      if (alarmTogglesRemaining_ == 0U && alarmActive_) {
        alarmActive_ = false;
        writeOutputs(ledState_, false);
        AppLog::warn("[buzzer] alert pulse end");
      }
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
    AppLog::warn("[buzzer] test pulse end");
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
  if (ledEnabled_ && ledOn != ledState_) {
    digitalWrite(ledPin_, ledOn ? HIGH : LOW);
    ledState_ = ledOn;
  } else if (!ledEnabled_) {
    ledState_ = false;
  }

  if (buzzerEnabled_ && buzzerOn != buzzerState_) {
    const uint8_t buzzerLevel = buzzerOn
                                    ? (buzzerActiveHigh_ ? HIGH : LOW)
                                    : (buzzerActiveHigh_ ? LOW : HIGH);
    digitalWrite(buzzerPin_, buzzerLevel);
    buzzerState_ = buzzerOn;
  } else if (!buzzerEnabled_) {
    buzzerState_ = false;
  }
}
