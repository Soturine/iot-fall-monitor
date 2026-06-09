#include "device_config.h"

#include <cmath>

namespace {

String trimValue(const String& value) {
  String trimmed = value;
  trimmed.trim();
  return trimmed;
}

String normalizeIdentifier(const String& value, const char* fallback) {
  String normalized = trimValue(value);
  if (normalized.isEmpty()) {
    normalized = fallback;
  }

  normalized.replace(" ", "_");
  normalized.replace("/", "_");
  normalized.replace("\\", "_");

  return normalized;
}

String normalizeBaseUrl(const String& value) {
  String normalized = trimValue(value);
  const int schemeIndex = normalized.indexOf("://");
  if (schemeIndex > 0) {
    String scheme = normalized.substring(0, schemeIndex);
    scheme.toLowerCase();
    normalized = scheme + normalized.substring(schemeIndex);
  }
  while (normalized.endsWith("/")) {
    normalized.remove(normalized.length() - 1);
  }
  return normalized;
}

String extractHostFromUrl(const String& url) {
  String normalized = normalizeBaseUrl(url);
  const int schemeIndex = normalized.indexOf("://");
  if (schemeIndex < 0) {
    return "";
  }

  String remainder = normalized.substring(schemeIndex + 3);
  const int slashIndex = remainder.indexOf('/');
  if (slashIndex >= 0) {
    remainder = remainder.substring(0, slashIndex);
  }

  const int atIndex = remainder.lastIndexOf('@');
  if (atIndex >= 0) {
    remainder = remainder.substring(atIndex + 1);
  }

  const int colonIndex = remainder.indexOf(':');
  if (colonIndex >= 0) {
    remainder = remainder.substring(0, colonIndex);
  }

  return trimValue(remainder);
}

void setErrorMessage(String* errorMessage, const String& message) {
  if (errorMessage != nullptr) {
    *errorMessage = message;
  }
}

float clampFloat(float value, float minimum, float maximum, float fallback) {
  if (!std::isfinite(value)) {
    return fallback;
  }

  if (value < minimum) {
    return minimum;
  }

  if (value > maximum) {
    return maximum;
  }

  return value;
}

unsigned long clampUnsignedLong(unsigned long value,
                                unsigned long minimum,
                                unsigned long maximum,
                                unsigned long fallback) {
  if (value == 0U) {
    return fallback;
  }

  if (value < minimum) {
    return minimum;
  }

  if (value > maximum) {
    return maximum;
  }

  return value;
}

}  // namespace

