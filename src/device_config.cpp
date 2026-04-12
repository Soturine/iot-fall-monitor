#include "device_config.h"

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

}  // namespace

namespace DeviceSettings {

DeviceConfig makeDefaultConfig() {
  DeviceConfig config;
  config.loadedFromNvs = false;
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

  const String deviceId = effectiveDeviceId(config);
  if (!deviceId.isEmpty()) {
    ssid += "-";
    ssid += deviceId.substring(0, 12);
  }

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
