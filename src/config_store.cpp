#include "config_store.h"

#include <Preferences.h>

namespace {

constexpr char kNamespace[] = "queda_cfg";
constexpr char kConfigVersionKey[] = "cfg_ver";
constexpr uint8_t kConfigVersion = 5;
constexpr char kWifiCountKey[] = "wifi_count";
constexpr char kDeviceIdKey[] = "device_id";
constexpr char kMqttHostKey[] = "mqtt_host";
constexpr char kMqttPortKey[] = "mqtt_port";
constexpr char kMqttUserKey[] = "mqtt_user";
constexpr char kMqttPassKey[] = "mqtt_pass";
constexpr char kMqttClientKey[] = "mqtt_client";
constexpr char kMqttTlsKey[] = "mqtt_tls";
constexpr char kMqttTlsInsecureKey[] = "mqtt_tls_insec";
constexpr char kMqttTlsCaKey[] = "mqtt_tls_ca";
constexpr char kBackendApiBaseUrlKey[] = "api_base";
constexpr char kDeviceSyncTokenKey[] = "device_sync";
constexpr char kPatientNameKey[] = "patient_name";
constexpr char kPatientWeightSetKey[] = "patient_w_set";
constexpr char kPatientWeightKey[] = "patient_w";
constexpr char kPatientHeightSetKey[] = "patient_h_set";
constexpr char kPatientHeightKey[] = "patient_h";
constexpr char kPatientPresetKey[] = "patient_preset";
constexpr char kPatientSyncedAtKey[] = "patient_synced";
constexpr char kAlertPresetKey[] = "alert_preset";
constexpr char kAlertAccelKey[] = "alert_accel";
constexpr char kAlertGyroKey[] = "alert_gyro";
constexpr char kAlertWindowKey[] = "alert_window";
constexpr char kAlertCooldownKey[] = "alert_cooldown";
constexpr char kAlertBuzzerKey[] = "alert_buzzer";
constexpr char kAlertEventsKey[] = "alert_events";
constexpr char kPendingEventCountKey[] = "evt_count";

String wifiSsidKey(size_t index) {
  return "wifi_ssid_" + String(index);
}

String wifiPassKey(size_t index) {
  return "wifi_pass_" + String(index);
}

String pendingEventTopicKey(size_t index) {
  return "evt_topic_" + String(index);
}

String pendingEventPayloadKey(size_t index) {
  return "evt_payload_" + String(index);
}

String pendingEventQueuedAtKey(size_t index) {
  return "evt_time_" + String(index);
}

}  // namespace

