#include "setup_portal.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>

#include "app_logging.h"
#include "patient_profile_client.h"

namespace {

constexpr byte kDnsPort = 53;
constexpr char kPortalHostUrl[] = "http://setup.queda/";

uint16_t parsePortOrDefault(const String& value, uint16_t fallback) {
  const long parsed = value.toInt();
  if (parsed <= 0 || parsed > 65535) {
    return fallback;
  }

  return static_cast<uint16_t>(parsed);
}

String readJsonStringMember(const JsonVariantConst& value) {
  if (!value.is<const char*>()) {
    return "";
  }

  return String(value.as<const char*>());
}

String extractBackendErrorCode(const String& responseBody) {
  if (responseBody.isEmpty()) {
    return "";
  }

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, responseBody) != DeserializationError::Ok) {
    return "";
  }

  const String detailsCode = readJsonStringMember(doc["details"]["code"]);
  if (!detailsCode.isEmpty()) {
    return detailsCode;
  }

  const String errorCode = readJsonStringMember(doc["error"]["code"]);
  if (!errorCode.isEmpty()) {
    return errorCode;
  }

  return readJsonStringMember(doc["code"]);
}

String extractBackendErrorMessage(const String& responseBody) {
  if (responseBody.isEmpty()) {
    return "";
  }

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, responseBody) != DeserializationError::Ok) {
    return "";
  }

  const String message = readJsonStringMember(doc["message"]);
  if (!message.isEmpty()) {
    return message;
  }

  return readJsonStringMember(doc["error"]["message"]);
}

String buildPairingFailureMessage(int httpStatus, const String& responseBody) {
  if (httpStatus <= 0) {
    return "Nao foi possivel alcancar o backend nessa URL. Use o IP real do notebook na rede atual.";
  }

  const String errorCode = extractBackendErrorCode(responseBody);
  if (errorCode == "PAIRING_CODE_EXPIRED") {
    return "Codigo expirado. Gere um novo no dashboard.";
  }

  if (errorCode == "PAIRING_CODE_INVALID" || errorCode == "PAIRING_CODE_REQUIRED") {
    return "Codigo invalido. Confira o valor informado.";
  }

  if (errorCode == "PAIRING_CODE_USED") {
    return "Codigo ja utilizado. Gere outro codigo.";
  }

  if (errorCode == "DEVICE_CLAIMED_ELSEWHERE") {
    return "Este dispositivo ja esta pareado com outra organizacao.";
  }

  if (errorCode == "PAIRING_SCHEMA_MISMATCH") {
    return "O backend de pairing parece estar com o banco desatualizado. Atualize o schema antes de tentar novamente.";
  }

  if (errorCode == "PAIRING_DATA_INTEGRITY_ERROR") {
    return "O backend recusou o claim por uma inconsistencia de dados. Revise o banco e tente novamente.";
  }

  const String backendMessage = extractBackendErrorMessage(responseBody);
  if (!backendMessage.isEmpty()) {
    return backendMessage;
  }

  if (httpStatus >= 500) {
    return "O backend respondeu com erro interno. Confirme se ele esta online e acessivel nessa rede.";
  }

  return "Nao foi possivel concluir o pareamento. Revise a URL do backend e tente novamente.";
}

}  // namespace

SetupPortal::SetupPortal(ConfigStore& configStore) : configStore_(configStore) {}

void SetupPortal::begin(const DeviceSettings::DeviceConfig& config,
                        const String& stateLabel,
                        const String& reason,
                        bool stationConnected,
                        const IPAddress& stationIp) {
  syncContext(config, stateLabel, reason, stationConnected, stationIp);
  ensureApStarted();
  configureRoutes();
  dnsServer_.start(kDnsPort, "*", apIp_);
  server_.begin();
  running_ = true;
  startWifiScanIfNeeded();
}

void SetupPortal::syncContext(const DeviceSettings::DeviceConfig& config,
                              const String& stateLabel,
                              const String& reason,
                              bool stationConnected,
                              const IPAddress& stationIp) {
  config_ = config;
  stateLabel_ = stateLabel;
  reason_ = reason;
  stationConnected_ = stationConnected;
  stationIp_ = stationIp;
}

