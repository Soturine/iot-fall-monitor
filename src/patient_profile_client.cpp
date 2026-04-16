#include "patient_profile_client.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>

namespace {

constexpr size_t kPatientProfileObjectCapacity = JSON_OBJECT_SIZE(5);
constexpr size_t kClaimResponseFilterCapacity =
    JSON_OBJECT_SIZE(2) + kPatientProfileObjectCapacity;
constexpr size_t kClaimResponseCapacity =
    JSON_OBJECT_SIZE(2) + kPatientProfileObjectCapacity + 384;
constexpr size_t kProfileSyncFilterCapacity =
    JSON_OBJECT_SIZE(1) + kPatientProfileObjectCapacity;
constexpr size_t kProfileSyncResponseCapacity =
    JSON_OBJECT_SIZE(1) + kPatientProfileObjectCapacity + 320;

void setErrorMessage(String* errorMessage, const String& message) {
  if (errorMessage != nullptr) {
    *errorMessage = message;
  }
}

void configurePatientProfileFilter(JsonObject filter) {
  filter["patientName"] = true;
  filter["weightKg"] = true;
  filter["heightCm"] = true;
  filter["fallSensitivityPreset"] = true;
  filter["syncedAt"] = true;
}

bool loadPatientProfileFromJson(JsonVariantConst source,
                                DeviceSettings::PatientProfileSummary& profile,
                                String* errorMessage) {
  if (source.isNull() || !source.is<JsonObjectConst>()) {
    setErrorMessage(errorMessage,
                    "Resposta do backend nao trouxe um patientProfile valido.");
    return false;
  }

  DeviceSettings::PatientProfileSummary parsed;
  parsed.patientName =
      source["patientName"].is<const char*>() ? String(source["patientName"].as<const char*>()) : "";
  parsed.hasWeightKg = source["weightKg"].is<float>() || source["weightKg"].is<double>() ||
                       source["weightKg"].is<long>() || source["weightKg"].is<int>();
  if (parsed.hasWeightKg) {
    parsed.weightKg = source["weightKg"].as<float>();
  }

  parsed.hasHeightCm = source["heightCm"].is<float>() || source["heightCm"].is<double>() ||
                       source["heightCm"].is<long>() || source["heightCm"].is<int>();
  if (parsed.hasHeightCm) {
    parsed.heightCm = source["heightCm"].as<float>();
  }

  parsed.fallSensitivityPreset =
      source["fallSensitivityPreset"].is<const char*>()
          ? String(source["fallSensitivityPreset"].as<const char*>())
          : "";
  parsed.syncedAt =
      source["syncedAt"].is<const char*>() ? String(source["syncedAt"].as<const char*>()) : "";

  profile = parsed;
  return true;
}

bool persistIfChanged(DeviceSettings::DeviceConfig& config,
                      ConfigStore& configStore,
                      const String& nextDeviceSyncToken,
                      const DeviceSettings::PatientProfileSummary& nextProfile,
                      bool saveToken,
                      String* errorMessage) {
  const bool tokenChanged = saveToken && config.deviceSyncToken != nextDeviceSyncToken;
  const bool profileChanged =
      !DeviceSettings::patientProfileEquals(config.patientProfile, nextProfile);

  if (!tokenChanged && !profileChanged) {
    return false;
  }

  if (saveToken) {
    config.deviceSyncToken = nextDeviceSyncToken;
  }
  config.patientProfile = nextProfile;

  if (!configStore.save(config)) {
    setErrorMessage(errorMessage,
                    "Nao foi possivel persistir o perfil resumido do paciente em NVS.");
    return false;
  }

  return true;
}

}  // namespace

