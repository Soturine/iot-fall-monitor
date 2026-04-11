#pragma once

#include <Arduino.h>

#include "config_store.h"
#include "device_config.h"
#include "mqtt_client.h"
#include "setup_portal.h"
#include "wifi_manager.h"

enum class ConnectivityState {
  NO_WIFI,
  WIFI_CONNECTING,
  WIFI_OK_MQTT_CONNECTING,
  ONLINE,
  SETUP_MODE
};

class ConnectivityManager {
 public:
  ConnectivityManager(ConfigStore& configStore,
                      WifiManager& wifiManager,
                      DeviceMqttClient& mqttClient,
                      SetupPortal& setupPortal);

  void begin();
  void update();

  ConnectivityState state() const;
  bool isWifiConnected() const;
  bool isOnline() const;
  bool isSetupMode() const;
  long wifiRssi() const;
  IPAddress localIP() const;
  String currentSsid() const;
  String stateLabel() const;
  const String& setupReason() const;
  const DeviceSettings::DeviceConfig& config() const;
  DeviceSettings::DeviceConfig& mutableConfig();
  bool persistConfig();

 private:
  void loadConfig();
  void enterSetupMode(const String& reason);

  ConfigStore& configStore_;
  WifiManager& wifiManager_;
  DeviceMqttClient& mqttClient_;
  SetupPortal& setupPortal_;

  DeviceSettings::DeviceConfig config_;
  ConnectivityState state_ = ConnectivityState::NO_WIFI;
  String setupReason_;
  bool setupModeStarted_ = false;
};