void SetupPortal::update() {
  if (!running_) {
    return;
  }

  dnsServer_.processNextRequest();
  server_.handleClient();
  updateWifiScanCache();
  startWifiScanIfNeeded();

  if (restartAtMs_ > 0U && millis() >= restartAtMs_) {
    ESP.restart();
  }
}

bool SetupPortal::isRunning() const {
  return running_;
}

IPAddress SetupPortal::apIP() const {
  return apIp_;
}

void SetupPortal::configureRoutes() {
  server_.on("/", HTTP_GET, [this]() { handleRoot(); });
  server_.on("/save", HTTP_POST, [this]() { handleSaveSettings(); });
  server_.on("/wifi/add", HTTP_POST, [this]() { handleAddWifi(); });
  server_.on("/wifi/remove", HTTP_POST, [this]() { handleRemoveWifi(); });
  server_.on("/pair", HTTP_POST, [this]() { handlePairDevice(); });
  server_.on("/restart", HTTP_POST, [this]() { handleRestart(); });

  server_.on("/generate_204", HTTP_ANY, [this]() { handleCaptiveProbe(); });
  server_.on("/gen_204", HTTP_ANY, [this]() { handleCaptiveProbe(); });
  server_.on("/hotspot-detect.html", HTTP_ANY, [this]() { handleCaptiveProbe(); });
  server_.on("/library/test/success.html", HTTP_ANY,
             [this]() { handleCaptiveProbe(); });
  server_.on("/connecttest.txt", HTTP_ANY, [this]() { handleCaptiveProbe(); });
  server_.on("/ncsi.txt", HTTP_ANY, [this]() { handleCaptiveProbe(); });
  server_.on("/fwlink", HTTP_ANY, [this]() { handleCaptiveProbe(); });

  server_.onNotFound([this]() { redirectToPortal(); });
}

void SetupPortal::ensureApStarted() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPdisconnect(true);
  WiFi.softAPConfig(apIp_, apIp_, IPAddress(255, 255, 255, 0));

  const String apSsid = DeviceSettings::buildSetupApSsid(config_);
  if (String(AppConfig::SETUP_AP_PASSWORD).isEmpty()) {
    WiFi.softAP(apSsid.c_str());
  } else {
    WiFi.softAP(apSsid.c_str(), AppConfig::SETUP_AP_PASSWORD);
  }

  AppLog::warn("=== SETUP MODE ===");
  AppLog::infof("AP de configuracao: %s\n", apSsid.c_str());
  AppLog::infof("Portal local: %s\n", AppConfig::SETUP_PORTAL_LOCAL_URL);
  AppLog::infof("Portal manual: %s\n", AppConfig::SETUP_PORTAL_IP);
  AppLog::warnf("Motivo: %s\n", reason_.c_str());

  if (stationConnected_) {
    AppLog::infof("Tambem acessivel pela rede atual em http://%s\n",
                  stationIp_.toString().c_str());
  }
}

void SetupPortal::scheduleRestart(const String& message) {
  flashMessage_ = message;
  flashTone_ = "success";
  restartAtMs_ = millis() + AppConfig::SETUP_RESTART_DELAY_MS;
}

void SetupPortal::startWifiScanIfNeeded() {
  if (scanInProgress_) {
    return;
  }

  if (lastScanAtMs_ > 0U &&
      (millis() - lastScanAtMs_) < AppConfig::WIFI_SCAN_REFRESH_INTERVAL_MS) {
    return;
  }

  if (WiFi.scanNetworks(true, true) == WIFI_SCAN_RUNNING) {
    scanInProgress_ = true;
    lastScanAtMs_ = millis();
  }
}