DeviceSettings::DeviceConfig ConfigStore::load() {
  DeviceSettings::DeviceConfig config = DeviceSettings::makeDefaultConfig();

  Preferences preferences;
  // Abrimos em modo leitura/escrita para evitar erro NOT_FOUND no primeiro boot,
  // quando o namespace ainda nao existe em NVS.
  if (!preferences.begin(kNamespace, false)) {
    return config;
  }

  if (!preferences.isKey(kConfigVersionKey)) {
    preferences.end();
    return config;
  }

  config.loadedFromNvs = true;
  config.deviceId = preferences.getString(kDeviceIdKey, config.deviceId);
  config.mqtt.host = preferences.getString(kMqttHostKey, config.mqtt.host);
  config.mqtt.port = preferences.getUShort(kMqttPortKey, config.mqtt.port);
  config.mqtt.username = preferences.getString(kMqttUserKey, config.mqtt.username);
  config.mqtt.password = preferences.getString(kMqttPassKey, config.mqtt.password);
  config.mqtt.clientId =
      preferences.getString(kMqttClientKey, config.mqtt.clientId);
  config.mqtt.useTls = preferences.getBool(kMqttTlsKey, config.mqtt.useTls);
  config.mqtt.tlsInsecure =
      preferences.getBool(kMqttTlsInsecureKey, config.mqtt.tlsInsecure);
  config.mqtt.tlsCaCertificate =
      preferences.getString(kMqttTlsCaKey, config.mqtt.tlsCaCertificate);
  config.mqtt.backendApiBaseUrl =
      preferences.getString(kBackendApiBaseUrlKey, config.mqtt.backendApiBaseUrl);
  config.deviceSyncToken =
      preferences.getString(kDeviceSyncTokenKey, config.deviceSyncToken);
  config.patientProfile.patientName =
      preferences.getString(kPatientNameKey, config.patientProfile.patientName);
  config.patientProfile.hasWeightKg =
      preferences.getBool(kPatientWeightSetKey, false);
  config.patientProfile.weightKg =
      preferences.getFloat(kPatientWeightKey, 0.0f);
  config.patientProfile.hasHeightCm =
      preferences.getBool(kPatientHeightSetKey, false);
  config.patientProfile.heightCm =
      preferences.getFloat(kPatientHeightKey, 0.0f);
  config.patientProfile.fallSensitivityPreset =
      preferences.getString(kPatientPresetKey, config.patientProfile.fallSensitivityPreset);
  config.patientProfile.syncedAt =
      preferences.getString(kPatientSyncedAtKey, config.patientProfile.syncedAt);
  config.alertTuning.sensitivityPreset =
      DeviceSettings::normalizeAlertSensitivityPreset(
          preferences.getString(kAlertPresetKey, config.alertTuning.sensitivityPreset));
  config.alertTuning.accelThresholdG =
      DeviceSettings::clampAlertAccelThreshold(
          preferences.getFloat(kAlertAccelKey, config.alertTuning.accelThresholdG));
  config.alertTuning.gyroThresholdDps =
      DeviceSettings::clampAlertGyroThreshold(
          preferences.getFloat(kAlertGyroKey, config.alertTuning.gyroThresholdDps));
  config.alertTuning.analysisWindowMs =
      DeviceSettings::clampAlertAnalysisWindowMs(
          preferences.getULong(kAlertWindowKey, config.alertTuning.analysisWindowMs));
  config.alertTuning.cooldownMs =
      DeviceSettings::clampAlertCooldownMs(
          preferences.getULong(kAlertCooldownKey, config.alertTuning.cooldownMs));
  config.alertTuning.buzzerEnabled =
      preferences.getBool(kAlertBuzzerKey, config.alertTuning.buzzerEnabled);
  config.alertTuning.eventsEnabled =
      preferences.getBool(kAlertEventsKey, config.alertTuning.eventsEnabled);

  const size_t count = preferences.getUChar(kWifiCountKey, 0);
  config.wifiNetworkCount = 0;

  for (size_t index = 0; index < DeviceSettings::kMaxWifiNetworks; ++index) {
    const String ssid =
        preferences.getString(wifiSsidKey(index).c_str(), "");
    const String password =
        preferences.getString(wifiPassKey(index).c_str(), "");

    if (ssid.isEmpty()) {
      continue;
    }

    if (config.wifiNetworkCount >= DeviceSettings::kMaxWifiNetworks) {
      break;
    }

    config.wifiNetworks[config.wifiNetworkCount].ssid = ssid;
    config.wifiNetworks[config.wifiNetworkCount].password = password;
    ++config.wifiNetworkCount;

    if (config.wifiNetworkCount >= count && count > 0) {
      break;
    }
  }

  preferences.end();
  return config;
}

