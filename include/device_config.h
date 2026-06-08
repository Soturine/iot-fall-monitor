#pragma once

#include <Arduino.h>

#include "app_config.h"

namespace DeviceSettings {

constexpr size_t kMaxWifiNetworks = AppConfig::MAX_WIFI_NETWORKS;

struct WifiNetworkConfig {
  String ssid;
  String password;
};

struct MqttConfig {
  String host;
  uint16_t port = AppConfig::DEFAULT_MQTT_PORT;
  String username;
  String password;
  String clientId;
  String backendApiBaseUrl;
  bool useTls = AppConfig::DEFAULT_MQTT_USE_TLS;
  bool tlsInsecure = AppConfig::DEFAULT_MQTT_TLS_INSECURE;
  String tlsCaCertificate;
};

struct PatientProfileSummary {
  String patientName;
  bool hasWeightKg = false;
  float weightKg = 0.0f;
  bool hasHeightCm = false;
  float heightCm = 0.0f;
  String fallSensitivityPreset;
  String syncedAt;
};

struct AlertTuningConfig {
  String sensitivityPreset;
  float accelThresholdG = AppConfig::ALERT_NORMAL_ACCEL_THRESHOLD_G;
  float gyroThresholdDps = AppConfig::ALERT_NORMAL_GYRO_THRESHOLD_DPS;
  unsigned long analysisWindowMs = AppConfig::ALERT_NORMAL_ANALYSIS_WINDOW_MS;
  unsigned long cooldownMs = AppConfig::ALERT_NORMAL_COOLDOWN_MS;
  bool buzzerEnabled = AppConfig::ALERT_BUZZER_ENABLED_DEFAULT;
  bool eventsEnabled = AppConfig::ALERT_EVENT_PUBLICATION_ENABLED_DEFAULT;
};

struct PowerConfig {
  bool manualBatteryPercentSet = false;
  uint8_t manualBatteryPercent = 0;
};

struct DeviceConfig {
  bool loadedFromNvs = false;
  String deviceId;
  MqttConfig mqtt;
  String deviceSyncToken;
  PatientProfileSummary patientProfile;
  AlertTuningConfig alertTuning;
  PowerConfig power;
  WifiNetworkConfig wifiNetworks[kMaxWifiNetworks];
  size_t wifiNetworkCount = 0;
};

DeviceConfig makeDefaultConfig();

bool hasWifiNetworks(const DeviceConfig& config);
bool hasValidMqttConfig(const DeviceConfig& config);
bool hasValidBackendApiBaseUrl(const DeviceConfig& config);
bool hasValidRuntimeConfig(const DeviceConfig& config);
bool hasDeviceSyncToken(const DeviceConfig& config);
bool isPlaceholderValue(const String& value);
bool isLoopbackHost(const String& value);

String effectiveDeviceId(const DeviceConfig& config);
String effectiveMqttClientId(const DeviceConfig& config);
String effectiveBackendApiBaseUrl(const DeviceConfig& config);
String technicalDeviceUid();
String buildTopic(const DeviceConfig& config, const char* channel);
String buildSetupApSsid(const DeviceConfig& config);

void clearPatientProfile(DeviceConfig& config);
bool patientProfileEquals(const PatientProfileSummary& left,
                          const PatientProfileSummary& right);
void applyAlertSensitivityPreset(AlertTuningConfig& alertTuning, const String& preset);
String normalizeAlertSensitivityPreset(const String& preset);
float clampAlertAccelThreshold(float value);
float clampAlertGyroThreshold(float value);
unsigned long clampAlertAnalysisWindowMs(unsigned long value);
unsigned long clampAlertCooldownMs(unsigned long value);
uint8_t clampBatteryPercent(long value);

bool upsertWifiNetwork(DeviceConfig& config,
                       const String& ssid,
                       const String& password,
                       bool preferred,
                       String* errorMessage = nullptr);
bool removeWifiNetworkAt(DeviceConfig& config, size_t index);

}  // namespace DeviceSettings