void SetupPortal::updateWifiScanCache() {
  if (!scanInProgress_) {
    return;
  }

  const int scanResult = WiFi.scanComplete();
  if (scanResult == WIFI_SCAN_RUNNING || scanResult == WIFI_SCAN_FAILED) {
    return;
  }

  scannedNetworkCount_ = 0;
  for (int index = 0; index < scanResult && scannedNetworkCount_ < 8; ++index) {
    const String ssid = WiFi.SSID(index);
    if (ssid.isEmpty()) {
      continue;
    }

    bool duplicate = false;
    for (size_t cached = 0; cached < scannedNetworkCount_; ++cached) {
      if (scannedNetworks_[cached] == ssid) {
        duplicate = true;
        break;
      }
    }

    if (!duplicate) {
      scannedNetworks_[scannedNetworkCount_] = ssid;
      ++scannedNetworkCount_;
    }
  }

  WiFi.scanDelete();
  scanInProgress_ = false;
}

void SetupPortal::redirectToPortal() {
  server_.sendHeader("Location", kPortalHostUrl, true);
  server_.send(302, "text/plain", "");
}

void SetupPortal::handleRoot() {
  server_.send(200, "text/html; charset=utf-8", renderPage());
}

void SetupPortal::handleCaptiveProbe() {
  redirectToPortal();
}

void SetupPortal::handleSaveSettings() {
  DeviceSettings::DeviceConfig updated = config_;
  updated.deviceId = server_.arg("device_id");
  updated.mqtt.host = server_.arg("mqtt_host");
  updated.mqtt.port = parsePortOrDefault(server_.arg("mqtt_port"),
                                         AppConfig::DEFAULT_MQTT_PORT);
  updated.mqtt.username = server_.arg("mqtt_username");
  updated.mqtt.password = server_.arg("mqtt_password");
  updated.mqtt.clientId = server_.arg("mqtt_client_id");
  updated.mqtt.backendApiBaseUrl = server_.arg("backend_api_base_url");

  if (!DeviceSettings::hasValidMqttConfig(updated)) {
    flashMessage_ =
        "Broker MQTT invalido. Use host/IP real do broker e nunca localhost no ESP32.";
    flashTone_ = "error";
    redirectToPortal();
    return;
  }

  if (!configStore_.save(updated)) {
    flashMessage_ = "Falha ao salvar configuracao em NVS.";
    flashTone_ = "error";
    redirectToPortal();
    return;
  }

  config_ = updated;
  if (server_.arg("action") == "save_restart") {
    scheduleRestart("Configuracao salva. Reiniciando o ESP32 para aplicar Wi-Fi e MQTT.");
  } else {
    flashMessage_ =
        "Configuracao salva em NVS. Use 'Salvar e reiniciar' para aplicar imediatamente.";
    flashTone_ = "success";
  }

  redirectToPortal();
}

