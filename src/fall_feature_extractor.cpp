#include "fall_feature_extractor.h"

#include <cmath>

namespace {

float varianceFromSums(float sum, float sumSquares, float sampleCount) {
  if (sampleCount <= 1.0f) {
    return 0.0f;
  }

  const float mean = sum / sampleCount;
  const float variance = (sumSquares / sampleCount) - (mean * mean);
  return variance > 0.0f ? variance : 0.0f;
}

}  // namespace

void FallFeatureExtractor::reset() {
  nextIndex_ = 0;
  sampleCount_ = 0;
}

void FallFeatureExtractor::addSample(const SensorReading& reading) {
  if (!AppConfig::FALL_FEATURE_EXTRACTOR_ENABLED || !reading.valid) {
    return;
  }

  samples_[nextIndex_] = reading;
  nextIndex_ = (nextIndex_ + 1U) % AppConfig::FALL_FEATURE_WINDOW_SIZE;

  if (sampleCount_ < AppConfig::FALL_FEATURE_WINDOW_SIZE) {
    ++sampleCount_;
  }
}

size_t FallFeatureExtractor::chronologicalIndex(size_t offset) const {
  if (sampleCount_ == 0U) {
    return 0U;
  }

  const size_t startIndex =
      sampleCount_ == AppConfig::FALL_FEATURE_WINDOW_SIZE ? nextIndex_ : 0U;
  return (startIndex + offset) % AppConfig::FALL_FEATURE_WINDOW_SIZE;
}

FallTimeDomainFeatures FallFeatureExtractor::timeDomainSnapshot() const {
  FallTimeDomainFeatures features;

  if (!AppConfig::FALL_FEATURE_EXTRACTOR_ENABLED || sampleCount_ == 0U) {
    return features;
  }

  float sumAx = 0.0f;
  float sumAy = 0.0f;
  float sumAz = 0.0f;
  float sumGx = 0.0f;
  float sumGy = 0.0f;
  float sumGz = 0.0f;
  float sumSqAx = 0.0f;
  float sumSqAy = 0.0f;
  float sumSqAz = 0.0f;
  float sumSqGx = 0.0f;
  float sumSqGy = 0.0f;
  float sumSqGz = 0.0f;
  float sumJerk = 0.0f;
  float peakJerk = 0.0f;
  unsigned int jerkSampleCount = 0;
  SensorReading previous;
  bool hasPrevious = false;

  for (size_t offset = 0; offset < sampleCount_; ++offset) {
    const SensorReading& sample = samples_[chronologicalIndex(offset)];

    sumAx += sample.accelXG;
    sumAy += sample.accelYG;
    sumAz += sample.accelZG;
    sumGx += sample.gyroXDegPerSec;
    sumGy += sample.gyroYDegPerSec;
    sumGz += sample.gyroZDegPerSec;

    sumSqAx += sample.accelXG * sample.accelXG;
    sumSqAy += sample.accelYG * sample.accelYG;
    sumSqAz += sample.accelZG * sample.accelZG;
    sumSqGx += sample.gyroXDegPerSec * sample.gyroXDegPerSec;
    sumSqGy += sample.gyroYDegPerSec * sample.gyroYDegPerSec;
    sumSqGz += sample.gyroZDegPerSec * sample.gyroZDegPerSec;

    features.peakAccelMagnitudeG =
        fmaxf(features.peakAccelMagnitudeG, sample.accelMagnitudeG);
    features.peakGyroMagnitudeDps =
        fmaxf(features.peakGyroMagnitudeDps, sample.gyroMagnitudeDegPerSec);

    if (offset == 0U) {
      features.windowStartedAtMs = sample.timestampMs;
    }

    features.windowEndedAtMs = sample.timestampMs;

    if (hasPrevious && sample.timestampMs > previous.timestampMs) {
      const float deltaSeconds =
          static_cast<float>(sample.timestampMs - previous.timestampMs) / 1000.0f;
      if (deltaSeconds > 0.0f) {
        const float jerk =
            fabsf(sample.accelMagnitudeG - previous.accelMagnitudeG) / deltaSeconds;
        sumJerk += jerk;
        peakJerk = fmaxf(peakJerk, jerk);
        ++jerkSampleCount;
      }
    }

    previous = sample;
    hasPrevious = true;
  }

  const float count = static_cast<float>(sampleCount_);
  features.available = true;
  features.sampleCount = static_cast<unsigned int>(sampleCount_);
  features.windowDurationMs =
      features.windowEndedAtMs >= features.windowStartedAtMs
          ? features.windowEndedAtMs - features.windowStartedAtMs
          : 0U;
  features.meanAxG = sumAx / count;
  features.meanAyG = sumAy / count;
  features.meanAzG = sumAz / count;
  features.meanGxDps = sumGx / count;
  features.meanGyDps = sumGy / count;
  features.meanGzDps = sumGz / count;
  features.stdAxG = sqrtf(varianceFromSums(sumAx, sumSqAx, count));
  features.stdAyG = sqrtf(varianceFromSums(sumAy, sumSqAy, count));
  features.stdAzG = sqrtf(varianceFromSums(sumAz, sumSqAz, count));
  features.stdGxDps = sqrtf(varianceFromSums(sumGx, sumSqGx, count));
  features.stdGyDps = sqrtf(varianceFromSums(sumGy, sumSqGy, count));
  features.stdGzDps = sqrtf(varianceFromSums(sumGz, sumSqGz, count));
  features.energyAx = sumSqAx;
  features.energyAy = sumSqAy;
  features.energyAz = sumSqAz;
  features.energyGx = sumSqGx;
  features.energyGy = sumSqGy;
  features.energyGz = sumSqGz;
  features.meanJerkGPerSec =
      jerkSampleCount > 0U ? sumJerk / static_cast<float>(jerkSampleCount) : 0.0f;
  features.peakJerkGPerSec = peakJerk;

  return features;
}

FallFrequencyDomainFeatures FallFeatureExtractor::frequencyDomainSnapshot() const {
  FallFrequencyDomainFeatures features;
  features.available = false;
  features.experimental = true;
  features.windowSize = static_cast<unsigned int>(AppConfig::FALL_FFT_WINDOW_SIZE);
  features.sampleIntervalMs = AppConfig::FALL_FFT_SAMPLE_INTERVAL_MS;
  features.sampleCount = static_cast<unsigned int>(sampleCount_);
  return features;
}
