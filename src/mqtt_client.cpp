#include "mqtt_client.h"

#include <Arduino.h>

#include "app_config.h"
#include "app_logging.h"

String DeviceMqttClient::describeStateCode(int stateCode) {
  switch (stateCode) {
    case MQTT_CONNECTED:
      return "Broker respondeu normalmente.";
    case MQTT_CONNECTION_TIMEOUT:
      return "Timeout ao conectar no broker MQTT.";
    case MQTT_CONNECTION_LOST:
      return "Conexao MQTT perdida apos conectar.";
    case MQTT_CONNECT_FAILED:
      return "Nao foi possivel abrir conexao TCP com o broker MQTT.";
    case MQTT_DISCONNECTED:
      return "Cliente MQTT desconectado.";
    case MQTT_CONNECT_BAD_PROTOCOL:
      return "Broker recusou a versao/protocolo MQTT desta build.";
    case MQTT_CONNECT_BAD_CLIENT_ID:
      return "Broker recusou o client ID configurado.";
    case MQTT_CONNECT_UNAVAILABLE:
      return "Broker MQTT indisponivel no momento.";
    case MQTT_CONNECT_BAD_CREDENTIALS:
      return "Broker rejeitou usuario ou senha MQTT.";
    case MQTT_CONNECT_UNAUTHORIZED:
      return "Broker recusou a conexao por autorizacao/permissao.";
    default:
      return String("Falha MQTT com codigo ") + stateCode + ".";
  }
}

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

int DeviceMqttClient::lastFailureCode() const {
  return lastFailureCode_;
}

String DeviceMqttClient::lastFailureReason() const {
  return describeStateCode(lastFailureCode_);
}

unsigned long DeviceMqttClient::lastSuccessfulConnectAtMs() const {
  return lastSuccessfulConnectAtMs_;
}

MqttConnectionProbeResult DeviceMqttClient::probeConnection(
    const DeviceSettings::DeviceConfig& config) const {
  MqttConnectionProbeResult result;

  if (WiFi.status() != WL_CONNECTED) {
    result.message = "Wi-Fi desconectado. Conecte o ESP32 a uma rede antes de testar o MQTT.";
    return result;
  }

  if (!DeviceSettings::hasValidMqttConfig(config)) {
    result.message = "Configuracao MQTT invalida. Revise host, porta e client ID antes de testar.";
    return result;
  }

  const String probeHost = config.mqtt.host;
  const uint16_t probePort = config.mqtt.port;
  const String probeClientId = DeviceSettings::effectiveMqttClientId(config) + "_probe";

  if (config.mqtt.useTls) {
    WiFiClientSecure secureClient;
    if (!config.mqtt.tlsCaCertificate.isEmpty()) {
      secureClient.setCACert(config.mqtt.tlsCaCertificate.c_str());
    } else if (config.mqtt.tlsInsecure) {
      secureClient.setInsecure();
    }

    PubSubClient probeClient(secureClient);
    probeClient.setBufferSize(256);
    probeClient.setServer(probeHost.c_str(), probePort);

    const bool connected = !config.mqtt.username.isEmpty()
                               ? probeClient.connect(probeClientId.c_str(),
                                                     config.mqtt.username.c_str(),
                                                     config.mqtt.password.c_str())
                               : probeClient.connect(probeClientId.c_str());

    result.success = connected;
    result.stateCode = connected ? MQTT_CONNECTED : probeClient.state();
    result.message = connected
                         ? String("Broker MQTT respondeu em ") + probeHost + ":" + probePort + "."
                         : describeStateCode(result.stateCode);

    if (connected) {
      probeClient.disconnect();
    }
    return result;
  }

  WiFiClient wifiClient;
  PubSubClient probeClient(wifiClient);
  probeClient.setBufferSize(256);
  probeClient.setServer(probeHost.c_str(), probePort);

  const bool connected = !config.mqtt.username.isEmpty()
                             ? probeClient.connect(probeClientId.c_str(),
                                                   config.mqtt.username.c_str(),
                                                   config.mqtt.password.c_str())
                             : probeClient.connect(probeClientId.c_str());

  result.success = connected;
  result.stateCode = connected ? MQTT_CONNECTED : probeClient.state();
  result.message = connected
                       ? String("Broker MQTT respondeu em ") + probeHost + ":" + probePort + "."
                       : describeStateCode(result.stateCode);

  if (connected) {
    probeClient.disconnect();
  }

  return result;
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
    lastSuccessfulConnectAtMs_ = millis();
    lastFailureCode_ = MQTT_CONNECTED;
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

  lastFailureCode_ = client_.state();

  if (AppConfig::FIRMWARE_CONNECTIVITY_DEBUG_ENABLED &&
      (consecutiveFailureCount_ == 1U || consecutiveFailureCount_ % 3U == 0U)) {
    AppLog::debugf("MQTT segue desconectado. Tentativas falhas: %u | motivo: %s\n",
                   consecutiveFailureCount_,
                   describeStateCode(lastFailureCode_).c_str());
  }

  return false;
}

void DeviceMqttClient::resetFailureTracking() {
  firstFailureAtMs_ = 0;
  consecutiveFailureCount_ = 0;
}
