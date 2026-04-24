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
unsigned long motionTestStableSinceAtMs = 0;
unsigned long lastEventBufferPersistAtMs = 0;
bool lastPatientProfileSyncSucceeded = false;

unsigned long currentTimestampSeconds() {
  const time_t now = time(nullptr);
  // Se o NTP ainda nao sincronizou, usa millis como fallback monotono simples.
  return (now >= 1700000000) ? static_cast<unsigned long>(now) : millis() / 1000UL;
}

int batteryLevelPercent() {
  // Placeholder: trocar por leitura ADC quando houver circuito de bateria.
  return 100;
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

const DeviceSettings::DeviceConfig& runtimeConfig() {
  return connectivityManager.config();
}

String buildEventPayload(const char* eventType,
                         float accelMagnitudeG,
                         float gyroMagnitudeDegPerSec,
                         bool immobilityConfirmed) {
  // Mantem o formato do payload centralizado em um unico ponto.
  StaticJsonDocument<256> doc;
  doc["device_uid"] = DeviceSettings::technicalDeviceUid();
  doc["device_id"] = DeviceSettings::effectiveDeviceId(runtimeConfig());
  doc["event_type"] = eventType;
  doc["timestamp"] = currentTimestampSeconds();
  doc["accel_magnitude"] = accelMagnitudeG;
  doc["gyro_magnitude"] = gyroMagnitudeDegPerSec;
  doc["immobility_confirmed"] = immobilityConfirmed;
  doc["battery_level"] = batteryLevelPercent();

  String payload;
  serializeJson(doc, payload);
  return payload;
}

String buildStatusPayload() {
  // O status periodico carrega telemetria minima para observabilidade do dispositivo.
  StaticJsonDocument<320> doc;
  doc["device_uid"] = DeviceSettings::technicalDeviceUid();
  doc["device_id"] = DeviceSettings::effectiveDeviceId(runtimeConfig());
  doc["event_type"] = "device_status";
  doc["timestamp"] = currentTimestampSeconds();
  doc["accel_magnitude"] = latestReading.accelMagnitudeG;
  doc["gyro_magnitude"] = latestReading.gyroMagnitudeDegPerSec;
  doc["immobility_confirmed"] = false;
  doc["battery_level"] = batteryLevelPercent();
  doc["wifi_rssi"] = connectivityManager.wifiRssi();
  doc["buffered_events"] = eventBuffer.size();

  String payload;
  serializeJson(doc, payload);
  return payload;
}

String buildTelemetryPayload() {
  StaticJsonDocument<320> doc;
  doc["device_uid"] = DeviceSettings::technicalDeviceUid();
  doc["device_id"] = DeviceSettings::effectiveDeviceId(runtimeConfig());
  doc["timestamp"] = currentTimestampSeconds();
  doc["ax"] = latestReading.accelXG;
  doc["ay"] = latestReading.accelYG;
  doc["az"] = latestReading.accelZG;
  doc["gx"] = latestReading.gyroXDegPerSec;
  doc["gy"] = latestReading.gyroYDegPerSec;
  doc["gz"] = latestReading.gyroZDegPerSec;
  doc["accel_magnitude"] = latestReading.accelMagnitudeG;
  doc["gyro_magnitude"] = latestReading.gyroMagnitudeDegPerSec;
  doc["pitch_deg"] = latestReading.pitchDeg;
  doc["roll_deg"] = latestReading.rollDeg;
  doc["battery_level"] = batteryLevelPercent();
  doc["wifi_rssi"] = connectivityManager.wifiRssi();

  String payload;
  serializeJson(doc, payload);
  return payload;
}

void queueOrPublish(const String& topic, const String& payload) {
  if (mqttClient.publish(topic, payload, false)) {
    if (AppConfig::FIRMWARE_EVENT_BUFFER_DEBUG_ENABLED) {
      AppLog::debugf("Evento enviado para %s\n", topic.c_str());
    }
    return;
  }

  // Se a publicacao falhar, o evento entra no buffer local para reenvio posterior.
  eventBuffer.push(topic, payload, millis());

  if (AppConfig::FIRMWARE_EVENT_BUFFER_DEBUG_ENABLED) {
    AppLog::warnf("Sem conectividade, evento armazenado. Buffer: %u/%u\n",
                  static_cast<unsigned>(eventBuffer.size()),
                  static_cast<unsigned>(eventBuffer.capacity()));
  }

  if (AppConfig::EVENT_BUFFER_PERSISTENCE_ENABLED && topic.endsWith("/events")) {
    BufferedEvent snapshot[AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY];
    const size_t snapshotCount =
        buildCriticalEventSnapshot(snapshot, AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY);

    if (configStore.savePendingEvents(snapshot, snapshotCount)) {
      eventBuffer.markPersisted();
      lastEventBufferPersistAtMs = millis();
    }
  }
}

void flushBufferedEvents() {
  if (!mqttClient.isConnected()) {
    return;
  }

  BufferedEvent bufferedEvent;
  size_t flushedCount = 0;

  while (flushedCount < eventBuffer.capacity() && eventBuffer.peek(bufferedEvent)) {
    if (!mqttClient.publish(bufferedEvent.topic, bufferedEvent.payload, false)) {
      break;
    }

    // Remove do buffer somente depois de confirmar que a publicacao foi aceita.
    eventBuffer.pop();
    ++flushedCount;
    mqttClient.update(connectivityManager.isWifiConnected());
    delay(5);
  }

  if (flushedCount > 0U && AppConfig::EVENT_BUFFER_PERSISTENCE_ENABLED) {
    BufferedEvent snapshot[AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY];
    const size_t snapshotCount =
        buildCriticalEventSnapshot(snapshot, AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY);

    if (configStore.savePendingEvents(snapshot, snapshotCount)) {
      eventBuffer.markPersisted();
      lastEventBufferPersistAtMs = millis();
    }
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

void publishFallAlert(const FallAlert& alert) {
  const String payload = buildEventPayload(
      "fall_detected", alert.accelMagnitudeG, alert.gyroMagnitudeDegPerSec, true);
  queueOrPublish(DeviceSettings::buildTopic(runtimeConfig(), "events"), payload);
  indicator.triggerAlarm();
}

void publishSosAlert() {
  const float accelMagnitude = latestReading.valid ? latestReading.accelMagnitudeG : 0.0f;
  const float gyroMagnitude =
      latestReading.valid ? latestReading.gyroMagnitudeDegPerSec : 0.0f;

  const String payload =
      buildEventPayload("sos_pressed", accelMagnitude, gyroMagnitude, false);
  queueOrPublish(DeviceSettings::buildTopic(runtimeConfig(), "events"), payload);
  indicator.triggerAlarm(4);
}

void publishPeriodicStatus() {
  if (!latestReading.valid) {
    return;
  }

  const String payload = buildStatusPayload();
  queueOrPublish(DeviceSettings::buildTopic(runtimeConfig(), "status"), payload);
}

void publishPeriodicTelemetry() {
  if (!latestReading.valid || !mqttClient.isConnected()) {
    return;
  }

  // Telemetria continua nao entra no buffer local para nao competir com alertas.
  const String payload = buildTelemetryPayload();
  mqttClient.publish(DeviceSettings::buildTopic(runtimeConfig(), "telemetry"),
                     payload,
                     false);
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

  BufferedEvent snapshot[AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY];
  const size_t snapshotCount =
      buildCriticalEventSnapshot(snapshot, AppConfig::PERSISTED_EVENT_BUFFER_CAPACITY);

  if (configStore.savePendingEvents(snapshot, snapshotCount)) {
    eventBuffer.markPersisted();
    lastEventBufferPersistAtMs = nowMs;

    if (AppConfig::FIRMWARE_EVENT_BUFFER_DEBUG_ENABLED) {
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

void printSensorReading(const SensorReading& reading) {
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
  indicator.triggerPulse(AppConfig::MOTION_TEST_BUZZER_DURATION_MS);

  if (AppConfig::MOTION_TEST_SERIAL_DEBUG_ENABLED) {
    Serial.printf("[motion-test] Movimento brusco detectado | accel=%.2f g | gyro=%.1f dps | estrategia=%s\n",
                  reading.accelMagnitudeG,
                  reading.gyroMagnitudeDegPerSec,
                  AppConfig::MOTION_TEST_REQUIRE_BOTH_THRESHOLDS ? "accel+gyro" : "accel|gyro");
    Serial.printf("[motion-test] Buzzer acionado por %lu ms\n",
                  AppConfig::MOTION_TEST_BUZZER_DURATION_MS);
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(100);

  // A ordem de inicializacao prioriza feedback local mesmo antes da rede subir.
  if (AppConfig::STATUS_LED_ENABLED || AppConfig::BUZZER_ENABLED) {
    indicator.begin(AppConfig::STATUS_LED_PIN, AppConfig::BUZZER_PIN, AppConfig::BUZZER_ACTIVE_HIGH);
    indicator.setState(IndicatorState::Booting);
  }

  if (AppConfig::SOS_BUTTON_ENABLED) {
    sosButton.begin(AppConfig::SOS_BUTTON_PIN, true, AppConfig::SOS_HOLD_TIME_MS);
  }

  sensorReady = sensor.begin();
  if (sensorReady) {
    AppLog::info("IMU inicializada com sucesso.");
    if (AppConfig::MOTION_TEST_MODE_ENABLED) {
      AppLog::info("Modo de teste MPU6050 + buzzer habilitado.");
    } else {
      AppLog::info("Modo de teste MPU6050 + buzzer desabilitado por padrao.");
    }
  } else {
    AppLog::error("Falha ao inicializar a IMU.");
  }

  connectivityManager.begin();
  restoreBufferedEventsFromStore();

  lastStatusSentAtMs = millis();
  lastTelemetrySentAtMs = millis();
}

void loop() {
  const unsigned long nowMs = millis();

  // Wi-Fi, MQTT e setup portal sao mantidos por um unico gerente de conectividade.
  connectivityManager.update();

  if (sensorReady && (nowMs - lastSensorSampleAtMs) >= AppConfig::SENSOR_SAMPLE_INTERVAL_MS) {
    lastSensorSampleAtMs = nowMs;

    if (sensor.update()) {
      latestReading = sensor.getReading();

      if (AppConfig::SERIAL_SENSOR_DEBUG_ENABLED &&
          (nowMs - lastSensorDebugAtMs) >= AppConfig::SERIAL_SENSOR_DEBUG_INTERVAL_MS) {
        lastSensorDebugAtMs = nowMs;
        printSensorReading(latestReading);
      }

      handleMotionTest(latestReading, nowMs);

      // O detector trabalha sobre a ultima leitura filtrada do sensor.
      const FallAlert alert = fallDetector.update(latestReading);
      if (alert.detected) {
        AppLog::warn("Queda confirmada com imobilidade.");
        publishFallAlert(alert);
      }
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
    publishPeriodicTelemetry();
  }

  maybeSyncPatientProfile(nowMs);

  // Reenvia eventos pendentes em segundo plano quando a conectividade ja voltou.
  flushBufferedEvents();
  maybePersistBufferedEvents(nowMs);

  if (AppConfig::STATUS_LED_ENABLED || AppConfig::BUZZER_ENABLED) {
    indicator.setState(computeIndicatorState());
    indicator.update();
  }

  delay(5);
}
