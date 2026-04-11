#include "wifi_manager.h"

#include <time.h>

#include "app_config.h"
#include "app_logging.h"

void WifiManager::begin(const DeviceSettings::DeviceConfig& config) {
  loadProfiles(config);
  hostname_ = DeviceSettings::effectiveDeviceId(config);
  currentProfileIndex_ = -1;
  currentAttemptStartedAtMs_ = 0;
  completedCycles_ = 0;
  attemptsExhausted_ = false;
  ntpConfigured_ = false;

  // O dispositivo opera como cliente da rede local quando esta em modo normal.
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setSleep(false);

  if (!hostname_.isEmpty()) {
    WiFi.setHostname(hostname_.c_str());
  }

  connectNextProfile();
}

void WifiManager::update() {
  if (isConnected()) {
    if (!ntpConfigured_) {
      AppLog::infof("Wi-Fi conectado em %s (%ld dBm).\n",
                    WiFi.SSID().c_str(),
                    WiFi.RSSI());
      // O horario so precisa ser sincronizado quando a conectividade voltar.
      configTime(AppConfig::GMT_OFFSET_SECONDS,
                 AppConfig::DAYLIGHT_OFFSET_SECONDS,
                 AppConfig::NTP_SERVER_PRIMARY,
                 AppConfig::NTP_SERVER_SECONDARY);
      ntpConfigured_ = true;
    }
    return;
  }

  ntpConfigured_ = false;

  if (attemptsExhausted_ || profileCount_ == 0) {
    return;
  }

  if (currentProfileIndex_ < 0) {
    connectNextProfile();
    return;
  }

  const wl_status_t status = WiFi.status();
  const bool immediateFailure =
      status == WL_NO_SSID_AVAIL || status == WL_CONNECT_FAILED;
  const bool timedOut =
      currentAttemptStartedAtMs_ > 0 &&
      (millis() - currentAttemptStartedAtMs_) >=
          AppConfig::WIFI_PROFILE_CONNECT_TIMEOUT_MS;

  if (immediateFailure || timedOut) {
    connectNextProfile();
  }
}

void WifiManager::stop(bool keepConnected) {
  attemptsExhausted_ = false;
  currentProfileIndex_ = -1;
  currentAttemptStartedAtMs_ = 0;
  completedCycles_ = 0;
  ntpConfigured_ = false;

  if (!keepConnected) {
    WiFi.disconnect(false, false);
  }
}

bool WifiManager::isConnected() const {
  return WiFi.status() == WL_CONNECTED;
}

bool WifiManager::hasProfiles() const {
  return profileCount_ > 0;
}

bool WifiManager::attemptsExhausted() const {
  return attemptsExhausted_;
}

long WifiManager::rssi() const {
  return isConnected() ? WiFi.RSSI() : 0L;
}

IPAddress WifiManager::localIP() const {
  return WiFi.localIP();
}

String WifiManager::currentSsid() const {
  if (isConnected()) {
    return WiFi.SSID();
  }

  if (currentProfileIndex_ >= 0 &&
      static_cast<size_t>(currentProfileIndex_) < profileCount_) {
    return profiles_[currentProfileIndex_].ssid;
  }

  return "";
}

void WifiManager::loadProfiles(const DeviceSettings::DeviceConfig& config) {
  profileCount_ = 0;

  for (size_t index = 0; index < config.wifiNetworkCount; ++index) {
    if (profileCount_ >= DeviceSettings::kMaxWifiNetworks) {
      break;
    }

    if (config.wifiNetworks[index].ssid.isEmpty()) {
      continue;
    }

    profiles_[profileCount_] = config.wifiNetworks[index];
    ++profileCount_;
  }
}

void WifiManager::connectNextProfile() {
  if (profileCount_ == 0) {
    attemptsExhausted_ = true;
    return;
  }

  int nextIndex = currentProfileIndex_ + 1;
  if (nextIndex >= static_cast<int>(profileCount_)) {
    ++completedCycles_;
    if (completedCycles_ >= AppConfig::WIFI_FULL_CYCLES_BEFORE_SETUP) {
      attemptsExhausted_ = true;
      currentProfileIndex_ = -1;
      return;
    }

    nextIndex = 0;
  }

  currentProfileIndex_ = nextIndex;
  currentAttemptStartedAtMs_ = millis();

  WiFi.disconnect(false, false);
  delay(150);

  const DeviceSettings::WifiNetworkConfig& network =
      profiles_[static_cast<size_t>(currentProfileIndex_)];

  if (AppConfig::FIRMWARE_CONNECTIVITY_DEBUG_ENABLED) {
    AppLog::debugf("Tentando conectar ao Wi-Fi %s (%u/%u).\n",
                   network.ssid.c_str(),
                   static_cast<unsigned>(currentProfileIndex_ + 1),
                   static_cast<unsigned>(profileCount_));
  }

  // Permite trabalhar tanto com rede aberta quanto com rede protegida.
  if (!network.password.isEmpty()) {
    WiFi.begin(network.ssid.c_str(), network.password.c_str());
  } else {
    WiFi.begin(network.ssid.c_str());
  }
}
