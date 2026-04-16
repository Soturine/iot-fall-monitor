#pragma once

#include <DNSServer.h>
#include <WebServer.h>
#include <WiFi.h>

#include "config_store.h"
#include "device_config.h"

class SetupPortal {
 public:
  explicit SetupPortal(ConfigStore& configStore);

  void begin(const DeviceSettings::DeviceConfig& config,
             const String& stateLabel,
             const String& reason,
             bool stationConnected,
             const IPAddress& stationIp);
  void syncContext(const DeviceSettings::DeviceConfig& config,
                   const String& stateLabel,
                   const String& reason,
                   bool stationConnected,
                   const IPAddress& stationIp);
  void update();

  bool isRunning() const;
  IPAddress apIP() const;

 private:
  void configureRoutes();
  void ensureApStarted();
  void scheduleRestart(const String& message);
  void startWifiScanIfNeeded();
  void updateWifiScanCache();
  void redirectToPortal();

  void handleRoot();
  void handleCaptiveProbe();
  void handleSaveSettings();
  void handleAddWifi();
  void handleRemoveWifi();
  void handlePairDevice();
  void handleRestart();

  String htmlEscape(const String& value) const;
  String flashStyle() const;
  String renderPage() const;
  String renderSavedNetworks() const;
  String renderScannedNetworks() const;
  String renderPatientProfileSummary() const;
  String stationAccessSummary() const;
  void appendPageHead(String& html) const;
  void appendHeaderCard(String& html) const;
  void appendFlashMessage(String& html) const;
  void appendWifiCard(String& html) const;
  void appendMqttCard(String& html) const;
  void appendPairingCard(String& html) const;
  void appendRestartCard(String& html) const;

  ConfigStore& configStore_;
  DNSServer dnsServer_;
  WebServer server_{80};

  DeviceSettings::DeviceConfig config_;
  String stateLabel_;
  String reason_;
  String flashMessage_;
  String flashTone_ = "info";
  bool running_ = false;
  bool stationConnected_ = false;
  IPAddress stationIp_;
  IPAddress apIp_{192, 168, 4, 1};
  unsigned long restartAtMs_ = 0;
  unsigned long lastScanAtMs_ = 0;
  bool scanInProgress_ = false;
  String scannedNetworks_[8];
  size_t scannedNetworkCount_ = 0;
};