void SetupPortal::handlePairDevice() {
  DeviceSettings::DeviceConfig updated = config_;
  updated.mqtt.backendApiBaseUrl = server_.arg("backend_api_base_url");

  if (!DeviceSettings::hasValidBackendApiBaseUrl(updated)) {
    flashMessage_ =
        "Backend API invalida. Use o IP real do notebook na rede atual com http:// ou https://.";
    flashTone_ = "error";
    redirectToPortal();
    return;
  }

  const String pairingCode = server_.arg("pairing_code");
  if (pairingCode.isEmpty()) {
    flashMessage_ = "Informe o codigo temporario de pareamento gerado no dashboard.";
    flashTone_ = "error";
    redirectToPortal();
    return;
  }

  HTTPClient httpClient;
  const String endpoint = DeviceSettings::effectiveBackendApiBaseUrl(updated) + "/api/pairing/claim";

  StaticJsonDocument<320> doc;
  doc["device_uid"] = DeviceSettings::technicalDeviceUid();
  doc["device_id"] = DeviceSettings::effectiveDeviceId(updated);
  doc["device_name"] = updated.deviceId;
  doc["pairing_code"] = pairingCode;

  String payload;
  serializeJson(doc, payload);

  if (!httpClient.begin(endpoint)) {
    flashMessage_ =
        "Nao foi possivel alcancar o backend nessa URL. Use o IP real do notebook na rede atual.";
    flashTone_ = "error";
    redirectToPortal();
    return;
  }

  httpClient.addHeader("Content-Type", "application/json");
  const int httpStatus = httpClient.POST(payload);
  const String responseBody = httpClient.getString();
  httpClient.end();

  if (httpStatus <= 0) {
    flashMessage_ =
        "Nao foi possivel alcancar o backend nessa URL. Use o IP real do notebook na rede atual.";
    flashTone_ = "error";
    redirectToPortal();
    return;
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    String pairingDetails;
    const bool claimResponseApplied =
        PatientProfileClient::applyClaimResponse(updated, responseBody, &pairingDetails);

    if (!configStore_.save(updated)) {
      flashMessage_ = "O claim foi aceito, mas nao foi possivel salvar backend, token e perfil em NVS.";
      flashTone_ = "error";
      redirectToPortal();
      return;
    }

    config_ = updated;
    flashMessage_ =
        "Dispositivo pareado com sucesso. O backend confirmou o claim deste ESP32 para a organizacao ativa.";
    if (!updated.patientProfile.patientName.isEmpty()) {
      flashMessage_ += " Perfil atual: " + updated.patientProfile.patientName + ".";
    } else {
      flashMessage_ += " Ainda nao existe paciente ativo vinculado a este device.";
    }
    if (!claimResponseApplied && !pairingDetails.isEmpty()) {
      flashMessage_ += " Aviso: " + pairingDetails;
      flashTone_ = "info";
    } else {
      flashTone_ = "success";
    }
    redirectToPortal();
    return;
  }

  flashMessage_ = buildPairingFailureMessage(httpStatus, responseBody);
  flashTone_ = "error";
  redirectToPortal();
}

void SetupPortal::handleAddWifi() {
  DeviceSettings::DeviceConfig updated = config_;
  String errorMessage;
  const bool preferred = server_.hasArg("wifi_preferred");
  const String password = server_.arg("wifi_password");

  if (!DeviceSettings::upsertWifiNetwork(updated,
                                         server_.arg("wifi_ssid"),
                                         password,
                                         preferred,
                                         &errorMessage)) {
    flashMessage_ = errorMessage;
    flashTone_ = "error";
    redirectToPortal();
    return;
  }

  if (!configStore_.save(updated)) {
    flashMessage_ = "Nao foi possivel salvar a rede Wi-Fi em NVS.";
    flashTone_ = "error";
    redirectToPortal();
    return;
  }

  config_ = updated;
  flashMessage_ = "Rede Wi-Fi salva. Se necessario, adicione mais redes e depois reinicie o ESP32.";
  flashTone_ = "success";
  redirectToPortal();
}

void SetupPortal::handleRemoveWifi() {
  DeviceSettings::DeviceConfig updated = config_;
  const int index = server_.arg("wifi_index").toInt();

  if (index < 0 || !DeviceSettings::removeWifiNetworkAt(updated, static_cast<size_t>(index))) {
    flashMessage_ = "Nao foi possivel remover a rede selecionada.";
    flashTone_ = "error";
    redirectToPortal();
    return;
  }

  if (!configStore_.save(updated)) {
    flashMessage_ = "Falha ao persistir a remocao da rede em NVS.";
    flashTone_ = "error";
    redirectToPortal();
    return;
  }

  config_ = updated;
  flashMessage_ = "Rede removida. Salve e reinicie quando terminar de editar.";
  flashTone_ = "success";
  redirectToPortal();
}

void SetupPortal::handleRestart() {
  scheduleRestart("Reiniciando o ESP32 para retomar a conexao normal.");
  redirectToPortal();
}

String SetupPortal::htmlEscape(const String& value) const {
  String escaped = value;
  escaped.replace("&", "&amp;");
  escaped.replace("\"", "&quot;");
  escaped.replace("<", "&lt;");
  escaped.replace(">", "&gt;");
  return escaped;
}

String SetupPortal::flashStyle() const {
  if (flashTone_ == "error") {
    return "background:#fee2e2;color:#991b1b;border:1px solid #fecaca;";
  }

  if (flashTone_ == "success") {
    return "background:#dcfce7;color:#166534;border:1px solid #bbf7d0;";
  }

  return "background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;";
}