namespace DeviceSettings {

DeviceConfig makeDefaultConfig() {
  DeviceConfig config;
  config.loadedFromNvs = false;
  config.operationMode = AppConfig::OPERATION_MODE_DEMO;
  config.deviceId = AppConfig::DEFAULT_DEVICE_ID;
  config.mqtt.host = AppConfig::DEFAULT_MQTT_HOST;
  config.mqtt.port = AppConfig::DEFAULT_MQTT_PORT;
  config.mqtt.username = AppConfig::DEFAULT_MQTT_USERNAME;
  config.mqtt.password = AppConfig::DEFAULT_MQTT_PASSWORD;
  config.mqtt.clientId = AppConfig::DEFAULT_MQTT_CLIENT_ID;
  config.mqtt.backendApiBaseUrl = AppConfig::DEFAULT_BACKEND_API_BASE_URL;
  config.mqtt.useTls = AppConfig::DEFAULT_MQTT_USE_TLS;
  config.mqtt.tlsInsecure = AppConfig::DEFAULT_MQTT_TLS_INSECURE;
  config.mqtt.tlsCaCertificate = AppConfig::DEFAULT_MQTT_TLS_CA_CERT;
  applyAlertSensitivityPreset(config.alertTuning, AppConfig::ALERT_SENSITIVITY_DEMO);
  config.alertTuning.buzzerEnabled = AppConfig::ALERT_BUZZER_ENABLED_DEFAULT;
  config.alertTuning.eventsEnabled = AppConfig::ALERT_EVENT_PUBLICATION_ENABLED_DEFAULT;

  const String defaultSsid = trimValue(AppConfig::DEFAULT_WIFI_SSID);
  if (!defaultSsid.isEmpty() && !isPlaceholderValue(defaultSsid)) {
    config.wifiNetworks[0].ssid = defaultSsid;
    config.wifiNetworks[0].password = AppConfig::DEFAULT_WIFI_PASSWORD;
    config.wifiNetworkCount = 1;
  }

  return config;
}

bool hasWifiNetworks(const DeviceConfig& config) {
  return config.wifiNetworkCount > 0 &&
         !trimValue(config.wifiNetworks[0].ssid).isEmpty();
}

bool hasValidMqttConfig(const DeviceConfig& config) {
  const String host = trimValue(config.mqtt.host);
  if (host.isEmpty() || isPlaceholderValue(host) || isLoopbackHost(host)) {
    return false;
  }

  if (config.mqtt.port == 0U) {
    return false;
  }

  return true;
}

bool hasValidBackendApiBaseUrl(const DeviceConfig& config) {
  const String baseUrl = normalizeBaseUrl(config.mqtt.backendApiBaseUrl);
  if (baseUrl.isEmpty()) {
    return false;
  }

  const bool validScheme =
      baseUrl.startsWith("http://") || baseUrl.startsWith("https://");
  if (!validScheme) {
    return false;
  }

  const String host = extractHostFromUrl(baseUrl);
  if (host.isEmpty() || isLoopbackHost(host)) {
    return false;
  }

  return true;
}

bool hasValidRuntimeConfig(const DeviceConfig& config) {
  return hasWifiNetworks(config) && hasValidMqttConfig(config);
}

bool hasDeviceSyncToken(const DeviceConfig& config) {
  return !trimValue(config.deviceSyncToken).isEmpty();
}

bool isPlaceholderValue(const String& value) {
  const String trimmed = trimValue(value);
  if (trimmed.isEmpty()) {
    return true;
  }

  const String lowered = String(trimmed);
  String normalized = lowered;
  normalized.toLowerCase();

  return normalized == "your_wifi_ssid" || normalized == "your_wifi_password" ||
         normalized == "your_mqtt_host" || normalized == "change-me";
}

bool isLoopbackHost(const String& value) {
  String normalized = trimValue(value);
  normalized.toLowerCase();

  return normalized == "localhost" || normalized == "127.0.0.1" ||
         normalized == "::1";
}

String effectiveDeviceId(const DeviceConfig& config) {
  return normalizeIdentifier(config.deviceId, AppConfig::DEFAULT_DEVICE_ID);
}

String effectiveMqttClientId(const DeviceConfig& config) {
  const String fallbackClientId = effectiveDeviceId(config) + "_client";
  return normalizeIdentifier(config.mqtt.clientId, fallbackClientId.c_str());
}

String effectiveBackendApiBaseUrl(const DeviceConfig& config) {
  return normalizeBaseUrl(config.mqtt.backendApiBaseUrl);
}

String technicalDeviceUid() {
  const uint64_t chipId = ESP.getEfuseMac();
  char buffer[24] = {0};
  snprintf(buffer,
           sizeof(buffer),
           "esp32-%012llX",
           static_cast<unsigned long long>(chipId & 0xFFFFFFFFFFFFULL));
  return String(buffer);
}

String buildTopic(const DeviceConfig& config, const char* channel) {
  String topic = AppConfig::DEFAULT_MQTT_TOPIC_BASE;
  topic += "/";
  topic += effectiveDeviceId(config);
  topic += "/";
  topic += channel;
  return topic;
}

String buildSetupApSsid(const DeviceConfig& config) {
  const uint64_t chipId = ESP.getEfuseMac();
  char suffix[7] = {0};
  snprintf(suffix, sizeof(suffix), "%06llX",
           static_cast<unsigned long long>(chipId & 0xFFFFFFULL));

  String ssid = AppConfig::SETUP_AP_SSID_PREFIX;
  ssid += "-";
  ssid += suffix;

  return ssid;
}

void clearPatientProfile(DeviceConfig& config) {
  config.patientProfile = PatientProfileSummary{};
}

bool patientProfileEquals(const PatientProfileSummary& left,
                          const PatientProfileSummary& right) {
  return left.patientName == right.patientName &&
         left.hasWeightKg == right.hasWeightKg &&
         (!left.hasWeightKg || fabsf(left.weightKg - right.weightKg) < 0.01f) &&
         left.hasHeightCm == right.hasHeightCm &&
         (!left.hasHeightCm || fabsf(left.heightCm - right.heightCm) < 0.01f) &&
         left.fallSensitivityPreset == right.fallSensitivityPreset &&
         left.syncedAt == right.syncedAt;
}

String normalizeAlertSensitivityPreset(const String& preset) {
  String normalized = trimValue(preset);
  normalized.toLowerCase();

  if (normalized == AppConfig::ALERT_SENSITIVITY_LOW ||
      normalized == AppConfig::ALERT_SENSITIVITY_HIGH ||
      normalized == AppConfig::ALERT_SENSITIVITY_DEMO) {
    return normalized;
  }

  return AppConfig::ALERT_SENSITIVITY_NORMAL;
}

float clampAlertAccelThreshold(float value) {
  return clampFloat(value,
                    AppConfig::ALERT_MIN_ACCEL_THRESHOLD_G,
                    AppConfig::ALERT_MAX_ACCEL_THRESHOLD_G,
                    AppConfig::ALERT_NORMAL_ACCEL_THRESHOLD_G);
}

float clampAlertGyroThreshold(float value) {
  return clampFloat(value,
                    AppConfig::ALERT_MIN_GYRO_THRESHOLD_DPS,
                    AppConfig::ALERT_MAX_GYRO_THRESHOLD_DPS,
                    AppConfig::ALERT_NORMAL_GYRO_THRESHOLD_DPS);
}

unsigned long clampAlertAnalysisWindowMs(unsigned long value) {
  return clampUnsignedLong(value,
                           AppConfig::ALERT_MIN_ANALYSIS_WINDOW_MS,
                           AppConfig::ALERT_MAX_ANALYSIS_WINDOW_MS,
                           AppConfig::ALERT_NORMAL_ANALYSIS_WINDOW_MS);
}

unsigned long clampAlertCooldownMs(unsigned long value) {
  return clampUnsignedLong(value,
                           AppConfig::ALERT_MIN_COOLDOWN_MS,
                           AppConfig::ALERT_MAX_COOLDOWN_MS,
                           AppConfig::ALERT_NORMAL_COOLDOWN_MS);
}

uint8_t clampBatteryPercent(long value) {
  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return static_cast<uint8_t>(value);
}

String normalizeOperationMode(const String& mode) {
  String normalized = trimValue(mode);
  normalized.toLowerCase();
  return normalized == AppConfig::OPERATION_MODE_DEMO
             ? AppConfig::OPERATION_MODE_DEMO
             : AppConfig::OPERATION_MODE_NORMAL;
}

bool isDemoOperationMode(const DeviceConfig& config) {
  return normalizeOperationMode(config.operationMode) == AppConfig::OPERATION_MODE_DEMO;
}

unsigned long effectiveSensorSampleIntervalMs(const DeviceConfig& config) {
  return isDemoOperationMode(config)
             ? AppConfig::SENSOR_DEMO_SAMPLE_INTERVAL_MS
             : AppConfig::SENSOR_NORMAL_SAMPLE_INTERVAL_MS;
}

unsigned long effectiveTelemetryIntervalMs(const DeviceConfig& config) {
  return isDemoOperationMode(config)
             ? AppConfig::TELEMETRY_DEMO_REPORT_INTERVAL_MS
             : AppConfig::TELEMETRY_NORMAL_REPORT_INTERVAL_MS;
}

void applyAlertSensitivityPreset(AlertTuningConfig& alertTuning, const String& preset) {
  const String normalized = normalizeAlertSensitivityPreset(preset);
  alertTuning.sensitivityPreset = normalized;

  if (normalized == AppConfig::ALERT_SENSITIVITY_LOW) {
    alertTuning.accelThresholdG = AppConfig::ALERT_LOW_ACCEL_THRESHOLD_G;
    alertTuning.gyroThresholdDps = AppConfig::ALERT_LOW_GYRO_THRESHOLD_DPS;
    alertTuning.analysisWindowMs = AppConfig::ALERT_NORMAL_ANALYSIS_WINDOW_MS;
    alertTuning.cooldownMs = AppConfig::ALERT_NORMAL_COOLDOWN_MS;
    return;
  }

  if (normalized == AppConfig::ALERT_SENSITIVITY_HIGH) {
    alertTuning.accelThresholdG = AppConfig::ALERT_HIGH_ACCEL_THRESHOLD_G;
    alertTuning.gyroThresholdDps = AppConfig::ALERT_HIGH_GYRO_THRESHOLD_DPS;
    alertTuning.analysisWindowMs = AppConfig::ALERT_NORMAL_ANALYSIS_WINDOW_MS;
    alertTuning.cooldownMs = AppConfig::ALERT_NORMAL_COOLDOWN_MS;
    return;
  }

  if (normalized == AppConfig::ALERT_SENSITIVITY_DEMO) {
    alertTuning.accelThresholdG = AppConfig::ALERT_DEMO_ACCEL_THRESHOLD_G;
    alertTuning.gyroThresholdDps = AppConfig::ALERT_DEMO_GYRO_THRESHOLD_DPS;
    alertTuning.analysisWindowMs = AppConfig::ALERT_DEMO_ANALYSIS_WINDOW_MS;
    alertTuning.cooldownMs = AppConfig::ALERT_DEMO_COOLDOWN_MS;
    return;
  }

  alertTuning.accelThresholdG = AppConfig::ALERT_NORMAL_ACCEL_THRESHOLD_G;
  alertTuning.gyroThresholdDps = AppConfig::ALERT_NORMAL_GYRO_THRESHOLD_DPS;
  alertTuning.analysisWindowMs = AppConfig::ALERT_NORMAL_ANALYSIS_WINDOW_MS;
  alertTuning.cooldownMs = AppConfig::ALERT_NORMAL_COOLDOWN_MS;
}

bool upsertWifiNetwork(DeviceConfig& config,
                       const String& ssid,
                       const String& password,
                       bool preferred,
                       String* errorMessage) {
  const String trimmedSsid = trimValue(ssid);
  if (trimmedSsid.isEmpty()) {
    setErrorMessage(errorMessage, "Informe um SSID valido para salvar a rede.");
    return false;
  }

  size_t existingIndex = kMaxWifiNetworks;
  for (size_t index = 0; index < config.wifiNetworkCount; ++index) {
    if (config.wifiNetworks[index].ssid.equalsIgnoreCase(trimmedSsid)) {
      existingIndex = index;
      break;
    }
  }

  WifiNetworkConfig updatedNetwork;
  updatedNetwork.ssid = trimmedSsid;

  if (existingIndex < config.wifiNetworkCount) {
    updatedNetwork.password =
        password.isEmpty() ? config.wifiNetworks[existingIndex].password : password;
  } else {
    updatedNetwork.password = password;
  }

  if (existingIndex == kMaxWifiNetworks) {
    if (config.wifiNetworkCount >= kMaxWifiNetworks) {
      setErrorMessage(errorMessage,
                      "Limite de redes atingido. Remova uma rede antes de adicionar outra.");
      return false;
    }

    config.wifiNetworks[config.wifiNetworkCount] = updatedNetwork;
    existingIndex = config.wifiNetworkCount;
    ++config.wifiNetworkCount;
  } else {
    config.wifiNetworks[existingIndex] = updatedNetwork;
  }

  if (preferred && existingIndex > 0) {
    const WifiNetworkConfig preferredNetwork = config.wifiNetworks[existingIndex];
    for (size_t index = existingIndex; index > 0; --index) {
      config.wifiNetworks[index] = config.wifiNetworks[index - 1];
    }
    config.wifiNetworks[0] = preferredNetwork;
  }

  return true;
}

bool removeWifiNetworkAt(DeviceConfig& config, size_t index) {
  if (index >= config.wifiNetworkCount) {
    return false;
  }

  for (size_t current = index; current + 1 < config.wifiNetworkCount; ++current) {
    config.wifiNetworks[current] = config.wifiNetworks[current + 1];
  }

  if (config.wifiNetworkCount > 0) {
    --config.wifiNetworkCount;
    config.wifiNetworks[config.wifiNetworkCount] = WifiNetworkConfig{};
  }

  return true;
}

}  // namespace DeviceSettings
