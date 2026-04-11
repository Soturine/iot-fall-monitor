#pragma once

#include <WiFi.h>

#include "device_config.h"

class WifiManager {
 public:
  void begin(const DeviceSettings::DeviceConfig& config);
  void update();
  void stop(bool keepConnected = false);

  bool isConnected() const;
  bool hasProfiles() const;
  bool attemptsExhausted() const;
  long rssi() const;
  IPAddress localIP() const;
  String currentSsid() const;

 private:
  void loadProfiles(const DeviceSettings::DeviceConfig& config);
  void connectNextProfile();

  DeviceSettings::WifiNetworkConfig profiles_[DeviceSettings::kMaxWifiNetworks];
  size_t profileCount_ = 0;
  int currentProfileIndex_ = -1;
  String hostname_;

  unsigned long currentAttemptStartedAtMs_ = 0;
  unsigned long completedCycles_ = 0;
  bool attemptsExhausted_ = false;
  bool ntpConfigured_ = false;
};
