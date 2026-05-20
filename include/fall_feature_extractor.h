#pragma once

#include "app_config.h"
#include "models.h"

class FallFeatureExtractor {
 public:
  void reset();
  void addSample(const SensorReading& reading);
  FallTimeDomainFeatures timeDomainSnapshot() const;
  FallFrequencyDomainFeatures frequencyDomainSnapshot() const;

 private:
  size_t chronologicalIndex(size_t offset) const;

  SensorReading samples_[AppConfig::FALL_FEATURE_WINDOW_SIZE];
  size_t nextIndex_ = 0;
  size_t sampleCount_ = 0;
};
