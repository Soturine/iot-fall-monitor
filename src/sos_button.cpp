#include "sos_button.h"

void SosButton::begin(uint8_t pin, bool activeLow, unsigned long holdTimeMs) {
  pin_ = pin;
  activeLow_ = activeLow;
  holdTimeMs_ = holdTimeMs;
  configured_ = true;

  pinMode(pin_, activeLow_ ? INPUT_PULLUP : INPUT);
}

void SosButton::update() {
  if (!configured_) {
    return;
  }

  const unsigned long nowMs = millis();
  const bool rawPressed = activeLow_ ? (digitalRead(pin_) == LOW) : (digitalRead(pin_) == HIGH);

  if (rawPressed != lastRawPressed_) {
    // Reinicia a janela de debounce sempre que a leitura crua oscila.
    lastRawPressed_ = rawPressed;
    lastDebounceAtMs_ = nowMs;
  }

  if ((nowMs - lastDebounceAtMs_) < 40U) {
    return;
  }

  if (rawPressed != stablePressed_) {
    stablePressed_ = rawPressed;

    if (stablePressed_) {
      // O evento so sera confirmado se o botao continuar pressionado por holdTimeMs_.
      pressStartedAtMs_ = nowMs;
    } else {
      pressStartedAtMs_ = 0U;
    }
  }

  if (stablePressed_ && pressStartedAtMs_ > 0U &&
      (nowMs - pressStartedAtMs_) >= holdTimeMs_) {
    // Zera pressStartedAtMs_ para gerar apenas um evento por pressionamento.
    eventPending_ = true;
    pressStartedAtMs_ = 0U;
  }
}

bool SosButton::consumePressedEvent() {
  // O loop principal consome o evento e evita disparo repetido.
  const bool wasPending = eventPending_;
  eventPending_ = false;
  return wasPending;
}
