#pragma once

#include <Arduino.h>

#include "config_store.h"
#include "device_config.h"

namespace PatientProfileClient {

struct SyncOutcome {
  bool attempted = false;
  bool success = false;
  bool persisted = false;
  int httpStatus = 0;
  String message;
};

bool applyClaimResponse(DeviceSettings::DeviceConfig& config,
                        const String& responseBody,
                        String* errorMessage = nullptr);

SyncOutcome syncPatientProfile(DeviceSettings::DeviceConfig& config,
                               ConfigStore& configStore);

}  // namespace PatientProfileClient