void SetupPortal::appendPageHead(String& html) const {
  html += "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>Queda Setup Portal</title>";
  html += "<style>";
  html += "body{font-family:Arial,sans-serif;background:#f5f7f4;color:#15312a;margin:0;padding:16px;}";
  html += ".wrap{max-width:920px;margin:0 auto;display:grid;gap:16px;}";
  html += ".card{background:#fff;border:1px solid #d7e2dd;border-radius:18px;padding:18px;box-shadow:0 10px 30px rgba(21,49,42,.06);}";
  html += "h1,h2{margin:0 0 10px;}h1{font-size:28px;}h2{font-size:20px;}";
  html += "p,li{line-height:1.5;}label{display:block;font-weight:700;margin:12px 0 6px;}";
  html += "input,textarea{width:100%;padding:12px;border:1px solid #cfdad4;border-radius:12px;box-sizing:border-box;font:inherit;}";
  html += "textarea{min-height:110px;resize:vertical;}";
  html += "button{border:0;border-radius:12px;padding:12px 16px;font-weight:700;cursor:pointer;}";
  html += ".primary{background:#15312a;color:#fff;}.secondary{background:#eef3f0;color:#15312a;}";
  html += ".danger{background:#fee2e2;color:#991b1b;}.grid{display:grid;gap:12px;}";
  html += ".two{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));}.badge{display:inline-block;padding:6px 10px;border-radius:999px;background:#e5f3ee;font-size:12px;font-weight:700;}";
  html += ".flash{padding:12px 14px;border-radius:14px;margin-bottom:12px;}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}";
  html += ".list{display:grid;gap:10px;margin-top:10px;}.network{border:1px solid #d7e2dd;border-radius:14px;padding:12px;display:flex;justify-content:space-between;gap:12px;align-items:center;}";
  html += ".muted{color:#526661;font-size:14px;}.mono{font-family:'Courier New',monospace;}";
  html += ".hint{font-size:13px;color:#526661;}.success{color:#166534;}.error{color:#991b1b;}.hidden{display:none;}";
  html += "video{width:100%;max-height:240px;border-radius:14px;background:#0f172a;}";
  html += "</style></head><body><div class='wrap'>";
}

void SetupPortal::appendHeaderCard(String& html) const {
  html += "<div class='card'><h1>Portal local do ESP32</h1>";
  html += "<p class='muted'>Use esta pagina para cadastrar redes Wi-Fi, broker MQTT e identidade do dispositivo sem recompilar o firmware.</p>";
  html += "<div class='row'><span class='badge'>Estado: ";
  html += htmlEscape(stateLabel_);
  html += "</span><span class='badge'>AP: ";
  html += htmlEscape(DeviceSettings::buildSetupApSsid(config_));
  html += "</span></div>";
  html += "<p><strong>Motivo do setup:</strong> ";
  html += htmlEscape(reason_);
  html += "</p><p><strong>Acesso rapido:</strong> <span class='mono'>";
  html += AppConfig::SETUP_PORTAL_LOCAL_URL;
  html += "</span> ou <span class='mono'>";
  html += AppConfig::SETUP_PORTAL_IP;
  html += "</span>.</p>";
  html += stationAccessSummary();
  html += "</div>";
}

void SetupPortal::appendFlashMessage(String& html) const {
  if (flashMessage_.isEmpty()) {
    return;
  }

  html += "<div class='flash' style='";
  html += flashStyle();
  html += "'>";
  html += htmlEscape(flashMessage_);
  html += "</div>";
}

void SetupPortal::appendWifiCard(String& html) const {
  html += "<div class='card'><h2>Redes Wi-Fi salvas</h2>";
  html += "<p class='muted'>O ESP32 tenta as redes na ordem abaixo. A primeira e tratada como preferida.</p>";
  html += renderSavedNetworks();
  html += "</div>";

  html += "<div class='card'><h2>Adicionar ou atualizar rede</h2>";
  html += "<form method='post' action='/wifi/add' class='grid'>";
  html += "<div class='two grid'><div><label>SSID</label><input name='wifi_ssid' placeholder='Nome da rede' required></div>";
  html += "<div><label>Senha</label><input name='wifi_password' placeholder='Senha ou vazio para rede aberta'></div></div>";
  html += "<label><input name='wifi_preferred' type='checkbox' style='width:auto;margin-right:8px;'>Marcar como rede preferida</label>";
  html += "<div class='row'><button class='primary' type='submit'>Salvar rede</button></div></form>";
  html += renderScannedNetworks();
  html += "</div>";
}