bool ConfigStore::save(const DeviceSettings::DeviceConfig& config) {
  Preferences preferences;
  if (!preferences.begin(kNamespace, false)) {
    return false;
  }

  preferences.putUChar(kConfigVersionKey, kConfigVersion);
  preferences.putString(kDeviceIdKey, config.deviceId);
  preferences.putString(kMqttHostKey, config.mqtt.host);
  preferences.putUShort(kMqttPortKey, config.mqtt.port);
  preferences.putString(kMqttUserKey, config.mqtt.username);
  preferences.putString(kMqttPassKey, config.mqtt.password);
  preferences.putString(kMqttClientKey, config.mqtt.clientId);
  preferences.putBool(kMqttTlsKey, config.mqtt.useTls);
  preferences.putBool(kMqttTlsInsecureKey, config.mqtt.tlsInsecure);
  preferences.putString(kMqttTlsCaKey, config.mqtt.tlsCaCertificate);
  preferences.putString(kBackendApiBaseUrlKey, config.mqtt.backendApiBaseUrl);
  preferences.putString(kDeviceSyncTokenKey, config.deviceSyncToken);
  preferences.putString(kPatientNameKey, config.patientProfile.patientName);
  preferences.putBool(kPatientWeightSetKey, config.patientProfile.hasWeightKg);
  preferences.putFloat(kPatientWeightKey, config.patientProfile.weightKg);
  preferences.putBool(kPatientHeightSetKey, config.patientProfile.hasHeightCm);
  preferences.putFloat(kPatientHeightKey, config.patientProfile.heightCm);
  preferences.putString(kPatientPresetKey, config.patientProfile.fallSensitivityPreset);
  preferences.putString(kPatientSyncedAtKey, config.patientProfile.syncedAt);
  preferences.putString(kAlertPresetKey,
                        DeviceSettings::normalizeAlertSensitivityPreset(
                            config.alertTuning.sensitivityPreset));
  preferences.putFloat(kAlertAccelKey,
                       DeviceSettings::clampAlertAccelThreshold(
                           config.alertTuning.accelThresholdG));
  preferences.putFloat(kAlertGyroKey,
                       DeviceSettings::clampAlertGyroThreshold(
                           config.alertTuning.gyroThresholdDps));
  preferences.putULong(kAlertWindowKey,
                       DeviceSettings::clampAlertAnalysisWindowMs(
                           config.alertTuning.analysisWindowMs));
  preferences.putULong(kAlertCooldownKey,
                       DeviceSettings::clampAlertCooldownMs(
                           config.alertTuning.cooldownMs));
  preferences.putBool(kAlertBuzzerKey, config.alertTuning.buzzerEnabled);
  preferences.putBool(kAlertEventsKey, config.alertTuning.eventsEnabled);
  preferences.putUChar(kWifiCountKey, static_cast<uint8_t>(config.wifiNetworkCount));

  for (size_t index = 0; index < DeviceSettings::kMaxWifiNetworks; ++index) {
    const bool active = index < config.wifiNetworkCount;
    preferences.putString(wifiSsidKey(index).c_str(),
                          active ? config.wifiNetworks[index].ssid : "");
    preferences.putString(wifiPassKey(index).c_str(),
                          active ? config.wifiNetworks[index].password : "");
  }

  preferences.end();
  return true;
}

bool ConfigStore::clear() {
  Preferences preferences;
  if (!preferences.begin(kNamespace, false)) {
    return false;
  }

  const bool cleared = preferences.clear();
  preferences.end();
  return cleared;
}

size_t ConfigStore::loadPendingEvents(BufferedEvent* events, size_t capacity) {
  if (events == nullptr || capacity == 0U) {
    return 0U;
  }

  Preferences preferences;
  if (!preferences.begin(kNamespace, true)) {
    return 0U;
  }

  const size_t persistedCount = preferences.getUChar(kPendingEventCountKey, 0);
  size_t loadedCount = 0;

  for (size_t index = 0; index < persistedCount && loadedCount < capacity; ++index) {
    const String topic = preferences.getString(pendingEventTopicKey(index).c_str(), "");
    const String payload =
        preferences.getString(pendingEventPayloadKey(index).c_str(), "");
    if (topic.isEmpty() || payload.isEmpty()) {
      continue;
    }

    events[loadedCount].topic = topic;
    events[loadedCount].payload = payload;
    events[loadedCount].queuedAtMs =
        preferences.getULong(pendingEventQueuedAtKey(index).c_str(), 0);
    ++loadedCount;
  }

  preferences.end();
  return loadedCount;
}

bool ConfigStore::savePendingEvents(const BufferedEvent* events, size_t count) {
  Preferences preferences;
  if (!preferences.begin(kNamespace, false)) {
    return false;
  }

  const size_t persistedCount =
      count < AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY
          ? count
          : AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY;
  preferences.putUChar(kPendingEventCountKey, static_cast<uint8_t>(persistedCount));

  for (size_t index = 0; index < AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY; ++index) {
    const bool active = events != nullptr && index < persistedCount;
    preferences.putString(pendingEventTopicKey(index).c_str(),
                          active ? events[index].topic : "");
    preferences.putString(pendingEventPayloadKey(index).c_str(),
                          active ? events[index].payload : "");
    preferences.putULong(pendingEventQueuedAtKey(index).c_str(),
                         active ? events[index].queuedAtMs : 0U);
  }

  preferences.end();
  return true;
}

bool ConfigStore::clearPendingEvents() {
  return savePendingEvents(nullptr, 0U);
}
