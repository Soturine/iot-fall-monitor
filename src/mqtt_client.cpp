#include "mqtt_client.h"

#include <Arduino.h>

#include "app_config.h"
#include "app_logging.h"

void DeviceMqttClient::begin() {
  // Buffer suficiente para os payloads JSON atuais sem gastar RAM em excesso.
  configureTransport();
  client_.setBufferSize(512);
}

void DeviceMqttClient::configure(const DeviceSettings::DeviceConfig& config) {
  host_ = config.mqtt.host;
  port_ = config.mqtt.port;
  username_ = config.mqtt.username;
  password_ = config.mqtt.password;
  clientId_ = DeviceSettings::effectiveMqttClientId(config);
  useTls_ = config.mqtt.useTls;
  tlsInsecure_ = config.mqtt.tlsInsecure;
  tlsCaCertificate_ = config.mqtt.tlsCaCertificate;
  configureTransport();
  client_.setBufferSize(512);
  client_.setServer(host_.c_str(), port_);
  resetFailureTracking();

  if (useTls_ && tlsCaCertificate_.isEmpty() && !tlsInsecure_) {
    AppLog::warn(
        "MQTT/TLS habilitado sem CA customizada. Confirme se o broker usa um certificado confiavel para esta build.");
  }
}

void DeviceMqttClient::disconnect() {
  client_.disconnect();
  resetFailureTracking();
}

void DeviceMqttClient::update(bool wifiConnected) {
  if (!wifiConnected) {
    client_.disconnect();
    resetFailureTracking();
    return;
  }

  if (client_.connected()) {
    // O loop interno do cliente cuida de keepalive e ACKs MQTT.
    client_.loop();
    return;
  }

  if ((millis() - lastReconnectAttemptMs_) >= AppConfig::MQTT_RECONNECT_INTERVAL_MS) {
    reconnect();
  }
}

bool DeviceMqttClient::publish(const String& topic, const String& payload, bool retained) {
  if (!client_.connected()) {
    return false;
  }

  return client_.publish(topic.c_str(), payload.c_str(), retained);
}

bool DeviceMqttClient::isConnected() {
  return client_.connected();
}

bool DeviceMqttClient::hasValidConfiguration() const {
  return !host_.isEmpty() && port_ > 0U && !clientId_.isEmpty();
}

uint8_t DeviceMqttClient::consecutiveFailureCount() const {
  return consecutiveFailureCount_;
}

unsigned long DeviceMqttClient::firstFailureAtMs() const {
  return firstFailureAtMs_;
}

bool DeviceMqttClient::usingTls() const {
  return useTls_;
}

void DeviceMqttClient::configureTransport() {
  if (useTls_) {
    secureClient_ = WiFiClientSecure();
    if (!tlsCaCertificate_.isEmpty()) {
      secureClient_.setCACert(tlsCaCertificate_.c_str());
    } else if (tlsInsecure_) {
      secureClient_.setInsecure();
    }
    client_.setClient(secureClient_);
    return;
  }

  client_.setClient(wifiClient_);
}

bool DeviceMqttClient::reconnect() {
  lastReconnectAttemptMs_ = millis();

  if (!hasValidConfiguration()) {
    return false;
  }

  bool connected = false;

  if (!username_.isEmpty()) {
    // Se usuario estiver vazio, o cliente conecta sem autenticacao.
    connected =
        client_.connect(clientId_.c_str(), username_.c_str(), password_.c_str());
  } else {
    connected = client_.connect(clientId_.c_str());
  }

  if (connected) {
    resetFailureTracking();
    AppLog::infof("MQTT conectado em %s:%u (%s).\n",
                  host_.c_str(),
                  port_,
                  useTls_ ? "TLS" : "sem TLS");
    return true;
  }

  if (firstFailureAtMs_ == 0U) {
    firstFailureAtMs_ = millis();
    AppLog::warnf("Falha inicial ao conectar no broker MQTT %s:%u.\n",
                  host_.c_str(),
                  port_);
  }
  if (consecutiveFailureCount_ < 255U) {
    ++consecutiveFailureCount_;
  }

  if (AppConfig::FIRMWARE_CONNECTIVITY_DEBUG_ENABLED &&
      (consecutiveFailureCount_ == 1U || consecutiveFailureCount_ % 3U == 0U)) {
    AppLog::debugf("MQTT segue desconectado. Tentativas falhas: %u\n",
                   consecutiveFailureCount_);
  }

  return false;
}

void DeviceMqttClient::resetFailureTracking() {
  firstFailureAtMs_ = 0;
  consecutiveFailureCount_ = 0;
}
