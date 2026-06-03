#include <Arduino.h>
#include <ArduinoJson.h>
#include <time.h>

#include "app_config.h"
#include "app_logging.h"
#include "buzzer_led.h"
#include "config_store.h"
#include "connectivity_manager.h"
#include "device_config.h"
#include "event_buffer.h"
#include "fall_feature_extractor.h"
#include "fall_detector.h"
#include "models.h"
#include "mqtt_client.h"
#include "patient_profile_client.h"
#include "sensor_mpu6050.h"
#include "sos_button.h"
#include "setup_portal.h"
#include "wifi_manager.h"

namespace {

// Instancias globais simples mantem o loop principal enxuto para o firmware.
SensorMPU6050 sensor;
FallDetector fallDetector;
FallFeatureExtractor fallFeatureExtractor;
ConfigStore configStore;
WifiManager wifiManager;
DeviceMqttClient mqttClient;
SetupPortal setupPortal(configStore, mqttClient);
ConnectivityManager connectivityManager(configStore, wifiManager, mqttClient, setupPortal);
EventBuffer eventBuffer;
BuzzerLed indicator;
SosButton sosButton;

SensorReading latestReading;
bool sensorReady = false;

unsigned long lastSensorSampleAtMs = 0;
unsigned long lastSensorDebugAtMs = 0;
unsigned long lastMotionTestDebugAtMs = 0;
unsigned long lastStatusSentAtMs = 0;
unsigned long lastTelemetrySentAtMs = 0;
unsigned long lastPatientProfileSyncAttemptAtMs = 0;
unsigned long lastMotionTestTriggerAtMs = 0;
unsigned long lastExperimentalAlertAtMs = 0;
unsigned long lastExperimentalAlertSkipLogAtMs = 0;
unsigned long motionTestStableSinceAtMs = 0;
unsigned long lastEventBufferPersistAtMs = 0;
unsigned long lastSensorHealthLogAtMs = 0;
unsigned long lastTelemetrySkipLogAtMs = 0;
unsigned long lastLoopHealthLogAtMs = 0;
unsigned long lastSensorBeginRetryAtMs = 0;
unsigned long consecutiveSensorReadFailures = 0;
uint32_t sensorSampleSeq = 0;
uint32_t criticalEventSeq = 0;
bool lastPatientProfileSyncSucceeded = false;
bool mqttRuntimeContextLogged = false;
bool lastSensorReadSucceeded = false;

unsigned long currentTimestampSeconds() {
  const time_t now = time(nullptr);
  // Se o NTP ainda nao sincronizou, usa millis como fallback monotono simples.
  return (now >= 1700000000) ? static_cast<unsigned long>(now) : millis() / 1000UL;
}

int batteryLevelPercent() {
  // Placeholder: trocar por leitura ADC quando houver circuito de bateria.
  return 100;
}

unsigned long latestSensorSampleAgeMs(unsigned long nowMs) {
  if (!latestReading.valid || nowMs < latestReading.timestampMs) {
    return 0U;
  }

  return nowMs - latestReading.timestampMs;
}

bool hasFreshSensorSample(unsigned long nowMs) {
  return latestReading.valid &&
         latestSensorSampleAgeMs(nowMs) <= AppConfig::SENSOR_LAST_SAMPLE_MAX_AGE_MS;
}

uint32_t nextMonotonicSequence(uint32_t& sequence) {
  ++sequence;
  if (sequence == 0U) {
    sequence = 1U;
  }
  return sequence;
}

String buildCriticalEventUuid(const char* eventType,
                              uint32_t eventSequence,
                              unsigned long nowMs) {
  char suffix[64] = {0};
  snprintf(suffix,
           sizeof(suffix),
           "%lu-%lu-%lu",
           currentTimestampSeconds(),
           nowMs,
           static_cast<unsigned long>(eventSequence));

  return DeviceSettings::technicalDeviceUid() + "-" + String(eventType) + "-" + suffix;
}

String extractJsonStringField(const String& payload, const char* fieldName) {
  const String needle = String("\"") + fieldName + "\":\"";
  const int start = payload.indexOf(needle);
  if (start < 0) {
    return "";
  }

  const int valueStart = start + needle.length();
  const int valueEnd = payload.indexOf('"', valueStart);
  if (valueEnd <= valueStart) {
    return "";
  }

  return payload.substring(valueStart, valueEnd);
}

size_t buildCriticalEventSnapshot(BufferedEvent* snapshot, size_t snapshotCapacity) {
  if (snapshot == nullptr || snapshotCapacity == 0U) {
    return 0U;
  }

  BufferedEvent allEvents[AppConfig::EVENT_BUFFER_CAPACITY];
  const size_t bufferedCount =
      eventBuffer.copyTo(allEvents, AppConfig::EVENT_BUFFER_CAPACITY);
  size_t snapshotCount = 0;

  for (size_t index = 0; index < bufferedCount && snapshotCount < snapshotCapacity; ++index) {
    if (!allEvents[index].topic.endsWith("/events")) {
      continue;
    }

    snapshot[snapshotCount] = allEvents[index];
    ++snapshotCount;
  }

  return snapshotCount;
}

bool persistCriticalEventSnapshot(unsigned long nowMs) {
  if (!AppConfig::EVENT_BUFFER_PERSISTENCE_ENABLED) {
    return false;
  }

  BufferedEvent snapshot[AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY];
  const size_t snapshotCount =
      buildCriticalEventSnapshot(snapshot, AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY);

  if (!configStore.savePendingEvents(snapshot, snapshotCount)) {
    return false;
  }

  eventBuffer.markPersisted();
  lastEventBufferPersistAtMs = nowMs;
  return true;
}

const DeviceSettings::DeviceConfig& runtimeConfig() {
  return connectivityManager.config();
}

bool handlePortalBuzzerTest(String* message) {
  const bool enabled = runtimeConfig().alertTuning.buzzerEnabled;
  indicator.setBuzzerEnabled(enabled);
  AppLog::infof("[buzzer] portal test requested enabled=%u pin=%u active_high=%u\n",
                enabled ? 1U : 0U,
                AppConfig::BUZZER_PIN,
                AppConfig::BUZZER_ACTIVE_HIGH ? 1U : 0U);

  indicator.triggerPulse(220, "portal_test");

  if (message != nullptr) {
    *message = enabled
                   ? "Pulso de teste do buzzer iniciado. Se nao ouvir som, confira pino, GND, tipo ativo/passivo e alimentacao."
                   : "Buzzer desabilitado na pre-calibracao. Habilite o buzzer local, salve e teste novamente.";
  }

  return enabled;
}

void addTimeDomainFeatures(JsonObject features, const FallTimeDomainFeatures& timeFeatures) {
  features["available"] = timeFeatures.available;
  features["sample_count"] = timeFeatures.sampleCount;
  features["window_started_at_ms"] = timeFeatures.windowStartedAtMs;
  features["window_ended_at_ms"] = timeFeatures.windowEndedAtMs;
  features["window_duration_ms"] = timeFeatures.windowDurationMs;

  if (!timeFeatures.available) {
    return;
  }

  features["mean_ax"] = timeFeatures.meanAxG;
  features["mean_ay"] = timeFeatures.meanAyG;
  features["mean_az"] = timeFeatures.meanAzG;
  features["std_ax"] = timeFeatures.stdAxG;
  features["std_ay"] = timeFeatures.stdAyG;
  features["std_az"] = timeFeatures.stdAzG;
  features["mean_gx"] = timeFeatures.meanGxDps;
  features["mean_gy"] = timeFeatures.meanGyDps;
  features["mean_gz"] = timeFeatures.meanGzDps;
  features["std_gx"] = timeFeatures.stdGxDps;
  features["std_gy"] = timeFeatures.stdGyDps;
  features["std_gz"] = timeFeatures.stdGzDps;
  features["energy_ax"] = timeFeatures.energyAx;
  features["energy_ay"] = timeFeatures.energyAy;
  features["energy_az"] = timeFeatures.energyAz;
  features["energy_gx"] = timeFeatures.energyGx;
  features["energy_gy"] = timeFeatures.energyGy;
  features["energy_gz"] = timeFeatures.energyGz;
  features["peak_accel_magnitude"] = timeFeatures.peakAccelMagnitudeG;
  features["peak_gyro_magnitude"] = timeFeatures.peakGyroMagnitudeDps;
  features["mean_jerk"] = timeFeatures.meanJerkGPerSec;
  features["peak_jerk"] = timeFeatures.peakJerkGPerSec;
}

void addFrequencyDomainFeatures(JsonObject features,
                                const FallFrequencyDomainFeatures& frequencyFeatures) {
  features["available"] = frequencyFeatures.available;
  features["experimental"] = frequencyFeatures.experimental;
  features["window_size"] = frequencyFeatures.windowSize;
  features["sample_interval_ms"] = frequencyFeatures.sampleIntervalMs;
  features["sample_count"] = frequencyFeatures.sampleCount;

  if (!frequencyFeatures.available) {
    features["reason"] = "fft_experimental_disabled";
    features["spectral_energy_ax"] = nullptr;
    features["spectral_energy_ay"] = nullptr;
    features["spectral_energy_az"] = nullptr;
    features["spectral_energy_gx"] = nullptr;
    features["spectral_energy_gy"] = nullptr;
    features["spectral_energy_gz"] = nullptr;
    features["dominant_frequency_ax"] = nullptr;
    features["dominant_frequency_ay"] = nullptr;
    features["dominant_frequency_az"] = nullptr;
    features["dominant_frequency_gx"] = nullptr;
    features["dominant_frequency_gy"] = nullptr;
    features["dominant_frequency_gz"] = nullptr;
    return;
  }

  features["spectral_energy_ax"] = frequencyFeatures.spectralEnergyAx;
  features["spectral_energy_ay"] = frequencyFeatures.spectralEnergyAy;
  features["spectral_energy_az"] = frequencyFeatures.spectralEnergyAz;
  features["spectral_energy_gx"] = frequencyFeatures.spectralEnergyGx;
  features["spectral_energy_gy"] = frequencyFeatures.spectralEnergyGy;
  features["spectral_energy_gz"] = frequencyFeatures.spectralEnergyGz;
  features["dominant_frequency_ax"] = frequencyFeatures.dominantFrequencyAxHz;
  features["dominant_frequency_ay"] = frequencyFeatures.dominantFrequencyAyHz;
  features["dominant_frequency_az"] = frequencyFeatures.dominantFrequencyAzHz;
  features["dominant_frequency_gx"] = frequencyFeatures.dominantFrequencyGxHz;
  features["dominant_frequency_gy"] = frequencyFeatures.dominantFrequencyGyHz;
  features["dominant_frequency_gz"] = frequencyFeatures.dominantFrequencyGzHz;
}

void enrichFallAlertWithCurrentWindow(FallAlert& alert, const SensorReading& reading) {
  alert.decisionSource = "firmware";
  alert.algorithmVersion = AppConfig::FALL_DECISION_ENGINE_VERSION;
  alert.activityStateEstimate = "queda_confirmada";
  alert.confidence = 0.76f;
  alert.candidate = true;
  alert.pitchDeg = reading.pitchDeg;
  alert.rollDeg = reading.rollDeg;
  alert.accelMagnitudeG = alert.accelMagnitudeG > 0.0f
                              ? alert.accelMagnitudeG
                              : reading.accelMagnitudeG;
  alert.gyroMagnitudeDegPerSec = alert.gyroMagnitudeDegPerSec > 0.0f
                                      ? alert.gyroMagnitudeDegPerSec
                                      : reading.gyroMagnitudeDegPerSec;
  alert.peakAccelG = alert.accelMagnitudeG;
  alert.peakGyroDps = alert.gyroMagnitudeDegPerSec;
  alert.sampleCount = alert.samplesConsidered;
  alert.windowEndedAtMs = alert.timestampMs > 0U ? alert.timestampMs : reading.timestampMs;
  alert.windowStartedAtMs =
      alert.analysisWindowMs > 0U && alert.windowEndedAtMs >= alert.analysisWindowMs
          ? alert.windowEndedAtMs - alert.analysisWindowMs
          : 0U;
  alert.timeDomainFeatures = fallFeatureExtractor.timeDomainSnapshot();
  alert.frequencyDomainFeatures = fallFeatureExtractor.frequencyDomainSnapshot();
  alert.linkedTelemetryWindow.available = false;
  alert.linkedTelemetryWindow.reason = "backend_links_persisted_telemetry";
  alert.linkedTelemetryWindow.windowStartedAtMs = alert.windowStartedAtMs;
  alert.linkedTelemetryWindow.windowEndedAtMs = alert.windowEndedAtMs;
  alert.linkedTelemetryWindow.sampleCount = alert.sampleCount;
}

float clampConfidence(float value) {
  if (value < 0.0f) {
    return 0.0f;
  }
  if (value > 0.95f) {
    return 0.95f;
  }
  return value;
}

void addDeviceIdentityToPayload(JsonDocument& doc) {
  doc["device_uid"] = DeviceSettings::technicalDeviceUid();
  doc["device_id"] = DeviceSettings::effectiveDeviceId(runtimeConfig());
}

void addBatteryFieldsToPayload(JsonDocument& doc) {
  const int batteryPercent = batteryLevelPercent();
  doc["battery_level"] = batteryPercent;
  doc["battery_percent"] = batteryPercent;
}

void addNetworkFieldsToPayload(JsonDocument& doc) {
  const long rssi = connectivityManager.wifiRssi();
  doc["wifi_rssi"] = rssi;
  doc["rssi"] = rssi;
}

void addSensorDiagnosticsToPayload(JsonDocument& doc,
                                   unsigned long nowMs,
                                   bool sensorSampleFresh) {
  doc["sensor_ready"] = sensorReady;
  doc["sensor_valid"] = sensorSampleFresh;
  doc["sensor_read_ok"] = lastSensorReadSucceeded;
  doc["sensor_sample_age_ms"] = latestSensorSampleAgeMs(nowMs);
  doc["sensor_failures"] = sensor.consecutiveFailureCount();
  doc["i2c_error_count"] = sensor.totalI2cErrorCount();
  doc["i2c_recovery_count"] = sensor.i2cRecoveryCount();
  doc["i2c_last_error"] = sensor.lastI2cError();
}

void addLatestReadingFieldsToPayload(JsonDocument& doc, bool includeMagnitudes = true) {
  doc["ax"] = latestReading.accelXG;
  doc["ay"] = latestReading.accelYG;
  doc["az"] = latestReading.accelZG;
  doc["gx"] = latestReading.gyroXDegPerSec;
  doc["gy"] = latestReading.gyroYDegPerSec;
  doc["gz"] = latestReading.gyroZDegPerSec;
  if (includeMagnitudes) {
    doc["accel_magnitude"] = latestReading.accelMagnitudeG;
    doc["gyro_magnitude"] = latestReading.gyroMagnitudeDegPerSec;
  }
  doc["pitch_deg"] = latestReading.pitchDeg;
  doc["roll_deg"] = latestReading.rollDeg;
}

void addSensorContextToEventPayload(JsonDocument& doc, unsigned long nowMs) {
  const bool sensorSampleFresh = hasFreshSensorSample(nowMs);
  addSensorDiagnosticsToPayload(doc, nowMs, sensorSampleFresh);
  doc["sample_age_ms"] = latestSensorSampleAgeMs(nowMs);

  if (!sensorSampleFresh) {
    return;
  }

  addLatestReadingFieldsToPayload(doc, false);
}

void addAlertTuningToEventPayload(JsonDocument& doc) {
  const auto& alertTuning = runtimeConfig().alertTuning;
  JsonObject settings = doc.createNestedObject("alert_settings");
  settings["sensitivity"] = alertTuning.sensitivityPreset;
  settings["accel_threshold_g"] = alertTuning.accelThresholdG;
  settings["gyro_threshold_dps"] = alertTuning.gyroThresholdDps;
  settings["analysis_window_ms"] = alertTuning.analysisWindowMs;
  settings["cooldown_ms"] = alertTuning.cooldownMs;
  settings["events_enabled"] = alertTuning.eventsEnabled;
  settings["buzzer_enabled"] = alertTuning.buzzerEnabled;
}

FallAlert buildExperimentalAlertDecision(const SensorReading& reading,
                                         const char* eventType,
                                         const char* reason,
                                         bool accelTriggered,
                                         bool gyroTriggered,
                                         unsigned long nowMs) {
  FallAlert alert;
  const auto& alertTuning = runtimeConfig().alertTuning;
  const FallTimeDomainFeatures timeFeatures = fallFeatureExtractor.timeDomainSnapshot();
  const float accelRatio =
      alertTuning.accelThresholdG > 0.0f
          ? reading.accelMagnitudeG / alertTuning.accelThresholdG
          : 0.0f;
  const float gyroRatio =
      alertTuning.gyroThresholdDps > 0.0f
          ? reading.gyroMagnitudeDegPerSec / alertTuning.gyroThresholdDps
          : 0.0f;

  alert.detected = false;
  alert.candidate = true;
  alert.immobilityConfirmed = false;
  alert.decisionSource = "firmware";
  alert.algorithmVersion = AppConfig::ALERT_DECISION_ENGINE_VERSION;
  alert.activityStateEstimate =
      String(eventType) == "fall_suspected" ? "queda_suspeita" : "movimento_intenso";
  alert.confidence = clampConfidence((accelTriggered && gyroTriggered ? 0.55f : 0.38f) +
                                     (fminf(accelRatio, 2.0f) * 0.10f) +
                                     (fminf(gyroRatio, 2.0f) * 0.10f));
  alert.accelMagnitudeG = reading.accelMagnitudeG;
  alert.gyroMagnitudeDegPerSec = reading.gyroMagnitudeDegPerSec;
  alert.peakAccelG = timeFeatures.available
                         ? fmaxf(timeFeatures.peakAccelMagnitudeG,
                                 reading.accelMagnitudeG)
                         : reading.accelMagnitudeG;
  alert.peakGyroDps = timeFeatures.available
                          ? fmaxf(timeFeatures.peakGyroMagnitudeDps,
                                  reading.gyroMagnitudeDegPerSec)
                          : reading.gyroMagnitudeDegPerSec;
  alert.pitchDeg = reading.pitchDeg;
  alert.rollDeg = reading.rollDeg;
  alert.orientationDeltaDeg = 0.0f;
  alert.analysisWindowMs = alertTuning.analysisWindowMs;
  alert.windowEndedAtMs = nowMs;
  alert.windowStartedAtMs =
      nowMs >= alertTuning.analysisWindowMs ? nowMs - alertTuning.analysisWindowMs : 0U;
  alert.sampleCount = timeFeatures.available ? timeFeatures.sampleCount : 1U;
  alert.samplesConsidered = alert.sampleCount;
  alert.immobilityDurationMs = 0;
  alert.reason = reason;
  alert.timestampMs = reading.timestampMs;
  alert.timeDomainFeatures = timeFeatures;
  alert.frequencyDomainFeatures = fallFeatureExtractor.frequencyDomainSnapshot();
  alert.linkedTelemetryWindow.available = false;
  alert.linkedTelemetryWindow.reason = "backend_links_persisted_telemetry";
  alert.linkedTelemetryWindow.windowStartedAtMs = alert.windowStartedAtMs;
  alert.linkedTelemetryWindow.windowEndedAtMs = alert.windowEndedAtMs;
  alert.linkedTelemetryWindow.sampleCount = alert.sampleCount;

  return alert;
}

String buildEventPayload(const char* eventType,
                         float accelMagnitudeG,
                         float gyroMagnitudeDegPerSec,
                         bool immobilityConfirmed,
                         const String& eventUuid,
                         uint32_t eventSequence,
                         uint32_t sampleSeq,
                         const FallAlert* fallAlert = nullptr) {
  // Mantem o formato do payload centralizado em um unico ponto.
  StaticJsonDocument<3072> doc;
  const unsigned long nowMs = millis();
  addDeviceIdentityToPayload(doc);
  doc["event_type"] = eventType;
  doc["event_uuid"] = eventUuid;
  doc["event_sequence"] = eventSequence;
  doc["sample_seq"] = sampleSeq;
  doc["timestamp"] = currentTimestampSeconds();
  doc["event_uptime_ms"] = millis();
  doc["accel_magnitude"] = accelMagnitudeG;
  doc["gyro_magnitude"] = gyroMagnitudeDegPerSec;
  doc["immobility_confirmed"] = immobilityConfirmed;
  addBatteryFieldsToPayload(doc);
  doc["algorithm"] = fallAlert != nullptr
                         ? fallAlert->algorithmVersion
                         : AppConfig::ALERT_DECISION_ENGINE_VERSION;
  addSensorContextToEventPayload(doc, nowMs);
  addAlertTuningToEventPayload(doc);

  if (fallAlert != nullptr) {
    doc["decision_source"] = fallAlert->decisionSource;
    doc["algorithm_version"] = fallAlert->algorithmVersion;
    doc["detected"] = fallAlert->detected;
    doc["candidate"] = fallAlert->candidate;
    doc["reason"] = fallAlert->reason;
    doc["activity_state_estimate"] = fallAlert->activityStateEstimate;
    doc["confidence"] = fallAlert->confidence;
    doc["fall_reason"] = fallAlert->reason;
    doc["window_started_at_ms"] = fallAlert->windowStartedAtMs;
    doc["window_ended_at_ms"] = fallAlert->windowEndedAtMs;
    doc["analysis_window_ms"] = fallAlert->analysisWindowMs;
    doc["sample_count"] = fallAlert->sampleCount;
    doc["samples_considered"] = fallAlert->samplesConsidered;
    doc["peak_accel_g"] = fallAlert->peakAccelG;
    doc["peak_gyro_dps"] = fallAlert->peakGyroDps;
    doc["accel_magnitude_g"] = fallAlert->accelMagnitudeG;
    doc["gyro_magnitude_dps"] = fallAlert->gyroMagnitudeDegPerSec;
    doc["pitch_deg"] = fallAlert->pitchDeg;
    doc["roll_deg"] = fallAlert->rollDeg;
    doc["orientation_delta_deg"] = fallAlert->orientationDeltaDeg;
    doc["immobility_duration_ms"] = fallAlert->immobilityDurationMs;

    JsonObject features = doc.createNestedObject("features");
    features["decision_source"] = fallAlert->decisionSource;
    features["algorithm_version"] = fallAlert->algorithmVersion;
    features["reason"] = fallAlert->reason;
    features["peak_accel_magnitude_g"] = fallAlert->accelMagnitudeG;
    features["peak_gyro_magnitude_dps"] = fallAlert->gyroMagnitudeDegPerSec;
    features["orientation_delta_deg"] = fallAlert->orientationDeltaDeg;
    features["immobility_confirmed"] = fallAlert->immobilityConfirmed;
    features["immobility_duration_ms"] = fallAlert->immobilityDurationMs;
    features["analysis_window_ms"] = fallAlert->analysisWindowMs;
    features["samples_considered"] = fallAlert->samplesConsidered;
    features["activity_state_estimate"] = fallAlert->activityStateEstimate;
    features["confidence"] = fallAlert->confidence;

    JsonObject timeFeatures = doc.createNestedObject("features_time_domain");
    addTimeDomainFeatures(timeFeatures, fallAlert->timeDomainFeatures);

    JsonObject frequencyFeatures = doc.createNestedObject("features_frequency_domain");
    addFrequencyDomainFeatures(frequencyFeatures, fallAlert->frequencyDomainFeatures);

    JsonObject linkedTelemetryWindow = doc.createNestedObject("linked_telemetry_window");
    linkedTelemetryWindow["available"] = fallAlert->linkedTelemetryWindow.available;
    linkedTelemetryWindow["reason"] = fallAlert->linkedTelemetryWindow.reason;
    linkedTelemetryWindow["window_started_at_ms"] =
        fallAlert->linkedTelemetryWindow.windowStartedAtMs;
    linkedTelemetryWindow["window_ended_at_ms"] =
        fallAlert->linkedTelemetryWindow.windowEndedAtMs;
    linkedTelemetryWindow["sample_count"] = fallAlert->linkedTelemetryWindow.sampleCount;

    JsonObject thresholds = doc.createNestedObject("thresholds");
    thresholds["impact_accel_g"] = AppConfig::IMPACT_THRESHOLD_G;
    thresholds["impact_gyro_dps"] = AppConfig::IMPACT_GYRO_THRESHOLD_DPS;
    thresholds["orientation_change_deg"] = AppConfig::ORIENTATION_CHANGE_THRESHOLD_DEG;
    thresholds["required_immobility_ms"] = AppConfig::REQUIRED_IMMOBILITY_MS;
    thresholds["experimental_accel_g"] = runtimeConfig().alertTuning.accelThresholdG;
    thresholds["experimental_gyro_dps"] = runtimeConfig().alertTuning.gyroThresholdDps;
    thresholds["experimental_window_ms"] = runtimeConfig().alertTuning.analysisWindowMs;
    thresholds["experimental_cooldown_ms"] = runtimeConfig().alertTuning.cooldownMs;
  }

  if (doc.overflowed()) {
    AppLog::warn("[event] payload JSON overflowed before serialization.");
  }

  String payload;
  serializeJson(doc, payload);
  return payload;
}

String buildStatusPayload() {
  // O status periodico carrega telemetria minima para observabilidade do dispositivo.
  const unsigned long nowMs = millis();
  const bool sensorSampleFresh = hasFreshSensorSample(nowMs);
  StaticJsonDocument<768> doc;
  addDeviceIdentityToPayload(doc);
  doc["event_type"] = "device_status";
  doc["timestamp"] = currentTimestampSeconds();
  if (sensorSampleFresh) {
    doc["accel_magnitude"] = latestReading.accelMagnitudeG;
    doc["gyro_magnitude"] = latestReading.gyroMagnitudeDegPerSec;
  }
  doc["immobility_confirmed"] = false;
  addBatteryFieldsToPayload(doc);
  addNetworkFieldsToPayload(doc);
  doc["buffered_events"] = eventBuffer.size();
  doc["sample_seq"] = sensorSampleSeq;
  addSensorDiagnosticsToPayload(doc, nowMs, sensorSampleFresh);

  if (doc.overflowed()) {
    AppLog::warn("[status] payload JSON overflowed before serialization.");
  }

  String payload;
  serializeJson(doc, payload);
  return payload;
}

String buildTelemetryPayload() {
  const unsigned long nowMs = millis();
  const bool sensorSampleFresh = hasFreshSensorSample(nowMs);
  StaticJsonDocument<896> doc;
  addDeviceIdentityToPayload(doc);
  doc["timestamp"] = currentTimestampSeconds();
  if (sensorSampleFresh) {
    addLatestReadingFieldsToPayload(doc);
  }
  addBatteryFieldsToPayload(doc);
  addNetworkFieldsToPayload(doc);
  doc["sample_seq"] = sensorSampleSeq;
  addSensorDiagnosticsToPayload(doc, nowMs, sensorSampleFresh);

  if (doc.overflowed()) {
    AppLog::warn("[telemetry] payload JSON overflowed before serialization.");
  }

  String payload;
  serializeJson(doc, payload);
  return payload;
}

bool publishCriticalEvent(const String& topic,
                          const String& payload,
                          const char* eventType,
                          const String& eventUuid) {
  if (mqttClient.publish(topic, payload, false)) {
    AppLog::infof("[event] publish ok topic=%s type=%s event_uuid=%s bytes=%u buffered_events=%u\n",
                  topic.c_str(),
                  eventType,
                  eventUuid.c_str(),
                  static_cast<unsigned>(payload.length()),
                  static_cast<unsigned>(eventBuffer.size()));
    return true;
  }

  const char* reason = mqttClient.isConnected() ? "publish_failed" : "mqtt_disconnected";
  AppLog::warnf("[event] publish failed reason=%s topic=%s type=%s event_uuid=%s bytes=%u mqtt_state=%d\n",
                reason,
                topic.c_str(),
                eventType,
                eventUuid.c_str(),
                static_cast<unsigned>(payload.length()),
                mqttClient.currentStateCode());

  if (eventBuffer.size() >= eventBuffer.capacity()) {
    AppLog::warnf("[event] dropped by buffer limit policy=drop_oldest type=%s event_uuid=%s capacity=%u\n",
                  eventType,
                  eventUuid.c_str(),
                  static_cast<unsigned>(eventBuffer.capacity()));
  }

  // Se a publicacao falhar, o evento critico entra no buffer local para reenvio posterior.
  eventBuffer.push(topic, payload, millis());

  AppLog::warnf("[event] queued reason=%s topic=%s type=%s event_uuid=%s buffered_events=%u/%u\n",
                reason,
                topic.c_str(),
                eventType,
                eventUuid.c_str(),
                static_cast<unsigned>(eventBuffer.size()),
                static_cast<unsigned>(eventBuffer.capacity()));

  persistCriticalEventSnapshot(millis());

  return false;
}

void flushBufferedEvents() {
  if (!mqttClient.isConnected()) {
    return;
  }

  BufferedEvent bufferedEvent;
  size_t flushedCount = 0;

  while (flushedCount < eventBuffer.capacity() && eventBuffer.peek(bufferedEvent)) {
    const String eventType = extractJsonStringField(bufferedEvent.payload, "event_type");
    const String eventUuid = extractJsonStringField(bufferedEvent.payload, "event_uuid");

    if (!mqttClient.publish(bufferedEvent.topic, bufferedEvent.payload, false)) {
      AppLog::warnf("[event] publish failed reason=flush_publish_failed topic=%s type=%s event_uuid=%s mqtt_state=%d buffered_events=%u\n",
                    bufferedEvent.topic.c_str(),
                    eventType.c_str(),
                    eventUuid.c_str(),
                    mqttClient.currentStateCode(),
                    static_cast<unsigned>(eventBuffer.size()));
      break;
    }

    // Remove do buffer somente depois de confirmar que a publicacao foi aceita.
    eventBuffer.pop();
    ++flushedCount;
    AppLog::infof("[event] flushed topic=%s type=%s event_uuid=%s remaining=%u\n",
                  bufferedEvent.topic.c_str(),
                  eventType.c_str(),
                  eventUuid.c_str(),
                  static_cast<unsigned>(eventBuffer.size()));
    mqttClient.update(connectivityManager.isWifiConnected());
    delay(5);
  }

  if (flushedCount > 0U) {
    persistCriticalEventSnapshot(millis());
  }
}

IndicatorState computeIndicatorState() {
  // O LED indica primeiro falha de sensor, depois conectividade e por fim alerta em analise.
  if (!sensorReady) {
    return IndicatorState::Error;
  }

  switch (connectivityManager.state()) {
    case ConnectivityState::SETUP_MODE:
      return IndicatorState::Warning;
    case ConnectivityState::ONLINE:
      if (fallDetector.hasPendingCandidate()) {
        return IndicatorState::Warning;
      }
      return IndicatorState::Online;
    case ConnectivityState::NO_WIFI:
    case ConnectivityState::WIFI_CONNECTING:
    case ConnectivityState::WIFI_OK_MQTT_CONNECTING:
      return IndicatorState::WifiConnecting;
  }

  return IndicatorState::Error;
}

void triggerConfiguredAlertBuzzer(const char* eventType, uint8_t cycles) {
  if (eventType == nullptr || eventType[0] == '\0' || cycles == 0U) {
    AppLog::warn("[buzzer] skipped reason=no_alert_event");
    return;
  }

  if (!runtimeConfig().alertTuning.buzzerEnabled) {
    if (AppConfig::FIRMWARE_MQTT_DIAGNOSTIC_ENABLED) {
      AppLog::infof("[buzzer] skipped reason=disabled event=%s pin=%u\n",
                    eventType,
                    AppConfig::BUZZER_PIN);
    }
    return;
  }

  indicator.setBuzzerEnabled(true);
  indicator.triggerAlarm(cycles, eventType);
}

void publishThresholdAlertEvent(const char* eventType,
                                const FallAlert& alert,
                                bool immobilityConfirmed,
                                uint8_t buzzerCycles) {
  const String topic = DeviceSettings::buildTopic(runtimeConfig(), "events");
  const uint32_t eventSequence = nextMonotonicSequence(criticalEventSeq);
  const String eventUuid = buildCriticalEventUuid(eventType, eventSequence, millis());
  const String payload = buildEventPayload(eventType,
                                           alert.accelMagnitudeG,
                                           alert.gyroMagnitudeDegPerSec,
                                           immobilityConfirmed,
                                           eventUuid,
                                           eventSequence,
                                           sensorSampleSeq,
                                           &alert);
  const bool published = publishCriticalEvent(topic, payload, eventType, eventUuid);

  AppLog::warnf("[alert] %s event=%s topic=%s event_uuid=%s sample_seq=%lu published=%u reason=%s accel=%.2f gyro=%.2f confidence=%.2f cooldown_ms=%lu preset=%s\n",
                published ? "event_published" : "event_queued",
                eventType,
                topic.c_str(),
                eventUuid.c_str(),
                static_cast<unsigned long>(sensorSampleSeq),
                published ? 1U : 0U,
                alert.reason,
                alert.accelMagnitudeG,
                alert.gyroMagnitudeDegPerSec,
                alert.confidence,
                runtimeConfig().alertTuning.cooldownMs,
                runtimeConfig().alertTuning.sensitivityPreset.c_str());

  triggerConfiguredAlertBuzzer(eventType, buzzerCycles);
}

void publishFallAlert(const FallAlert& alert) {
  const String topic = DeviceSettings::buildTopic(runtimeConfig(), "events");
  const uint32_t eventSequence = nextMonotonicSequence(criticalEventSeq);
  const String eventUuid = buildCriticalEventUuid("fall_detected", eventSequence, millis());
  const String payload = buildEventPayload(
      "fall_detected",
      alert.accelMagnitudeG,
      alert.gyroMagnitudeDegPerSec,
      true,
      eventUuid,
      eventSequence,
      sensorSampleSeq,
      &alert);
  const bool published = publishCriticalEvent(topic, payload, "fall_detected", eventUuid);
  if (AppConfig::FIRMWARE_MQTT_DIAGNOSTIC_ENABLED) {
    AppLog::warnf("[event] publish %s topic=%s type=fall_detected event_uuid=%s sample_seq=%lu bytes=%u reason=%s samples=%u window_ms=%lu peak_accel=%.2f peak_gyro=%.2f orientation_delta=%.1f\n",
                  published ? "ok" : "queued",
                  topic.c_str(),
                  eventUuid.c_str(),
                  static_cast<unsigned long>(sensorSampleSeq),
                  static_cast<unsigned>(payload.length()),
                  alert.reason,
                  alert.samplesConsidered,
                  alert.analysisWindowMs,
                  alert.accelMagnitudeG,
                  alert.gyroMagnitudeDegPerSec,
                  alert.orientationDeltaDeg);
  }
  triggerConfiguredAlertBuzzer("fall_detected", 6);
}

void publishSosAlert() {
  const float accelMagnitude = latestReading.valid ? latestReading.accelMagnitudeG : 0.0f;
  const float gyroMagnitude =
      latestReading.valid ? latestReading.gyroMagnitudeDegPerSec : 0.0f;

  const uint32_t eventSequence = nextMonotonicSequence(criticalEventSeq);
  const String eventUuid = buildCriticalEventUuid("sos_pressed", eventSequence, millis());
  const String payload = buildEventPayload("sos_pressed",
                                           accelMagnitude,
                                           gyroMagnitude,
                                           false,
                                           eventUuid,
                                           eventSequence,
                                           sensorSampleSeq);
  const String topic = DeviceSettings::buildTopic(runtimeConfig(), "events");
  const bool published = publishCriticalEvent(topic, payload, "sos_pressed", eventUuid);
  if (AppConfig::FIRMWARE_MQTT_DIAGNOSTIC_ENABLED) {
    AppLog::warnf("[event] publish %s topic=%s type=sos_pressed event_uuid=%s sample_seq=%lu bytes=%u\n",
                  published ? "ok" : "queued",
                  topic.c_str(),
                  eventUuid.c_str(),
                  static_cast<unsigned long>(sensorSampleSeq),
                  static_cast<unsigned>(payload.length()));
  }
  triggerConfiguredAlertBuzzer("sos_pressed", 4);
}

void publishPeriodicStatus() {
  const String payload = buildStatusPayload();
  const String topic = DeviceSettings::buildTopic(runtimeConfig(), "status");
  if (AppConfig::FIRMWARE_CONNECTIVITY_DEBUG_ENABLED) {
    AppLog::debugf("Publicando status MQTT em %s\n", topic.c_str());
  }
  const bool published = mqttClient.publish(topic, payload, false);
  if (AppConfig::FIRMWARE_MQTT_DIAGNOSTIC_ENABLED) {
    const bool sensorSampleFresh = hasFreshSensorSample(millis());
    AppLog::infof("[status] publish %s topic=%s bytes=%u mqtt_connected=%u sensor_ready=%u sensor_valid=%u sensor_read_ok=%u buffered_events=%u\n",
                  published ? "ok" : "skipped",
                  topic.c_str(),
                  static_cast<unsigned>(payload.length()),
                  mqttClient.isConnected() ? 1U : 0U,
                  sensorReady ? 1U : 0U,
                  sensorSampleFresh ? 1U : 0U,
                  lastSensorReadSucceeded ? 1U : 0U,
                  static_cast<unsigned>(eventBuffer.size()));
  }
}

void logTelemetrySkipped(const char* reason, unsigned long nowMs) {
  if (!AppConfig::FIRMWARE_MQTT_DIAGNOSTIC_ENABLED &&
      !AppConfig::FIRMWARE_TELEMETRY_DIAGNOSTIC_ENABLED) {
    return;
  }

  if (lastTelemetrySkipLogAtMs > 0U &&
      (nowMs - lastTelemetrySkipLogAtMs) <
          AppConfig::FIRMWARE_TELEMETRY_SKIP_LOG_INTERVAL_MS) {
    return;
  }

  lastTelemetrySkipLogAtMs = nowMs;
  const String topic = DeviceSettings::buildTopic(runtimeConfig(), "telemetry");
  AppLog::warnf("[telemetry] skipped reason=%s topic=%s mqtt_connected=%u sensor_ready=%u latest_valid=%u sensor_valid=%u sensor_read_ok=%u sample_age_ms=%lu failures=%lu i2c_errors=%lu recoveries=%lu last_error=%s\n",
                reason,
                topic.c_str(),
                mqttClient.isConnected() ? 1U : 0U,
                sensorReady ? 1U : 0U,
                latestReading.valid ? 1U : 0U,
                hasFreshSensorSample(nowMs) ? 1U : 0U,
                lastSensorReadSucceeded ? 1U : 0U,
                latestSensorSampleAgeMs(nowMs),
                sensor.consecutiveFailureCount(),
                sensor.totalI2cErrorCount(),
                sensor.i2cRecoveryCount(),
                sensor.lastI2cError());
}

void publishPeriodicTelemetry(unsigned long nowMs) {
  if (!mqttClient.isConnected()) {
    logTelemetrySkipped("mqtt_disconnected", nowMs);
    return;
  }

  if (!sensorReady) {
    logTelemetrySkipped("sensor_not_ready", nowMs);
    return;
  }

  if (!latestReading.valid) {
    logTelemetrySkipped("no_valid_sample", nowMs);
    return;
  }

  if (!hasFreshSensorSample(nowMs)) {
    logTelemetrySkipped("stale_sample", nowMs);
    return;
  }

  // Telemetria continua nao entra no buffer local para nao competir com alertas.
  const String topic = DeviceSettings::buildTopic(runtimeConfig(), "telemetry");
  const String payload = buildTelemetryPayload();
  const bool published = mqttClient.publish(topic, payload, false);

  if (AppConfig::FIRMWARE_MQTT_DIAGNOSTIC_ENABLED ||
      AppConfig::FIRMWARE_TELEMETRY_DIAGNOSTIC_ENABLED) {
    const unsigned long sampleAgeMs = latestSensorSampleAgeMs(nowMs);
    const bool sensorSampleFresh = hasFreshSensorSample(nowMs);
    if (published) {
      AppLog::infof("[telemetry] publish ok topic=%s bytes=%u sample_age_ms=%lu sensor_valid=%u sensor_read_ok=%u i2c_errors=%lu recoveries=%lu accel_magnitude=%.2f gyro_magnitude=%.2f\n",
                    topic.c_str(),
                    static_cast<unsigned>(payload.length()),
                    sampleAgeMs,
                    sensorSampleFresh ? 1U : 0U,
                    lastSensorReadSucceeded ? 1U : 0U,
                    sensor.totalI2cErrorCount(),
                    sensor.i2cRecoveryCount(),
                    latestReading.accelMagnitudeG,
                    latestReading.gyroMagnitudeDegPerSec);
    } else {
      AppLog::warnf("[telemetry] skipped reason=publish_failed topic=%s bytes=%u mqtt_state=%d sample_age_ms=%lu sensor_valid=%u\n",
                    topic.c_str(),
                    static_cast<unsigned>(payload.length()),
                    mqttClient.currentStateCode(),
                    sampleAgeMs,
                    sensorSampleFresh ? 1U : 0U);
    }
  }
}

void maybeSyncPatientProfile(unsigned long nowMs) {
  DeviceSettings::DeviceConfig& config = connectivityManager.mutableConfig();
  if (!connectivityManager.isOnline() ||
      !DeviceSettings::hasValidBackendApiBaseUrl(config) ||
      !DeviceSettings::hasDeviceSyncToken(config)) {
    return;
  }

  const unsigned long syncInterval =
      lastPatientProfileSyncSucceeded ? AppConfig::DEVICE_PROFILE_SYNC_INTERVAL_MS
                                      : AppConfig::DEVICE_PROFILE_SYNC_RETRY_INTERVAL_MS;
  if (lastPatientProfileSyncAttemptAtMs > 0U &&
      (nowMs - lastPatientProfileSyncAttemptAtMs) < syncInterval) {
    return;
  }

  lastPatientProfileSyncAttemptAtMs = nowMs;
  const PatientProfileClient::SyncOutcome outcome =
      PatientProfileClient::syncPatientProfile(config, configStore);
  lastPatientProfileSyncSucceeded = outcome.success;

  if (outcome.message.isEmpty()) {
    return;
  }

  if (outcome.success) {
    AppLog::infof("[patient-profile] %s\n", outcome.message.c_str());
    if (!config.patientProfile.patientName.isEmpty()) {
      AppLog::infof("[patient-profile] Paciente atual: %s\n",
                    config.patientProfile.patientName.c_str());
    }
  } else {
    AppLog::warnf("[patient-profile] %s\n", outcome.message.c_str());
  }
}

void maybePersistBufferedEvents(unsigned long nowMs) {
  if (!AppConfig::EVENT_BUFFER_PERSISTENCE_ENABLED || !eventBuffer.isDirty()) {
    return;
  }

  if (lastEventBufferPersistAtMs > 0U &&
      (nowMs - lastEventBufferPersistAtMs) < AppConfig::EVENT_BUFFER_PERSIST_INTERVAL_MS) {
    return;
  }

  if (persistCriticalEventSnapshot(nowMs)) {
    if (AppConfig::FIRMWARE_EVENT_BUFFER_DEBUG_ENABLED) {
      BufferedEvent snapshot[AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY];
      const size_t snapshotCount =
          buildCriticalEventSnapshot(snapshot, AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY);
      AppLog::debugf("Snapshot do buffer critico salvo em NVS com %u evento(s).\n",
                     static_cast<unsigned>(snapshotCount));
    }
  }
}

void restoreBufferedEventsFromStore() {
  if (!AppConfig::EVENT_BUFFER_PERSISTENCE_ENABLED) {
    return;
  }

  BufferedEvent persistedEvents[AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY];
  const size_t restoredCount =
      configStore.loadPendingEvents(persistedEvents, AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY);

  if (restoredCount == 0U) {
    return;
  }

  eventBuffer.restoreFrom(persistedEvents, restoredCount);
  eventBuffer.markPersisted();
  AppLog::warnf("Restaurados %u evento(s) critico(s) pendente(s) apos reboot.\n",
                static_cast<unsigned>(restoredCount));
}

void holdDisabledBuzzerInactive() {
  if (AppConfig::BUZZER_ENABLED) {
    return;
  }

  pinMode(AppConfig::BUZZER_PIN, OUTPUT);
  digitalWrite(AppConfig::BUZZER_PIN,
               AppConfig::BUZZER_ACTIVE_HIGH ? LOW : HIGH);
  AppLog::info("Buzzer desabilitado por padrao; GPIO mantido em repouso conforme BUZZER_ACTIVE_HIGH.");
}

void logMqttRuntimeContextIfNeeded() {
  if (!AppConfig::FIRMWARE_CONNECTIVITY_DEBUG_ENABLED &&
      !AppConfig::FIRMWARE_MQTT_DIAGNOSTIC_ENABLED) {
    return;
  }

  if (!mqttClient.isConnected()) {
    mqttRuntimeContextLogged = false;
    return;
  }

  if (mqttRuntimeContextLogged) {
    return;
  }

  mqttRuntimeContextLogged = true;
  AppLog::infof("[mqtt] runtime deviceId=%s clientId=%s\n",
                DeviceSettings::effectiveDeviceId(runtimeConfig()).c_str(),
                DeviceSettings::effectiveMqttClientId(runtimeConfig()).c_str());
  AppLog::infof("[mqtt] topic status=%s\n",
                DeviceSettings::buildTopic(runtimeConfig(), "status").c_str());
  AppLog::infof("[mqtt] topic telemetry=%s\n",
                DeviceSettings::buildTopic(runtimeConfig(), "telemetry").c_str());
  AppLog::infof("[mqtt] topic events=%s\n",
                DeviceSettings::buildTopic(runtimeConfig(), "events").c_str());
}

void logSensorReadOkIfDue(const SensorReading& reading, unsigned long nowMs) {
  if (!AppConfig::FIRMWARE_SENSOR_HEALTH_LOG_ENABLED &&
      !AppConfig::FIRMWARE_SENSOR_DIAGNOSTIC_ENABLED) {
    return;
  }

  if (lastSensorHealthLogAtMs > 0U &&
      (nowMs - lastSensorHealthLogAtMs) <
          AppConfig::FIRMWARE_SENSOR_HEALTH_LOG_INTERVAL_MS) {
    return;
  }

  lastSensorHealthLogAtMs = nowMs;
  AppLog::infof("[sensor] read ok raw ax=%d ay=%d az=%d gx=%d gy=%d gz=%d | g ax=%.2f ay=%.2f az=%.2f raw_magnitude_g=%.2f corrected_magnitude_g=%.2f filtered_magnitude_g=%.2f gyro=%.2f\n",
                reading.rawAccelX,
                reading.rawAccelY,
                reading.rawAccelZ,
                reading.rawGyroX,
                reading.rawGyroY,
                reading.rawGyroZ,
                reading.accelXG,
                reading.accelYG,
                reading.accelZG,
                reading.rawAccelMagnitudeG,
                reading.correctedAccelMagnitudeG,
                reading.accelMagnitudeG,
                reading.gyroMagnitudeDegPerSec);
}

void logSensorReadFailedIfDue(unsigned long nowMs) {
  if (!AppConfig::FIRMWARE_SENSOR_HEALTH_LOG_ENABLED &&
      !AppConfig::FIRMWARE_SENSOR_DIAGNOSTIC_ENABLED) {
    return;
  }

  if (lastSensorHealthLogAtMs > 0U &&
      (nowMs - lastSensorHealthLogAtMs) <
          AppConfig::FIRMWARE_SENSOR_HEALTH_LOG_INTERVAL_MS) {
    return;
  }

  lastSensorHealthLogAtMs = nowMs;
  AppLog::warnf("[sensor] read failed reason=%s consecutive_failures=%lu total_i2c_errors=%lu recoveries=%lu last_valid=%u\n",
                sensor.lastI2cError(),
                consecutiveSensorReadFailures,
                sensor.totalI2cErrorCount(),
                sensor.i2cRecoveryCount(),
                latestReading.valid ? 1U : 0U);
}

void retrySensorBeginIfDue(unsigned long nowMs) {
  if (sensorReady) {
    return;
  }

  if (lastSensorBeginRetryAtMs > 0U &&
      (nowMs - lastSensorBeginRetryAtMs) < AppConfig::SENSOR_BEGIN_RETRY_INTERVAL_MS) {
    return;
  }

  lastSensorBeginRetryAtMs = nowMs;
  AppLog::warnf("[sensor] begin retry reason=sensor_not_ready last_error=%s interval_ms=%lu\n",
                sensor.lastI2cError(),
                AppConfig::SENSOR_BEGIN_RETRY_INTERVAL_MS);

  sensorReady = sensor.begin();
  lastSensorReadSucceeded = false;
  consecutiveSensorReadFailures = sensor.consecutiveFailureCount();
  latestReading = SensorReading();

  if (sensorReady) {
    AppLog::infof("[sensor] begin retry ok address=0x%02X who_am_i=0x%02X model=%s accel=+-%ug gyro=+-%udps\n",
                  sensor.activeAddress(),
                  sensor.whoAmI(),
                  sensor.detectedModelName(),
                  static_cast<unsigned>(sensor.accelRangeG()),
                  static_cast<unsigned>(sensor.gyroRangeDegPerSec()));
    return;
  }

  AppLog::warnf("[sensor] begin retry failed address=0x%02X who_am_i=0x%02X last_error=%s\n",
                sensor.activeAddress(),
                sensor.whoAmI(),
                sensor.lastI2cError());
}

void logLoopHealthIfDue(unsigned long nowMs) {
  if (!AppConfig::FIRMWARE_LOOP_HEALTH_LOG_ENABLED) {
    return;
  }

  if (lastLoopHealthLogAtMs > 0U &&
      (nowMs - lastLoopHealthLogAtMs) <
          AppConfig::FIRMWARE_LOOP_HEALTH_LOG_INTERVAL_MS) {
    return;
  }

  lastLoopHealthLogAtMs = nowMs;
  const bool telemetryDue =
      (nowMs - lastTelemetrySentAtMs) >= AppConfig::TELEMETRY_REPORT_INTERVAL_MS;
  const unsigned long sampleAgeMs = latestSensorSampleAgeMs(nowMs);
  const bool sensorSampleFresh = hasFreshSensorSample(nowMs);
  const String telemetryTopic = DeviceSettings::buildTopic(runtimeConfig(), "telemetry");
  AppLog::infof("[loop] maintenance_portal_active=%u state=%s wifi_connected=%u mqtt_connected=%u telemetry_due=%u sensor_ready=%u latest_valid=%u sensor_valid=%u sensor_read_ok=%u sample_age_ms=%lu telemetry_topic=%s i2c_errors=%lu recoveries=%lu\n",
                setupPortal.isRunning() && !connectivityManager.isSetupMode() ? 1U : 0U,
                connectivityManager.stateLabel().c_str(),
                connectivityManager.isWifiConnected() ? 1U : 0U,
                mqttClient.isConnected() ? 1U : 0U,
                telemetryDue ? 1U : 0U,
                sensorReady ? 1U : 0U,
                latestReading.valid ? 1U : 0U,
                sensorSampleFresh ? 1U : 0U,
                lastSensorReadSucceeded ? 1U : 0U,
                sampleAgeMs,
                telemetryTopic.c_str(),
                sensor.totalI2cErrorCount(),
                sensor.i2cRecoveryCount());
}

void printSensorReading(const SensorReading& reading) {
  Serial.printf("RAW ax=%d ay=%d az=%d gx=%d gy=%d gz=%d | ",
                reading.rawAccelX,
                reading.rawAccelY,
                reading.rawAccelZ,
                reading.rawGyroX,
                reading.rawGyroY,
                reading.rawGyroZ);
  Serial.printf("ACC[g] x=%+.2f y=%+.2f z=%+.2f | ",
                reading.accelXG,
                reading.accelYG,
                reading.accelZG);
  Serial.printf("GYR[dps] x=%+.1f y=%+.1f z=%+.1f | ",
                reading.gyroXDegPerSec,
                reading.gyroYDegPerSec,
                reading.gyroZDegPerSec);
  Serial.printf("MAG a=%.2f g=%.1f | ANG pitch=%+.1f roll=%+.1f\n",
                reading.accelMagnitudeG,
                reading.gyroMagnitudeDegPerSec,
                reading.pitchDeg,
                reading.rollDeg);
}

bool shouldTriggerMotionTest(const SensorReading& reading) {
  const bool accelTriggered =
      reading.accelMagnitudeG >= AppConfig::MOTION_TEST_ACCEL_THRESHOLD_G;
  const bool gyroTriggered =
      reading.gyroMagnitudeDegPerSec >= AppConfig::MOTION_TEST_GYRO_THRESHOLD_DPS;

  return AppConfig::MOTION_TEST_REQUIRE_BOTH_THRESHOLDS
             ? (accelTriggered && gyroTriggered)
             : (accelTriggered || gyroTriggered);
}

bool isMotionTestStable(const SensorReading& reading) {
  return fabsf(reading.accelMagnitudeG - 1.0f) <=
             AppConfig::MOTION_TEST_STILL_ACCEL_TOLERANCE_G &&
         reading.gyroMagnitudeDegPerSec <=
             AppConfig::MOTION_TEST_STILL_GYRO_THRESHOLD_DPS;
}

void handleMotionTest(const SensorReading& reading, unsigned long nowMs) {
  if (!AppConfig::MOTION_TEST_MODE_ENABLED || !AppConfig::BUZZER_ENABLED || !reading.valid) {
    return;
  }

  if (isMotionTestStable(reading)) {
    if (motionTestStableSinceAtMs == 0U) {
      motionTestStableSinceAtMs = nowMs;
    }
  } else {
    motionTestStableSinceAtMs = 0U;
  }

  if (AppConfig::MOTION_TEST_SERIAL_DEBUG_ENABLED &&
      (nowMs - lastMotionTestDebugAtMs) >= AppConfig::SERIAL_SENSOR_DEBUG_INTERVAL_MS) {
    lastMotionTestDebugAtMs = nowMs;
    const unsigned long stableForMs =
        motionTestStableSinceAtMs == 0U ? 0U : (nowMs - motionTestStableSinceAtMs);
    Serial.printf("[motion-test] accel=%.2f g | gyro=%.1f dps | armado=%s | repouso=%lums | limiares accel>=%.2f gyro>=%.1f\n",
                  reading.accelMagnitudeG,
                  reading.gyroMagnitudeDegPerSec,
                  stableForMs >= AppConfig::MOTION_TEST_ARM_AFTER_STILLNESS_MS ? "sim" : "nao",
                  stableForMs,
                  AppConfig::MOTION_TEST_ACCEL_THRESHOLD_G,
                  AppConfig::MOTION_TEST_GYRO_THRESHOLD_DPS);
  }

  if ((nowMs - lastMotionTestTriggerAtMs) < AppConfig::MOTION_TEST_COOLDOWN_MS) {
    return;
  }

  const unsigned long stableForMs =
      motionTestStableSinceAtMs == 0U ? 0U : (nowMs - motionTestStableSinceAtMs);
  if (stableForMs < AppConfig::MOTION_TEST_ARM_AFTER_STILLNESS_MS) {
    return;
  }

  if (!shouldTriggerMotionTest(reading)) {
    return;
  }

  lastMotionTestTriggerAtMs = nowMs;
  motionTestStableSinceAtMs = 0U;
  indicator.triggerPulse(AppConfig::MOTION_TEST_BUZZER_DURATION_MS, "motion_test");

  if (AppConfig::MOTION_TEST_SERIAL_DEBUG_ENABLED) {
    Serial.printf("[motion-test] Movimento brusco detectado | accel=%.2f g | gyro=%.1f dps | estrategia=%s\n",
                  reading.accelMagnitudeG,
                  reading.gyroMagnitudeDegPerSec,
                  AppConfig::MOTION_TEST_REQUIRE_BOTH_THRESHOLDS ? "accel+gyro" : "accel|gyro");
    Serial.printf("[motion-test] Buzzer acionado por %lu ms\n",
                  AppConfig::MOTION_TEST_BUZZER_DURATION_MS);
  }
}

void logExperimentalAlertSkippedIfDue(const char* reason,
                                      const SensorReading& reading,
                                      unsigned long nowMs) {
  if (!AppConfig::FIRMWARE_MQTT_DIAGNOSTIC_ENABLED) {
    return;
  }

  if (lastExperimentalAlertSkipLogAtMs > 0U &&
      (nowMs - lastExperimentalAlertSkipLogAtMs) < 2000U) {
    return;
  }

  lastExperimentalAlertSkipLogAtMs = nowMs;
  AppLog::warnf("[alert] skipped reason=%s accel=%.2f gyro=%.2f preset=%s cooldown_remaining_ms=%lu sensor_valid=%u events_enabled=%u\n",
                reason,
                reading.accelMagnitudeG,
                reading.gyroMagnitudeDegPerSec,
                runtimeConfig().alertTuning.sensitivityPreset.c_str(),
                lastExperimentalAlertAtMs > 0U &&
                        (nowMs - lastExperimentalAlertAtMs) <
                            runtimeConfig().alertTuning.cooldownMs
                    ? runtimeConfig().alertTuning.cooldownMs -
                          (nowMs - lastExperimentalAlertAtMs)
                    : 0U,
                hasFreshSensorSample(nowMs) ? 1U : 0U,
                runtimeConfig().alertTuning.eventsEnabled ? 1U : 0U);
}

void handleExperimentalAlertDetection(const SensorReading& reading, unsigned long nowMs) {
  if (!reading.valid || !hasFreshSensorSample(nowMs)) {
    return;
  }

  const auto& alertTuning = runtimeConfig().alertTuning;
  const bool accelTriggered = reading.accelMagnitudeG >= alertTuning.accelThresholdG;
  const bool gyroTriggered = reading.gyroMagnitudeDegPerSec >= alertTuning.gyroThresholdDps;

  if (!accelTriggered && !gyroTriggered) {
    return;
  }

  if (!alertTuning.eventsEnabled) {
    logExperimentalAlertSkippedIfDue("events_disabled", reading, nowMs);
    return;
  }

  if (lastExperimentalAlertAtMs > 0U &&
      (nowMs - lastExperimentalAlertAtMs) < alertTuning.cooldownMs) {
    logExperimentalAlertSkippedIfDue("cooldown", reading, nowMs);
    return;
  }

  const bool suspectedFall = accelTriggered && gyroTriggered;
  const char* eventType = suspectedFall ? "fall_suspected" : "movement_detected";
  const char* reason = suspectedFall
                           ? "experimental_threshold_accel_gyro"
                           : (accelTriggered ? "experimental_threshold_accel"
                                             : "experimental_threshold_gyro");
  FallAlert alert = buildExperimentalAlertDecision(reading,
                                                   eventType,
                                                   reason,
                                                   accelTriggered,
                                                   gyroTriggered,
                                                   nowMs);

  lastExperimentalAlertAtMs = nowMs;
  AppLog::warnf("[alert] %s accel=%.2f threshold=%.2f gyro=%.2f threshold=%.1f preset=%s sample_seq=%lu\n",
                eventType,
                reading.accelMagnitudeG,
                alertTuning.accelThresholdG,
                reading.gyroMagnitudeDegPerSec,
                alertTuning.gyroThresholdDps,
                alertTuning.sensitivityPreset.c_str(),
                static_cast<unsigned long>(sensorSampleSeq));
  publishThresholdAlertEvent(eventType, alert, false, suspectedFall ? 4 : 2);
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(100);

  // A ordem de inicializacao prioriza feedback local mesmo antes da rede subir.
  holdDisabledBuzzerInactive();

  indicator.begin(AppConfig::STATUS_LED_PIN,
                  AppConfig::BUZZER_PIN,
                  AppConfig::BUZZER_ACTIVE_HIGH,
                  AppConfig::STATUS_LED_ENABLED,
                  true);
  indicator.setBuzzerEnabled(false);
  indicator.setState(IndicatorState::Booting);

  if (AppConfig::SOS_BUTTON_ENABLED) {
    sosButton.begin(AppConfig::SOS_BUTTON_PIN, true, AppConfig::SOS_HOLD_TIME_MS);
  }
  setupPortal.setBuzzerTestCallback(handlePortalBuzzerTest);

  sensorReady = sensor.begin();
  if (sensorReady) {
    AppLog::infof("[boot] sensor_begin_ok address=0x%02X who_am_i=0x%02X model=%s accel=+-%ug gyro=+-%udps accel_lsb_per_g=%.0f gyro_lsb_per_dps=%.1f calibrated=%u calibration_status=%s sensorReady=1\n",
                  sensor.activeAddress(),
                  sensor.whoAmI(),
                  sensor.detectedModelName(),
                  static_cast<unsigned>(sensor.accelRangeG()),
                  static_cast<unsigned>(sensor.gyroRangeDegPerSec()),
                  sensor.accelLsbPerG(),
                  sensor.gyroLsbPerDegPerSec(),
                  sensor.accelCalibrationApplied() ? 1U : 0U,
                  sensor.calibrationStatus());
    AppLog::info("IMU inicializada com sucesso.");
    if (AppConfig::MOTION_TEST_MODE_ENABLED) {
      AppLog::info("Modo de teste MPU6050 + buzzer habilitado.");
    } else {
      AppLog::info("Modo de teste MPU6050 + buzzer desabilitado por padrao.");
    }
  } else {
    AppLog::errorf("[boot] sensor_begin_failed address=0x%02X who_am_i=0x%02X sensorReady=0 last_error=%s\n",
                   sensor.activeAddress(),
                   sensor.whoAmI(),
                   sensor.lastI2cError());
    AppLog::error("Falha ao inicializar a IMU.");
  }
  AppLog::infof("[boot] sensorReady final=%u\n", sensorReady ? 1U : 0U);

  connectivityManager.begin();
  indicator.setBuzzerEnabled(runtimeConfig().alertTuning.buzzerEnabled);
  AppLog::infof("[buzzer] enabled=%u pin=%u active_high=%u alarm_only=%u source=portal_config\n",
                runtimeConfig().alertTuning.buzzerEnabled ? 1U : 0U,
                AppConfig::BUZZER_PIN,
                AppConfig::BUZZER_ACTIVE_HIGH ? 1U : 0U,
                AppConfig::BUZZER_ALARM_ONLY ? 1U : 0U);
  indicator.triggerPulse(80, "boot_autotest");
  restoreBufferedEventsFromStore();

  lastStatusSentAtMs = millis();
  lastTelemetrySentAtMs = millis();
}

void loop() {
  const unsigned long nowMs = millis();

  // Wi-Fi, MQTT e setup portal sao mantidos por um unico gerente de conectividade.
  connectivityManager.update();
  logMqttRuntimeContextIfNeeded();
  logLoopHealthIfDue(nowMs);
  retrySensorBeginIfDue(nowMs);

  if (sensorReady && (nowMs - lastSensorSampleAtMs) >= AppConfig::SENSOR_SAMPLE_INTERVAL_MS) {
    lastSensorSampleAtMs = nowMs;

    if (sensor.update()) {
      lastSensorReadSucceeded = sensor.lastReadSucceeded();
      consecutiveSensorReadFailures = sensor.consecutiveFailureCount();
      latestReading = sensor.getReading();
      nextMonotonicSequence(sensorSampleSeq);
      fallFeatureExtractor.addSample(latestReading);
      logSensorReadOkIfDue(latestReading, nowMs);

      if (AppConfig::SERIAL_SENSOR_DEBUG_ENABLED &&
          (nowMs - lastSensorDebugAtMs) >= AppConfig::SERIAL_SENSOR_DEBUG_INTERVAL_MS) {
        lastSensorDebugAtMs = nowMs;
        printSensorReading(latestReading);
      }

      handleMotionTest(latestReading, nowMs);
      handleExperimentalAlertDetection(latestReading, nowMs);

      // O detector trabalha sobre a ultima leitura filtrada do sensor.
      FallAlert alert = fallDetector.update(latestReading);
      if (alert.detected) {
        enrichFallAlertWithCurrentWindow(alert, latestReading);
        AppLog::warn("Queda confirmada com imobilidade.");
        publishFallAlert(alert);
      }
    } else {
      lastSensorReadSucceeded = sensor.lastReadSucceeded();
      consecutiveSensorReadFailures = sensor.consecutiveFailureCount();
      logSensorReadFailedIfDue(nowMs);
    }
  }

  if (AppConfig::SOS_BUTTON_ENABLED) {
    sosButton.update();
    if (sosButton.consumePressedEvent()) {
      AppLog::warn("Botao SOS acionado.");
      publishSosAlert();
    }
  }

  if ((nowMs - lastStatusSentAtMs) >= AppConfig::STATUS_REPORT_INTERVAL_MS) {
    lastStatusSentAtMs = nowMs;
    publishPeriodicStatus();
  }

  if ((nowMs - lastTelemetrySentAtMs) >= AppConfig::TELEMETRY_REPORT_INTERVAL_MS) {
    lastTelemetrySentAtMs = nowMs;
    publishPeriodicTelemetry(nowMs);
  }

  maybeSyncPatientProfile(nowMs);

  // Reenvia eventos pendentes em segundo plano quando a conectividade ja voltou.
  flushBufferedEvents();
  maybePersistBufferedEvents(nowMs);

  indicator.setBuzzerEnabled(runtimeConfig().alertTuning.buzzerEnabled);
  indicator.setState(computeIndicatorState());
  indicator.update();

  delay(5);
}
