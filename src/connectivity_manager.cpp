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
  startMaintenancePortal();
}

void ConnectivityManager::update() {
  if (setupModeStarted_) {
    updatePortalContext();
    return;
  }

  wifiManager_.update();
  mqttClient_.update(wifiManager_.isConnected());

  if (!wifiManager_.isConnected()) {
    state_ = ConnectivityState::WIFI_CONNECTING;
    if (AppConfig::SETUP_PORTAL_ALWAYS_ON) {
      setupReason_ =
          "Wi-Fi station ainda conectando. O AP de manutencao permanece ativo para bancada.";
    }

    if (wifiManager_.attemptsExhausted()) {
      state_ = ConnectivityState::NO_WIFI;
      setupReason_ =
          "Nenhuma rede Wi-Fi salva respondeu nesta inicializacao. O portal esta disponivel para ajuste.";

      if (AppConfig::SETUP_PORTAL_ALWAYS_ON) {
        if (!wifiExhaustedWarningLogged_) {
          AppLog::warn("Wi-Fi esgotou as tentativas, mantendo portal de manutencao sem bloquear o loop normal.");
          wifiExhaustedWarningLogged_ = true;
        }
        updatePortalContext();
        return;
      }

      enterSetupMode("Nenhuma rede Wi-Fi salva respondeu nesta inicializacao. O ESP32 entrou em modo setup automaticamente.");
    }
    updatePortalContext();
    return;
  }

  wifiExhaustedWarningLogged_ = false;

  if (!mqttClient_.hasValidConfiguration()) {
    if (AppConfig::SETUP_PORTAL_ALWAYS_ON) {
      state_ = ConnectivityState::WIFI_OK_MQTT_CONNECTING;
      setupReason_ =
          "O Wi-Fi station conectou, mas a configuracao MQTT ainda precisa de ajuste no portal.";
      updatePortalContext();
      return;
    }

    enterSetupMode("O Wi-Fi conectou, mas a configuracao MQTT nao esta pronta. Corrija o broker no portal.");
    return;
  }

  if (mqttClient_.isConnected()) {
    state_ = ConnectivityState::ONLINE;
    mqttFallbackWarningLogged_ = false;
    setupReason_ =
        AppConfig::SETUP_PORTAL_ALWAYS_ON
            ? "Portal de manutencao ativo. Wi-Fi station e MQTT seguem operando em paralelo."
            : setupReason_;
    updatePortalContext();
    mqttClient_.update(wifiManager_.isConnected());
    return;
  }

  state_ = ConnectivityState::WIFI_OK_MQTT_CONNECTING;
  setupReason_ =
      AppConfig::SETUP_PORTAL_ALWAYS_ON
          ? "Wi-Fi station conectado. MQTT ainda tentando conectar; o portal segue aberto para diagnostico."
          : setupReason_;

  const bool mqttTimedOut =
      mqttClient_.firstFailureAtMs() > 0 &&
      (millis() - mqttClient_.firstFailureAtMs()) >=
          AppConfig::MQTT_SETUP_FALLBACK_TIMEOUT_MS;
  const bool mqttTooManyFailures =
      mqttClient_.consecutiveFailureCount() >=
      AppConfig::MQTT_SETUP_FALLBACK_ATTEMPTS;

  if (mqttTimedOut || mqttTooManyFailures) {
    if (AppConfig::SETUP_PORTAL_ALWAYS_ON) {
      setupReason_ =
          "O Wi-Fi conectou, mas o broker MQTT falhou repetidamente. Ajuste host, porta ou credenciais sem perder o AP de manutencao.";
      if (!mqttFallbackWarningLogged_) {
        AppLog::warn("MQTT falhou repetidamente, mas o portal de manutencao ja esta ativo em paralelo.");
        mqttFallbackWarningLogged_ = true;
      }
      updatePortalContext();
      return;
    }

    enterSetupMode(
        "O Wi-Fi conectou, mas o broker MQTT falhou repetidamente. O portal foi liberado para corrigir host, porta ou credenciais.");
    return;
  }

  updatePortalContext();
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

void ConnectivityManager::startMaintenancePortal() {
  if (!AppConfig::SETUP_PORTAL_ALWAYS_ON || setupPortal_.isRunning()) {
    return;
  }

  maintenancePortalStarted_ = true;
  setupReason_ =
      "Portal de manutencao ativo. O ESP32 continua tentando Wi-Fi/MQTT e publicando telemetria quando conectado.";
  setupPortal_.begin(config_,
                     stateLabel(),
                     setupReason_,
                     wifiManager_.isConnected(),
                     wifiManager_.localIP(),
                     true);
}

void ConnectivityManager::updatePortalContext() {
  if (!setupPortal_.isRunning()) {
    return;
  }

  setupPortal_.syncContext(config_,
                           stateLabel(),
                           setupReason_,
                           wifiManager_.isConnected(),
                           wifiManager_.localIP(),
                           maintenancePortalStarted_ && !setupModeStarted_);
  setupPortal_.update();
  if (setupPortal_.consumeAlertTuningUpdate(config_.alertTuning)) {
    AppLog::infof("[portal] alert tuning applied preset=%s accel=%.2f gyro=%.1f window_ms=%lu cooldown_ms=%lu events=%u buzzer=%u\n",
                  config_.alertTuning.sensitivityPreset.c_str(),
                  config_.alertTuning.accelThresholdG,
                  config_.alertTuning.gyroThresholdDps,
                  config_.alertTuning.analysisWindowMs,
                  config_.alertTuning.cooldownMs,
                  config_.alertTuning.eventsEnabled ? 1U : 0U,
                  config_.alertTuning.buzzerEnabled ? 1U : 0U);
  }
  if (setupPortal_.consumeOperationModeUpdate(config_.operationMode)) {
    AppLog::infof("[portal] operation mode applied mode=%s sample_interval_ms=%lu telemetry_interval_ms=%lu\n",
                  config_.operationMode.c_str(),
                  DeviceSettings::effectiveSensorSampleIntervalMs(config_),
                  DeviceSettings::effectiveTelemetryIntervalMs(config_));
  }
  if (setupPortal_.consumePowerUpdate(config_.power)) {
    AppLog::infof("[portal] battery recalibration applied set=%u percent=%u sequence=%lu\n",
                  config_.power.manualBatteryPercentSet ? 1U : 0U,
                  static_cast<unsigned>(config_.power.manualBatteryPercent),
                  static_cast<unsigned long>(config_.power.manualBatteryCalibrationSequence));
  }
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
                     stationIp,
                     false);
}
