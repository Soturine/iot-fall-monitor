#pragma once

#include <Arduino.h>

namespace AppConfig {

// Niveis simples de log para controlar a verbosidade serial sem remover diagnostico.
constexpr uint8_t LOG_LEVEL_ERROR = 0;
constexpr uint8_t LOG_LEVEL_WARN = 1;
constexpr uint8_t LOG_LEVEL_INFO = 2;
constexpr uint8_t LOG_LEVEL_DEBUG = 3;
constexpr uint8_t FIRMWARE_LOG_LEVEL = LOG_LEVEL_INFO;
constexpr bool FIRMWARE_I2C_DEBUG_ENABLED = false;
constexpr bool FIRMWARE_CONNECTIVITY_DEBUG_ENABLED = false;
constexpr bool FIRMWARE_EVENT_BUFFER_DEBUG_ENABLED = false;

// Defaults de conectividade e identidade.
// Agora estes valores servem como fallback de fabrica e referencia inicial.
// O portal de configuracao persiste novos valores em NVS sem recompilar o firmware.
// Para ESP32 real, nunca use localhost como broker MQTT. Use IP real do notebook
// na rede atual ou um broker externo acessivel pela mesma rede do dispositivo.
constexpr char DEFAULT_DEVICE_ID[] = "esp32_01";
constexpr char DEFAULT_WIFI_SSID[] = "YOUR_WIFI_SSID";
constexpr char DEFAULT_WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
constexpr char DEFAULT_MQTT_HOST[] = "broker.hivemq.com";
constexpr uint16_t DEFAULT_MQTT_PORT = 1883;
constexpr char DEFAULT_MQTT_USERNAME[] = "";
constexpr char DEFAULT_MQTT_PASSWORD[] = "";
constexpr char DEFAULT_MQTT_CLIENT_ID[] = "esp32_01_client";
constexpr char DEFAULT_BACKEND_API_BASE_URL[] = "";
constexpr bool DEFAULT_MQTT_USE_TLS = false;
constexpr bool DEFAULT_MQTT_TLS_INSECURE = false;
constexpr char DEFAULT_MQTT_TLS_CA_CERT[] = "";
// Os topicos reais continuam no formato queda/devices/{deviceId}/{canal}.
// O deviceId e lido da configuracao persistida e os topicos sao montados em runtime.
constexpr char DEFAULT_MQTT_TOPIC_BASE[] = "queda/devices";

// Aliases legados mantidos como referencia para codigo auxiliar e transicao.
constexpr const char* DEVICE_ID = DEFAULT_DEVICE_ID;
constexpr const char* WIFI_SSID = DEFAULT_WIFI_SSID;
constexpr const char* WIFI_PASSWORD = DEFAULT_WIFI_PASSWORD;
constexpr const char* MQTT_HOST = DEFAULT_MQTT_HOST;
constexpr uint16_t MQTT_PORT = DEFAULT_MQTT_PORT;
constexpr const char* MQTT_USERNAME = DEFAULT_MQTT_USERNAME;
constexpr const char* MQTT_PASSWORD = DEFAULT_MQTT_PASSWORD;
constexpr const char* MQTT_CLIENT_ID = DEFAULT_MQTT_CLIENT_ID;

// Parametros do portal local de configuracao.
constexpr size_t MAX_WIFI_NETWORKS = 5;
constexpr char SETUP_AP_SSID_PREFIX[] = "Queda-Setup";
// AP aberto para facilitar captive portal e setup rapido no celular.
constexpr char SETUP_AP_PASSWORD[] = "";
// Use apenas para bancada quando quiser forcar o portal local no boot.
// Com true, o ESP32 entra direto em SETUP_MODE sem depender de falha de Wi-Fi/MQTT.
constexpr bool FORCE_SETUP_MODE_ON_BOOT = false;
constexpr char SETUP_PORTAL_LOCAL_URL[] = "http://setup.queda";
constexpr char SETUP_PORTAL_IP[] = "http://192.168.4.1";
constexpr unsigned long WIFI_PROFILE_CONNECT_TIMEOUT_MS = 12000;
constexpr uint8_t WIFI_FULL_CYCLES_BEFORE_SETUP = 1;
constexpr unsigned long MQTT_SETUP_FALLBACK_TIMEOUT_MS = 30000;
constexpr uint8_t MQTT_SETUP_FALLBACK_ATTEMPTS = 6;
constexpr unsigned long SETUP_RESTART_DELAY_MS = 1500;
constexpr unsigned long WIFI_SCAN_REFRESH_INTERVAL_MS = 30000;
constexpr unsigned long DEVICE_PROFILE_SYNC_INTERVAL_MS = 120000;
constexpr unsigned long DEVICE_PROFILE_SYNC_RETRY_INTERVAL_MS = 30000;

// Sincronizacao de horario.
constexpr char NTP_SERVER_PRIMARY[] = "pool.ntp.org";
constexpr char NTP_SERVER_SECONDARY[] = "time.nist.gov";
constexpr long GMT_OFFSET_SECONDS = 0;
constexpr int DAYLIGHT_OFFSET_SECONDS = 0;

// Hardware e pinos principais.
// Sugestao de pinos para ESP32 DevKit / ESP32-WROOM-32.
constexpr uint8_t I2C_SDA_PIN = 21;
constexpr uint8_t I2C_SCL_PIN = 22;
constexpr bool SOS_BUTTON_ENABLED = false;
constexpr uint8_t SOS_BUTTON_PIN = 27;
constexpr bool BUZZER_ENABLED = true;
constexpr uint8_t BUZZER_PIN = 25;
constexpr bool BUZZER_ACTIVE_HIGH = true;
constexpr bool STATUS_LED_ENABLED = false;
// Evita GPIO2 por ser pino de strapping/boot no ESP32.
constexpr uint8_t STATUS_LED_PIN = 26;

// Modo de teste de bancada para validar MPU6050 + buzzer.
// Mantemos desabilitado por padrao para nao misturar bancada com alarme real.
// Quando habilitado manualmente, um movimento brusco acima dos thresholds abaixo gera um beep curto.
// Isso nao substitui a logica real de deteccao de queda.
constexpr bool MOTION_TEST_MODE_ENABLED = false;
constexpr bool MOTION_TEST_SERIAL_DEBUG_ENABLED = false;
// Quando true, accel e gyro precisam ultrapassar o limiar juntos.
// Isso reduz falsos disparos por vibracao ou ruído isolado do giroscopio.
constexpr bool MOTION_TEST_REQUIRE_BOTH_THRESHOLDS = true;
// O motion test so arma depois de alguns milissegundos de relativa estabilidade.
// Isso ajuda a testar "movimento brusco a partir do repouso" em vez de apitos intermitentes.
constexpr unsigned long MOTION_TEST_ARM_AFTER_STILLNESS_MS = 700;
constexpr float MOTION_TEST_STILL_ACCEL_TOLERANCE_G = 0.12f;
constexpr float MOTION_TEST_STILL_GYRO_THRESHOLD_DPS = 12.0f;
constexpr float MOTION_TEST_ACCEL_THRESHOLD_G = 2.10f;
constexpr float MOTION_TEST_GYRO_THRESHOLD_DPS = 140.0f;
constexpr unsigned long MOTION_TEST_BUZZER_DURATION_MS = 180;
constexpr unsigned long MOTION_TEST_COOLDOWN_MS = 1200;

// Intervalos principais do firmware.
constexpr unsigned long SENSOR_SAMPLE_INTERVAL_MS = 50;
constexpr bool SERIAL_SENSOR_DEBUG_ENABLED = true;
constexpr unsigned long SERIAL_SENSOR_DEBUG_INTERVAL_MS = 250;
constexpr unsigned long STATUS_REPORT_INTERVAL_MS = 60000;
constexpr unsigned long TELEMETRY_REPORT_INTERVAL_MS = 2000;
constexpr unsigned long MQTT_RECONNECT_INTERVAL_MS = 5000;
constexpr unsigned long SOS_HOLD_TIME_MS = 1500;

// Buffer local para eventos criticos.
constexpr size_t EVENT_BUFFER_CAPACITY = 10;
constexpr bool EVENT_BUFFER_PERSISTENCE_ENABLED = true;
constexpr size_t PERSISTED_EVENT_BUFFER_CAPACITY = 4;
constexpr unsigned long EVENT_BUFFER_PERSIST_INTERVAL_MS = 1500;

// Suavizacao do sinal.
constexpr float ACCEL_FILTER_ALPHA = 0.75f;
constexpr float GYRO_FILTER_ALPHA = 0.75f;

// Thresholds do fall detector.
constexpr float IMPACT_THRESHOLD_G = 2.2f;
constexpr float IMPACT_GYRO_THRESHOLD_DPS = 120.0f;
constexpr float ORIENTATION_CHANGE_THRESHOLD_DEG = 45.0f;
constexpr float IMMOBILE_ACCEL_TOLERANCE_G = 0.15f;
constexpr float IMMOBILE_GYRO_THRESHOLD_DPS = 15.0f;

// Janelas de confirmacao do detector.
constexpr unsigned long ORIENTATION_WINDOW_MS = 1500;
constexpr unsigned long IMMOBILITY_WINDOW_MS = 4000;
constexpr unsigned long REQUIRED_IMMOBILITY_MS = 2000;

}  // namespace AppConfig