namespace PatientProfileClient {

bool applyClaimResponse(DeviceSettings::DeviceConfig& config,
                        const String& responseBody,
                        String* errorMessage) {
  StaticJsonDocument<kClaimResponseFilterCapacity> filter;
  filter["deviceSyncToken"] = true;
  configurePatientProfileFilter(filter.createNestedObject("patientProfile"));

  DynamicJsonDocument doc(kClaimResponseCapacity);
  const DeserializationError jsonError =
      deserializeJson(doc, responseBody, DeserializationOption::Filter(filter));
  if (jsonError) {
    setErrorMessage(errorMessage,
                    "Pareamento confirmado, mas a resposta JSON nao pode ser interpretada.");
    return false;
  }

  if (!doc["deviceSyncToken"].is<const char*>()) {
    setErrorMessage(errorMessage,
                    "Pareamento confirmado, mas o backend nao retornou deviceSyncToken.");
    return false;
  }

  DeviceSettings::PatientProfileSummary profile;
  if (!loadPatientProfileFromJson(doc["patientProfile"], profile, errorMessage)) {
    return false;
  }

  config.deviceSyncToken = String(doc["deviceSyncToken"].as<const char*>());
  config.patientProfile = profile;
  return true;
}

SyncOutcome syncPatientProfile(DeviceSettings::DeviceConfig& config,
                               ConfigStore& configStore) {
  SyncOutcome outcome;
  outcome.attempted = true;

  if (!DeviceSettings::hasValidBackendApiBaseUrl(config)) {
    outcome.message = "Backend API base URL invalida para sincronizar o perfil do paciente.";
    return outcome;
  }

  if (!DeviceSettings::hasDeviceSyncToken(config)) {
    outcome.message = "Este ESP32 ainda nao recebeu um deviceSyncToken do backend.";
    return outcome;
  }

  HTTPClient httpClient;
  const String endpoint =
      DeviceSettings::effectiveBackendApiBaseUrl(config) + "/api/pairing/device-profile-sync";

  if (!httpClient.begin(endpoint)) {
    outcome.message = "Nao foi possivel abrir a conexao HTTP para sincronizar o perfil.";
    return outcome;
  }

  StaticJsonDocument<320> payloadDoc;
  payloadDoc["device_uid"] = DeviceSettings::technicalDeviceUid();
  payloadDoc["device_id"] = DeviceSettings::effectiveDeviceId(config);
  payloadDoc["device_sync_token"] = config.deviceSyncToken;

  String payload;
  serializeJson(payloadDoc, payload);

  httpClient.addHeader("Content-Type", "application/json");
  const int httpStatus = httpClient.POST(payload);
  const String responseBody = httpClient.getString();
  httpClient.end();

  outcome.httpStatus = httpStatus;

  if (httpStatus < 200 || httpStatus >= 300) {
    outcome.message =
        "Sincronizacao do perfil falhou. Backend respondeu HTTP " + String(httpStatus) + ".";
    if (!responseBody.isEmpty()) {
      outcome.message += " Resposta: " + responseBody;
    }
    return outcome;
  }

  StaticJsonDocument<kProfileSyncFilterCapacity> filter;
  configurePatientProfileFilter(filter.createNestedObject("patientProfile"));

  DynamicJsonDocument doc(kProfileSyncResponseCapacity);
  const DeserializationError jsonError =
      deserializeJson(doc, responseBody, DeserializationOption::Filter(filter));
  if (jsonError) {
    outcome.message = "Backend respondeu, mas o JSON do perfil nao pode ser lido.";
    return outcome;
  }

  DeviceSettings::PatientProfileSummary nextProfile;
  if (!loadPatientProfileFromJson(doc["patientProfile"], nextProfile, &outcome.message)) {
    return outcome;
  }

  outcome.persisted =
      persistIfChanged(config, configStore, config.deviceSyncToken, nextProfile, false, &outcome.message);
  if (outcome.message.isEmpty()) {
    outcome.message = outcome.persisted
                          ? "Perfil resumido do paciente sincronizado e salvo em NVS."
                          : "Perfil resumido do paciente ja estava atualizado.";
  }
  outcome.success = true;
  return outcome;
}

}  // namespace PatientProfileClient
