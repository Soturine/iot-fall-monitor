#pragma once

#include "device_config.h"
#include "models.h"

class ConfigStore {
 public:
  DeviceSettings::DeviceConfig load();
  bool save(const DeviceSettings::DeviceConfig& config);
  bool clear();
  size_t loadPendingEvents(BufferedEvent* events, size_t capacity);
  bool savePendingEvents(const BufferedEvent* events, size_t count);
  bool clearPendingEvents();
};
