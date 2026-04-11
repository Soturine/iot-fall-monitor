#include "connectivity_manager.h"

#include "app_logging.h"

ConnectivityManager::ConnectivityManager(ConfigStore& configStore,
                                         WifiManager& wifiManager,
                                         DeviceMqttClient& mqttClient,
                                         SetupPortal& setupPortal)
    : configStore_(configStore),
      wifiManager_(wifiManager),
      mqttClient_(mqttClient),
      setupPortal_(setupPortal) {}

void ConnectivityManager::begin() {
  loadConfig();
  mqttClient_.begin();
  mqttClient_.configure(config_);

  if (AppConfig::FORCE_SETUP_MODE_ON_BOOT) {
    enterSetupMode("FORCE_SETUP_MODE_ON_BOOT foi habilitado em app_config.h para teste de bancada do portal local.");
    return;
  }

  if (!DeviceSettings::hasWifiNetworks(config_)) {
    enterSetupMode("Nenhuma rede Wi-Fi valida foi encontrada. Adicione ao menos uma rede para o ESP32 operar.");
    return;
  }

  if (!DeviceSettings::hasValidMqttConfig(config_)) {
    enterSetupMode("A configuracao MQTT esta incompleta, invalida ou aponta para loopback. Revise o broker antes de continuar.");
    return;
  }

  wifiManager_.begin(config_);
  state_ = ConnectivityState::WIFI_CONNECTING;
}

void ConnectivityManager::update() {
  if (setupModeStarted_) {
    setupPortal_.update();
    return;
  }

  wifiManager_.update();
  mqttClient_.update(wifiManager_.isConnected());

  if (!wifiManager_.isConnected()) {
    state_ = ConnectivityState::WIFI_CONNECTING;

    if (wifiManager_.attemptsExhausted()) {
      state_ = ConnectivityState::NO_WIFI;
      enterSetupMode("Nenhuma rede Wi-Fi salva respondeu nesta inicializacao. O ESP32 entrou em modo setup automaticamente.");
    }
    return;
  }

  if (!mqttClient_.hasValidConfiguration()) {
    enterSetupMode("O Wi-Fi conectou, mas a configuracao MQTT nao esta pronta. Corrija o broker no portal.");
    return;
  }

  if (mqttClient_.isConnected()) {
    state_ = ConnectivityState::ONLINE;
    return;
  }

  state_ = ConnectivityState::WIFI_OK_MQTT_CONNECTING;

  const bool mqttTimedOut =
      mqttClient_.firstFailureAtMs() > 0 &&
      (millis() - mqttClient_.firstFailureAtMs()) >=
          AppConfig::MQTT_SETUP_FALLBACK_TIMEOUT_MS;
  const bool mqttTooManyFailures =
      mqttClient_.consecutiveFailureCount() >=
      AppConfig::MQTT_SETUP_FALLBACK_ATTEMPTS;

  if (mqttTimedOut || mqttTooManyFailures) {
    enterSetupMode(
        "O Wi-Fi conectou, mas o broker MQTT falhou repetidamente. O portal foi liberado para corrigir host, porta ou credenciais.");
  }
}

ConnectivityState ConnectivityManager::state() const {
  return state_;
}

bool ConnectivityManager::isWifiConnected() const {
  return wifiManager_.isConnected();
}

bool ConnectivityManager::isOnline() const {
  return state_ == ConnectivityState::ONLINE;
}

bool ConnectivityManager::isSetupMode() const {
  return state_ == ConnectivityState::SETUP_MODE;
}

long ConnectivityManager::wifiRssi() const {
  return wifiManager_.rssi();
}

IPAddress ConnectivityManager::localIP() const {
  return wifiManager_.localIP();
}

String ConnectivityManager::currentSsid() const {
  return wifiManager_.currentSsid();
}

String ConnectivityManager::stateLabel() const {
  switch (state_) {
    case ConnectivityState::NO_WIFI:
      return "NO_WIFI";
    case ConnectivityState::WIFI_CONNECTING:
      return "WIFI_CONNECTING";
    case ConnectivityState::WIFI_OK_MQTT_CONNECTING:
      return "WIFI_OK_MQTT_CONNECTING";
    case ConnectivityState::ONLINE:
      return "ONLINE";
    case ConnectivityState::SETUP_MODE:
      return "SETUP_MODE";
  }

  return "UNKNOWN";
}

const String& ConnectivityManager::setupReason() const {
  return setupReason_;
}

const DeviceSettings::DeviceConfig& ConnectivityManager::config() const {
  return config_;
}

DeviceSettings::DeviceConfig& ConnectivityManager::mutableConfig() {
  return config_;
}

bool ConnectivityManager::persistConfig() {
  return configStore_.save(config_);
}

void ConnectivityManager::loadConfig() {
  config_ = configStore_.load();

  if (config_.loadedFromNvs) {
    AppLog::info("Configuracao carregada da NVS.");
    return;
  }

  AppLog::warn("Usando defaults de fabrica porque nao havia configuracao persistida na NVS.");
}

void ConnectivityManager::enterSetupMode(const String& reason) {
  const bool stationConnected = wifiManager_.isConnected();
  const IPAddress stationIp = wifiManager_.localIP();

  setupReason_ = reason;
  state_ = ConnectivityState::SETUP_MODE;
  setupModeStarted_ = true;

  AppLog::warnf("Entrando em SETUP_MODE. Motivo: %s\n", setupReason_.c_str());

  mqttClient_.disconnect();
  wifiManager_.stop(stationConnected);
  setupPortal_.begin(config_,
                     stateLabel(),
                     setupReason_,
                     stationConnected,
                     stationIp);
}