void SetupPortal::appendMqttCard(String& html) const {
  html += "<div class='card'><h2>MQTT e identidade</h2>";
  html += "<form method='post' action='/save' class='grid'>";
  html += "<div class='two grid'><div><label>Device ID</label><input name='device_id' value='";
  html += htmlEscape(config_.deviceId);
  html += "' placeholder='esp32_01'></div>";
  html += "<div><label>MQTT client ID</label><input name='mqtt_client_id' value='";
  html += htmlEscape(config_.mqtt.clientId);
  html += "' placeholder='esp32_01_client'></div></div>";
  html += "<div class='two grid'><div><label>MQTT host</label><input name='mqtt_host' value='";
  html += htmlEscape(config_.mqtt.host);
  html += "' placeholder='IP ou dominio do broker' required></div>";
  html += "<div><label>MQTT port</label><input name='mqtt_port' type='number' min='1' max='65535' value='";
  html += String(config_.mqtt.port);
  html += "' required></div></div>";
  html += "<div class='two grid'><div><label>Usuario MQTT</label><input name='mqtt_username' value='";
  html += htmlEscape(config_.mqtt.username);
  html += "' placeholder='Opcional'></div>";
  html += "<div><label>Senha MQTT</label><input name='mqtt_password' type='password' value='";
  html += htmlEscape(config_.mqtt.password);
  html += "' placeholder='Opcional'></div></div>";
  html += "<div><label>Backend API base URL</label><input id='general_backend_api_base_url' name='backend_api_base_url' value='";
  html += htmlEscape(config_.mqtt.backendApiBaseUrl);
  html += "' placeholder='http://IP-DO-NOTEBOOK:4000'></div>";
  html += "<p class='muted'>Nunca use <span class='mono'>localhost</span> no ESP32. Para broker no notebook, use o IP real do notebook na rede atual.</p>";
  html += "<div class='row'><button class='primary' name='action' type='submit' value='save_restart'>Salvar e reiniciar</button>";
  html += "<button class='secondary' name='action' type='submit' value='save_only'>Salvar sem reiniciar</button></div></form>";
  html += "</div>";
}

void SetupPortal::appendPairingCard(String& html) const {
  html += "<div class='card'><h2>Parear dispositivo com codigo temporario</h2>";
  html += "<p class='muted'>Device UID tecnico deste ESP32: <span class='mono'>";
  html += htmlEscape(DeviceSettings::technicalDeviceUid());
  html += "</span></p>";
  html += "<form method='post' action='/pair' class='grid'>";
  html += "<div class='two grid'><div><label>Backend API base URL</label><input id='pairing_backend_api_base_url' name='backend_api_base_url' value='";
  html += htmlEscape(config_.mqtt.backendApiBaseUrl);
  html += "' placeholder='http://IP-DO-NOTEBOOK:4000' required></div>";
  html += "<div><label>Codigo de pareamento</label><input id='pairing_code' name='pairing_code' placeholder='ABC123' required></div></div>";
  html += "<p class='muted'>Use a URL principal recomendada no dashboard e o codigo temporario ainda valido. O backend valida expiracao, uso unico e organizacao antes de concluir o claim.</p>";
  html += "<div class='row'><button class='primary' type='submit'>Parear agora</button></div></form>";
  html += "</div>";

  html += "<div class='card'><h2>Perfil resumido sincronizado</h2>";
  html += renderPatientProfileSummary();
  html += "</div>";
}

void SetupPortal::appendRestartCard(String& html) const {
  html += "<div class='card'><h2>Reiniciar dispositivo</h2>";
  html += "<form method='post' action='/restart'><button class='secondary' type='submit'>Reiniciar agora</button></form>";
  html += "</div>";
}

