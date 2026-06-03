#pragma once

#include <DNSServer.h>
#include <WebServer.h>
#include <WiFi.h>

#include "config_store.h"
#include "device_config.h"
#include "mqtt_client.h"

using BuzzerTestCallback = bool (*)(String* message);

class SetupPortal {
 public:
  SetupPortal(ConfigStore& configStore, DeviceMqttClient& mqttClient);

  void begin(const DeviceSettings::DeviceConfig& config,
             const String& stateLabel,
             const String& reason,
             bool stationConnected,
             const IPAddress& stationIp,
             bool maintenanceMode = false);
  void syncContext(const DeviceSettings::DeviceConfig& config,
                   const String& stateLabel,
                   const String& reason,
                   bool stationConnected,
                   const IPAddress& stationIp,
                   bool maintenanceMode = false);
  void update();
  bool consumeAlertTuningUpdate(DeviceSettings::AlertTuningConfig& alertTuning);
  void setBuzzerTestCallback(BuzzerTestCallback callback);

  bool isRunning() const;
  IPAddress apIP() const;

 private:
  void configureRoutes();
  void ensureApStarted();
  void scheduleRestart(const String& message);
  void startWifiScanIfNeeded();
  void updateWifiScanCache();
  void redirectToPortal();
  void clearOperationalProbeResults();

  void handleRoot();
  void handleCaptiveProbe();
  void handleSaveSettings();
  void handleAddWifi();
  void handleRemoveWifi();
  void handlePairDevice();
  void handleRestart();
  void handleTestBackend();
  void handleTestMqtt();
  void handleTestBuzzer();

  String htmlEscape(const String& value) const;
  String flashStyle() const;
  String renderPage() const;
  String renderSavedNetworks() const;
  String renderScannedNetworks() const;
  String renderPatientProfileSummary() const;
  String renderOperationalHealthSummary() const;
  String stationAccessSummary() const;
  void appendPageHead(String& html) const;
  void appendHeaderCard(String& html) const;
  void appendFlashMessage(String& html) const;
  void appendOperationalHealthCard(String& html) const;
  void appendWifiCard(String& html) const;
  void appendMqttCard(String& html) const;
  void appendAlertTuningCard(String& html) const;
  void appendPairingCard(String& html) const;
  void appendRestartCard(String& html) const;

  ConfigStore& configStore_;
  DeviceMqttClient& mqttClient_;
  DNSServer dnsServer_;
  WebServer server_{80};

  DeviceSettings::DeviceConfig config_;
  String stateLabel_;
  String reason_;
  String flashMessage_;
  String flashTone_ = "info";
  bool running_ = false;
  bool maintenanceMode_ = false;
  bool stationConnected_ = false;
  IPAddress stationIp_;
  IPAddress apIp_{192, 168, 4, 1};
  unsigned long restartAtMs_ = 0;
  unsigned long lastScanAtMs_ = 0;
  bool scanInProgress_ = false;
  String scannedNetworks_[8];
  size_t scannedNetworkCount_ = 0;
  bool backendProbeChecked_ = false;
  bool backendProbeSuccess_ = false;
  String backendProbeMessage_;
  bool mqttProbeChecked_ = false;
  bool mqttProbeSuccess_ = false;
  String mqttProbeMessage_;
  bool alertTuningUpdatePending_ = false;
  DeviceSettings::AlertTuningConfig pendingAlertTuning_;
  BuzzerTestCallback buzzerTestCallback_ = nullptr;
};