String SetupPortal::renderPage() const {
  String html;
  html.reserve(16384);

  appendPageHead(html);
  appendHeaderCard(html);
  appendFlashMessage(html);
  appendWifiCard(html);
  appendMqttCard(html);
  appendPairingCard(html);
  appendRestartCard(html);
  html += "</div></body></html>";
  return html;
}

String SetupPortal::renderSavedNetworks() const {
  if (config_.wifiNetworkCount == 0) {
    return "<p class='muted'>Nenhuma rede salva ainda.</p>";
  }

  String html = "<div class='list'>";
  for (size_t index = 0; index < config_.wifiNetworkCount; ++index) {
    html += "<div class='network'><div><strong>";
    html += htmlEscape(config_.wifiNetworks[index].ssid);
    html += "</strong><div class='muted'>";
    html += index == 0 ? "Preferida" : "Fallback";
    html += "</div></div><form method='post' action='/wifi/remove'>";
    html += "<input name='wifi_index' type='hidden' value='";
    html += String(index);
    html += "'><button class='danger' type='submit'>Remover</button></form></div>";
  }
  html += "</div>";
  return html;
}

String SetupPortal::renderScannedNetworks() const {
  if (scannedNetworkCount_ == 0) {
    return "<p class='muted'>A lista de redes visiveis sera atualizada automaticamente enquanto o portal estiver aberto.</p>";
  }

  String html = "<div class='card' style='margin-top:16px;background:#f9fbfa;'><h2 style='font-size:18px;'>Redes detectadas</h2><ul>";
  for (size_t index = 0; index < scannedNetworkCount_; ++index) {
    html += "<li><span class='mono'>";
    html += htmlEscape(scannedNetworks_[index]);
    html += "</span></li>";
  }
  html += "</ul></div>";
  return html;
}

String SetupPortal::renderPatientProfileSummary() const {
  const auto& profile = config_.patientProfile;
  const bool hasProfile = !profile.patientName.isEmpty() || profile.hasWeightKg ||
                          profile.hasHeightCm ||
                          !profile.fallSensitivityPreset.isEmpty();

  if (!hasProfile) {
    return "<p class='muted'>Nenhum perfil resumido foi sincronizado ainda. Depois do claim, o backend envia o paciente atual e o ESP32 tambem pode atualizar isso periodicamente.</p>";
  }

  String html = "<div class='grid'>";
  html += "<p><strong>Paciente atual:</strong> ";
  html += profile.patientName.isEmpty() ? "Nao vinculado" : htmlEscape(profile.patientName);
  html += "</p><div class='two grid'>";
  html += "<div class='network'><div><strong>Peso</strong><div class='muted'>";
  html += profile.hasWeightKg ? String(profile.weightKg, 1) + " kg" : String("Nao informado");
  html += "</div></div></div>";
  html += "<div class='network'><div><strong>Altura</strong><div class='muted'>";
  html += profile.hasHeightCm ? String(profile.heightCm, 1) + " cm" : String("Nao informado");
  html += "</div></div></div></div>";
  html += "<p><strong>Preset de sensibilidade:</strong> ";
  html += profile.fallSensitivityPreset.isEmpty() ? "Nao definido" : htmlEscape(profile.fallSensitivityPreset);
  html += "</p>";
  if (!profile.syncedAt.isEmpty()) {
    html += "<p class='muted'>Ultima sincronizacao registrada pelo backend: <span class='mono'>";
    html += htmlEscape(profile.syncedAt);
    html += "</span></p>";
  }
  html += "</div>";
  return html;
}

String SetupPortal::stationAccessSummary() const {
  if (!stationConnected_) {
    return "<p class='muted'>Mesmo sem Wi-Fi funcional, o AP de setup continua disponivel para configuracao.</p>";
  }

  String html = "<p><strong>Tambem disponivel na rede atual:</strong> <span class='mono'>http://";
  html += stationIp_.toString();
  html += "</span></p>";
  return html;
}
