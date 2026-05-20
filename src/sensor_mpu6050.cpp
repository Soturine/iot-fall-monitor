#include "sensor_mpu6050.h"

#include <cmath>

#include "app_config.h"
#include "app_logging.h"

namespace {

constexpr float kRadiansToDegrees = 57.2957795f;
constexpr uint8_t kMpu6050WhoAmIValue = 0x68;
constexpr uint8_t kMpu6500WhoAmIValue = 0x70;
constexpr uint8_t kPrimaryAddress = 0x68;
constexpr uint8_t kAlternateAddress = 0x69;

constexpr uint8_t kRegisterConfig = 0x1A;
constexpr uint8_t kRegisterGyroConfig = 0x1B;
constexpr uint8_t kRegisterAccelConfig = 0x1C;
constexpr uint8_t kRegisterAccelConfig2 = 0x1D;
constexpr uint8_t kRegisterAccelXoutH = 0x3B;
constexpr uint8_t kRegisterPowerMgmt1 = 0x6B;
constexpr uint8_t kRegisterWhoAmI = 0x75;

constexpr uint8_t kDlpfCfg21Hz = 0x04;
constexpr uint8_t kFsSelMask = 0x18;
constexpr uint8_t kGyroFs250Dps = 0x00;
constexpr uint8_t kGyroFs500Dps = 0x08;
constexpr uint8_t kGyroFs1000Dps = 0x10;
constexpr uint8_t kGyroFs2000Dps = 0x18;
constexpr uint8_t kAccelFs2G = 0x00;
constexpr uint8_t kAccelFs4G = 0x08;
constexpr uint8_t kAccelFs8G = 0x10;
constexpr uint8_t kAccelFs16G = 0x18;
constexpr uint8_t kDesiredGyroFs = kGyroFs500Dps;
constexpr uint8_t kDesiredAccelFs = kAccelFs8G;
constexpr uint8_t kRegisterIoAttempts = 3;

constexpr float kDefaultAccelLsbPerG = 4096.0f;
constexpr float kDefaultGyroLsbPerDegPerSec = 65.5f;
constexpr const char* kI2cErrorNone = "none";
constexpr const char* kI2cErrorWhoAmIReadFailed = "who_am_i_read_failed";
constexpr const char* kI2cErrorWhoAmIIncompatible = "who_am_i_incompatible";
constexpr const char* kI2cErrorRawReadFailed = "raw_read_failed";
constexpr const char* kI2cErrorReadFailed = "i2c_read_failed";
constexpr const char* kI2cErrorRecoveryFailed = "i2c_recovery_failed";

void scanI2CBus(TwoWire& wire) {
  if (!AppConfig::FIRMWARE_I2C_DEBUG_ENABLED) {
    return;
  }

  AppLog::debug("Escaneando barramento I2C...");

  uint8_t devicesFound = 0;
  for (uint8_t address = 1; address < 127; ++address) {
    wire.beginTransmission(address);
    const uint8_t error = wire.endTransmission();

    if (error == 0) {
      AppLog::debugf("Dispositivo I2C encontrado em 0x%02X\n", address);
      ++devicesFound;
    }
  }

  if (devicesFound == 0) {
    AppLog::debug("Nenhum dispositivo I2C encontrado.");
  }
}

void printAddressProbe(TwoWire& wire, uint8_t address) {
  if (!AppConfig::FIRMWARE_I2C_DEBUG_ENABLED) {
    return;
  }

  wire.beginTransmission(address);
  const uint8_t error = wire.endTransmission();

  if (error == 0) {
    AppLog::debugf("Sonda I2C em 0x%02X: ACK recebido.\n", address);
  } else {
    AppLog::debugf("Sonda I2C em 0x%02X: sem resposta (erro %u).\n", address, error);
  }
}

bool writeRegister(TwoWire& wire, uint8_t address, uint8_t reg, uint8_t value) {
  wire.beginTransmission(address);
  wire.write(reg);
  wire.write(value);
  return wire.endTransmission() == 0;
}

bool writeRegisterWithRetry(TwoWire& wire,
                            uint8_t address,
                            uint8_t reg,
                            uint8_t value,
                            const char* label) {
  for (uint8_t attempt = 1; attempt <= kRegisterIoAttempts; ++attempt) {
    if (writeRegister(wire, address, reg, value)) {
      AppLog::infof("[sensor] write %s ok value=0x%02X\n", label, value);
      return true;
    }

    delay(5);
  }

  AppLog::warnf("[sensor] write %s failed value=0x%02X continuing_if_raw_read_works\n",
                label,
                value);
  return false;
}

bool readRegistersRepeatedStart(TwoWire& wire,
                                uint8_t address,
                                uint8_t startRegister,
                                uint8_t* buffer,
                                size_t length) {
  wire.beginTransmission(address);
  wire.write(startRegister);
  const uint8_t txError = wire.endTransmission(false);
  if (txError != 0) {
    return false;
  }

  const uint8_t bytesRead = wire.requestFrom(static_cast<int>(address),
                                             static_cast<int>(length),
                                             static_cast<int>(true));
  if (bytesRead != length) {
    return false;
  }

  for (size_t i = 0; i < length; ++i) {
    if (!wire.available()) {
      return false;
    }
    buffer[i] = wire.read();
  }

  return true;
}

bool readRegistersWithStop(TwoWire& wire,
                           uint8_t address,
                           uint8_t startRegister,
                           uint8_t* buffer,
                           size_t length) {
  wire.beginTransmission(address);
  wire.write(startRegister);
  const uint8_t txError = wire.endTransmission(true);
  if (txError != 0) {
    return false;
  }

  delayMicroseconds(AppConfig::I2C_STOP_READ_SETTLE_US);

  const uint8_t bytesRead = wire.requestFrom(static_cast<int>(address),
                                             static_cast<int>(length),
                                             static_cast<int>(true));
  if (bytesRead != length) {
    while (wire.available()) {
      wire.read();
    }
    return false;
  }

  for (size_t i = 0; i < length; ++i) {
    if (!wire.available()) {
      return false;
    }
    buffer[i] = wire.read();
  }

  return true;
}

bool readRegisters(TwoWire& wire,
                   uint8_t address,
                   uint8_t startRegister,
                   uint8_t* buffer,
                   size_t length) {
  if (!AppConfig::I2C_USE_REPEATED_START) {
    return readRegistersWithStop(wire, address, startRegister, buffer, length);
  }

  if (readRegistersRepeatedStart(wire, address, startRegister, buffer, length)) {
    return true;
  }

  delayMicroseconds(AppConfig::I2C_STOP_READ_SETTLE_US);
  return readRegistersWithStop(wire, address, startRegister, buffer, length);
}

bool readRegister(TwoWire& wire, uint8_t address, uint8_t reg, uint8_t& value) {
  return readRegisters(wire, address, reg, &value, 1);
}

bool readRegisterWithRetry(TwoWire& wire,
                           uint8_t address,
                           uint8_t reg,
                           uint8_t& value,
                           const char* label) {
  for (uint8_t attempt = 1; attempt <= kRegisterIoAttempts; ++attempt) {
    if (readRegister(wire, address, reg, value)) {
      AppLog::infof("[sensor] readback %s ok value=0x%02X\n", label, value);
      return true;
    }

    delay(5);
  }

  AppLog::warnf("[sensor] readback %s failed continuing_with_fallback\n", label);
  return false;
}

int16_t joinBytes(uint8_t msb, uint8_t lsb) {
  return static_cast<int16_t>((static_cast<uint16_t>(msb) << 8) | lsb);
}

uint8_t accelRangeGFromFs(uint8_t fsBits) {
  switch (fsBits & kFsSelMask) {
    case kAccelFs2G:
      return 2;
    case kAccelFs4G:
      return 4;
    case kAccelFs8G:
      return 8;
    case kAccelFs16G:
      return 16;
    default:
      return 8;
  }
}

float accelLsbPerGFromFs(uint8_t fsBits) {
  switch (fsBits & kFsSelMask) {
    case kAccelFs2G:
      return 16384.0f;
    case kAccelFs4G:
      return 8192.0f;
    case kAccelFs8G:
      return 4096.0f;
    case kAccelFs16G:
      return 2048.0f;
    default:
      return kDefaultAccelLsbPerG;
  }
}

uint8_t accelFsFromLsbPerG(float lsbPerG) {
  if (fabsf(lsbPerG - 16384.0f) < 1.0f) {
    return kAccelFs2G;
  }

  if (fabsf(lsbPerG - 8192.0f) < 1.0f) {
    return kAccelFs4G;
  }

  if (fabsf(lsbPerG - 2048.0f) < 1.0f) {
    return kAccelFs16G;
  }

  return kAccelFs8G;
}

float nearestAccelLsbPerGForRest(float rawMagnitudeLsb) {
  const float candidates[] = {16384.0f, 8192.0f, 4096.0f, 2048.0f};
  float bestCandidate = kDefaultAccelLsbPerG;
  float bestError = fabsf(rawMagnitudeLsb - bestCandidate);

  for (float candidate : candidates) {
    const float error = fabsf(rawMagnitudeLsb - candidate);
    if (error < bestError) {
      bestError = error;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

uint16_t gyroRangeDegPerSecFromFs(uint8_t fsBits) {
  switch (fsBits & kFsSelMask) {
    case kGyroFs250Dps:
      return 250;
    case kGyroFs500Dps:
      return 500;
    case kGyroFs1000Dps:
      return 1000;
    case kGyroFs2000Dps:
      return 2000;
    default:
      return 500;
  }
}

float gyroLsbPerDegPerSecFromFs(uint8_t fsBits) {
  switch (fsBits & kFsSelMask) {
    case kGyroFs250Dps:
      return 131.0f;
    case kGyroFs500Dps:
      return 65.5f;
    case kGyroFs1000Dps:
      return 32.8f;
    case kGyroFs2000Dps:
      return 16.4f;
    default:
      return kDefaultGyroLsbPerDegPerSec;
  }
}

const char* sensorNameFromWhoAmI(uint8_t whoAmI) {
  switch (whoAmI) {
    case kMpu6050WhoAmIValue:
      return "MPU6050";
    case kMpu6500WhoAmIValue:
      return "MPU6500/MPU9250";
    default:
      return "desconhecido";
  }
}

void printProbeDetails(TwoWire& wire, uint8_t address) {
  if (!AppConfig::FIRMWARE_I2C_DEBUG_ENABLED) {
    return;
  }

  uint8_t whoAmI = 0;
  if (readRegister(wire, address, kRegisterWhoAmI, whoAmI)) {
    AppLog::debugf("Leitura WHO_AM_I (0x75): 0x%02X [%s]\n",
                   whoAmI,
                   sensorNameFromWhoAmI(whoAmI));
  } else {
    AppLog::debug("Falha ao ler WHO_AM_I (0x75) via I2C.");
  }

  uint8_t powerMgmt1 = 0;
  if (readRegister(wire, address, kRegisterPowerMgmt1, powerMgmt1)) {
    AppLog::debugf("Leitura PWR_MGMT_1 (0x6B): 0x%02X\n", powerMgmt1);
  } else {
    AppLog::debug("Falha ao ler PWR_MGMT_1 (0x6B) via I2C.");
  }
}

}  // namespace

bool SensorMPU6050::begin(TwoWire& wire, uint8_t address) {
  AppLog::info("[sensor] begin start");

  pinMode(AppConfig::I2C_SDA_PIN, INPUT_PULLUP);
  pinMode(AppConfig::I2C_SCL_PIN, INPUT_PULLUP);

  wire_ = &wire;
  address_ = address;
  whoAmI_ = 0;
  ready_ = false;
  reading_ = SensorReading();
  filterInitialized_ = false;
  lastReadSucceeded_ = false;
  accelCalibrationApplied_ = false;
  calibrationStatus_ = "not_started";
  lastI2cError_ = kI2cErrorNone;
  consecutiveReadFailures_ = 0;
  totalI2cErrors_ = 0;
  i2cErrorsSinceSummary_ = 0;
  i2cRecoveryCount_ = 0;
  lastI2cSummaryAtMs_ = 0;
  lastRecoveryAttemptAtMs_ = 0;

  wire_->begin(AppConfig::I2C_SDA_PIN, AppConfig::I2C_SCL_PIN);
  wire_->setClock(AppConfig::I2C_CLOCK_HZ);
  wire_->setTimeOut(AppConfig::I2C_TIMEOUT_MS);
  delay(50);

  if (AppConfig::FIRMWARE_I2C_DEBUG_ENABLED) {
    AppLog::debugf("I2C iniciado em SDA=%u, SCL=%u, clock=%lu Hz\n",
                   AppConfig::I2C_SDA_PIN,
                   AppConfig::I2C_SCL_PIN,
                   static_cast<unsigned long>(AppConfig::I2C_CLOCK_HZ));
  }
  scanI2CBus(*wire_);
  printAddressProbe(*wire_, kPrimaryAddress);
  printAddressProbe(*wire_, kAlternateAddress);
  printProbeDetails(*wire_, address_);

  if (!readRegisterWithRetry(*wire_, address_, kRegisterWhoAmI, whoAmI_, "WHO_AM_I")) {
    if (address_ != kAlternateAddress) {
      AppLog::warnf("[sensor] probe failed address=0x%02X; trying fallback address=0x%02X\n",
                    address_,
                    kAlternateAddress);
      address_ = kAlternateAddress;
      printProbeDetails(*wire_, address_);

      if (!readRegisterWithRetry(*wire_, address_, kRegisterWhoAmI, whoAmI_, "WHO_AM_I")) {
        lastI2cError_ = kI2cErrorWhoAmIReadFailed;
        AppLog::error("[sensor] ready=0 reason=who_am_i_read_failed");
        ready_ = false;
        return false;
      }
    } else {
      lastI2cError_ = kI2cErrorWhoAmIReadFailed;
      AppLog::error("[sensor] ready=0 reason=who_am_i_read_failed");
      ready_ = false;
      return false;
    }
  }

  if (whoAmI_ != kMpu6050WhoAmIValue && whoAmI_ != kMpu6500WhoAmIValue) {
    lastI2cError_ = kI2cErrorWhoAmIIncompatible;
    AppLog::errorf("[sensor] ready=0 reason=who_am_i_incompatible value=0x%02X\n", whoAmI_);
    ready_ = false;
    return false;
  }

  AppLog::infof("[sensor] probe ok address=0x%02X who_am_i=0x%02X [%s]\n",
                address_,
                whoAmI_,
                sensorNameFromWhoAmI(whoAmI_));

  const bool configured = configureSensor(true);
  if (!configured) {
    AppLog::warn("[sensor] configuration incomplete; continuing if raw read works.");
  }

  int16_t rawAccelX = 0;
  int16_t rawAccelY = 0;
  int16_t rawAccelZ = 0;
  int16_t rawGyroX = 0;
  int16_t rawGyroY = 0;
  int16_t rawGyroZ = 0;

  if (!readRawSample(rawAccelX, rawAccelY, rawAccelZ, rawGyroX, rawGyroY, rawGyroZ)) {
    lastI2cError_ = kI2cErrorRawReadFailed;
    AppLog::error("[sensor] ready=0 reason=raw_read_failed_after_begin");
    ready_ = false;
    return false;
  }

  AppLog::infof("IMU compativel inicializado em 0x%02X com WHO_AM_I=0x%02X [%s].\n",
                address_,
                whoAmI_,
                sensorNameFromWhoAmI(whoAmI_));

  ready_ = true;
  lastReadSucceeded_ = true;
  AppLog::infof("[sensor] ready=1 calibrated=%u reason=%s configured=%u\n",
                accelCalibrationApplied_ ? 1U : 0U,
                calibrationStatus_,
                configured ? 1U : 0U);
  return true;
}

bool SensorMPU6050::configureSensor(bool runCalibration) {
  if (wire_ == nullptr) {
    return false;
  }

  bool configured = true;

  // Usa o PLL do giroscopio X para clock mais estavel e tira o sensor do sleep.
  configured =
      writeRegisterWithRetry(*wire_, address_, kRegisterPowerMgmt1, 0x01, "PWR_MGMT_1") &&
      configured;
  delay(20);

  // Mantem o DLPF em faixa moderada para reduzir ruido sem perder demais a dinamica.
  configured =
      writeRegisterWithRetry(*wire_, address_, kRegisterConfig, kDlpfCfg21Hz, "CONFIG") &&
      configured;

  configured =
      writeRegisterWithRetry(*wire_, address_, kRegisterGyroConfig, kDesiredGyroFs, "GYRO_CONFIG") &&
      configured;

  configured =
      writeRegisterWithRetry(*wire_, address_, kRegisterAccelConfig, kDesiredAccelFs, "ACCEL_CONFIG") &&
      configured;

  AppLog::info("[sensor] configured desired accel=+-8g gyro=+-500dps");

  // Em MPUs da familia 6500/9250, ACCEL_CONFIG2 controla o filtro do acelerometro.
  // Em chips que nao implementam o registro, a escrita pode ser ignorada sem afetar a leitura basica.
  writeRegisterWithRetry(*wire_, address_, kRegisterAccelConfig2, kDlpfCfg21Hz, "ACCEL_CONFIG2");

  delay(10);
  configured = refreshScaleFromRegisters() && configured;

  if (accelFsBits_ != kDesiredAccelFs || gyroFsBits_ != kDesiredGyroFs) {
    AppLog::warn("[sensor] range readback diferente do desejado; tentando reconfigurar uma vez.");
    configured =
        writeRegisterWithRetry(*wire_, address_, kRegisterGyroConfig, kDesiredGyroFs, "GYRO_CONFIG") &&
        configured;
    configured =
        writeRegisterWithRetry(*wire_, address_, kRegisterAccelConfig, kDesiredAccelFs, "ACCEL_CONFIG") &&
        configured;
    delay(10);
    configured = refreshScaleFromRegisters() && configured;
  }

  if (runCalibration) {
    calibrateAccelerometer();
  }

  return configured;
}

bool SensorMPU6050::refreshScaleFromRegisters() {
  if (wire_ == nullptr) {
    return false;
  }

  bool allRead = true;
  uint8_t accelConfig = 0;
  uint8_t gyroConfig = 0;

  if (readRegisterWithRetry(*wire_, address_, kRegisterAccelConfig, accelConfig, "ACCEL_CONFIG")) {
    accelFsBits_ = accelConfig & kFsSelMask;
    accelRangeG_ = accelRangeGFromFs(accelFsBits_);
    accelLsbPerG_ = accelLsbPerGFromFs(accelFsBits_);
  } else {
    allRead = false;
    accelFsBits_ = kDesiredAccelFs;
    accelRangeG_ = accelRangeGFromFs(accelFsBits_);
    accelLsbPerG_ = accelLsbPerGFromFs(accelFsBits_);
    AppLog::warn("[sensor] nao foi possivel ler ACCEL_CONFIG; usando divisor esperado para +-8g.");
  }

  if (readRegisterWithRetry(*wire_, address_, kRegisterGyroConfig, gyroConfig, "GYRO_CONFIG")) {
    gyroFsBits_ = gyroConfig & kFsSelMask;
    gyroRangeDegPerSec_ = gyroRangeDegPerSecFromFs(gyroFsBits_);
    gyroLsbPerDegPerSec_ = gyroLsbPerDegPerSecFromFs(gyroFsBits_);
  } else {
    allRead = false;
    gyroFsBits_ = kDesiredGyroFs;
    gyroRangeDegPerSec_ = gyroRangeDegPerSecFromFs(gyroFsBits_);
    gyroLsbPerDegPerSec_ = gyroLsbPerDegPerSecFromFs(gyroFsBits_);
    AppLog::warn("[sensor] nao foi possivel ler GYRO_CONFIG; usando divisor esperado para +-500dps.");
  }

  AppLog::infof("[sensor] mpu range accel=+-%ug gyro=+-%udps\n",
                static_cast<unsigned>(accelRangeG_),
                static_cast<unsigned>(gyroRangeDegPerSec_));
  AppLog::infof("[sensor] accel scale lsb_per_g=%.0f gyro_lsb_per_dps=%.1f\n",
                accelLsbPerG_,
                gyroLsbPerDegPerSec_);

  if (accelFsBits_ != kDesiredAccelFs) {
    AppLog::warnf("[sensor] accel range readback=+-%ug difere do desejado=+-%ug; usando divisor real %.0f LSB/g\n",
                  static_cast<unsigned>(accelRangeG_),
                  static_cast<unsigned>(accelRangeGFromFs(kDesiredAccelFs)),
                  accelLsbPerG_);
  }

  if (gyroFsBits_ != kDesiredGyroFs) {
    AppLog::warnf("[sensor] gyro range readback=+-%udps difere do desejado=+-%udps; usando divisor real %.1f LSB/dps\n",
                  static_cast<unsigned>(gyroRangeDegPerSec_),
                  static_cast<unsigned>(gyroRangeDegPerSecFromFs(kDesiredGyroFs)),
                  gyroLsbPerDegPerSec_);
  }

  return allRead;
}

void SensorMPU6050::calibrateAccelerometer() {
  accelCalibrationApplied_ = false;
  calibrationStatus_ = "not_started";
  accelOffsetXG_ = 0.0f;
  accelOffsetYG_ = 0.0f;
  accelOffsetZG_ = 0.0f;

  if (!AppConfig::SENSOR_ACCEL_CALIBRATION_ENABLED || wire_ == nullptr) {
    calibrationStatus_ = "disabled";
    AppLog::info("[sensor] calibration skipped reason=disabled continuing_without_offsets");
    return;
  }

  AppLog::infof("[sensor] calibration start samples=%u\n",
                static_cast<unsigned>(AppConfig::SENSOR_ACCEL_CALIBRATION_SAMPLES));

  float sumAccelXG = 0.0f;
  float sumAccelYG = 0.0f;
  float sumAccelZG = 0.0f;
  float sumAccelMagnitudeG = 0.0f;
  float sumRawAccelX = 0.0f;
  float sumRawAccelY = 0.0f;
  float sumRawAccelZ = 0.0f;
  float sumRawAccelMagnitude = 0.0f;
  float minRawAccelMagnitude = 1000000.0f;
  float maxRawAccelMagnitude = 0.0f;
  float minAccelMagnitudeG = 1000.0f;
  float maxAccelMagnitudeG = 0.0f;
  float sumGyroMagnitudeDegPerSec = 0.0f;
  uint16_t validSamples = 0;

  for (uint16_t index = 0; index < AppConfig::SENSOR_ACCEL_CALIBRATION_SAMPLES; ++index) {
    int16_t rawAccelX = 0;
    int16_t rawAccelY = 0;
    int16_t rawAccelZ = 0;
    int16_t rawGyroX = 0;
    int16_t rawGyroY = 0;
    int16_t rawGyroZ = 0;

    if (readRawSample(rawAccelX, rawAccelY, rawAccelZ, rawGyroX, rawGyroY, rawGyroZ)) {
      const float accelXG = static_cast<float>(rawAccelX) / accelLsbPerG_;
      const float accelYG = static_cast<float>(rawAccelY) / accelLsbPerG_;
      const float accelZG = static_cast<float>(rawAccelZ) / accelLsbPerG_;
      const float gyroXDegPerSec = static_cast<float>(rawGyroX) / gyroLsbPerDegPerSec_;
      const float gyroYDegPerSec = static_cast<float>(rawGyroY) / gyroLsbPerDegPerSec_;
      const float gyroZDegPerSec = static_cast<float>(rawGyroZ) / gyroLsbPerDegPerSec_;
      const float accelMagnitudeG =
          sqrtf((accelXG * accelXG) + (accelYG * accelYG) + (accelZG * accelZG));
      const float rawAccelMagnitude =
          sqrtf((static_cast<float>(rawAccelX) * static_cast<float>(rawAccelX)) +
                (static_cast<float>(rawAccelY) * static_cast<float>(rawAccelY)) +
                (static_cast<float>(rawAccelZ) * static_cast<float>(rawAccelZ)));
      const float gyroMagnitudeDegPerSec =
          sqrtf((gyroXDegPerSec * gyroXDegPerSec) +
                (gyroYDegPerSec * gyroYDegPerSec) +
                (gyroZDegPerSec * gyroZDegPerSec));

      sumAccelXG += accelXG;
      sumAccelYG += accelYG;
      sumAccelZG += accelZG;
      sumAccelMagnitudeG += accelMagnitudeG;
      sumRawAccelX += static_cast<float>(rawAccelX);
      sumRawAccelY += static_cast<float>(rawAccelY);
      sumRawAccelZ += static_cast<float>(rawAccelZ);
      sumRawAccelMagnitude += rawAccelMagnitude;
      minRawAccelMagnitude = fminf(minRawAccelMagnitude, rawAccelMagnitude);
      maxRawAccelMagnitude = fmaxf(maxRawAccelMagnitude, rawAccelMagnitude);
      minAccelMagnitudeG = fminf(minAccelMagnitudeG, accelMagnitudeG);
      maxAccelMagnitudeG = fmaxf(maxAccelMagnitudeG, accelMagnitudeG);
      sumGyroMagnitudeDegPerSec += gyroMagnitudeDegPerSec;
      ++validSamples;
    }

    delay(AppConfig::SENSOR_ACCEL_CALIBRATION_SAMPLE_DELAY_MS);
  }

  const uint16_t minRequiredSamples =
      static_cast<uint16_t>((AppConfig::SENSOR_ACCEL_CALIBRATION_SAMPLES * 8U) / 10U);
  if (validSamples < minRequiredSamples) {
    calibrationStatus_ = "read_failed";
    AppLog::warnf("[sensor] calibration skipped reason=read_failed samples=%u/%u\n",
                  static_cast<unsigned>(validSamples),
                  static_cast<unsigned>(AppConfig::SENSOR_ACCEL_CALIBRATION_SAMPLES));
    AppLog::warn("[sensor] calibration skipped continuing_without_offsets");
    return;
  }

  const float sampleCount = static_cast<float>(validSamples);
  float meanAccelXG = sumAccelXG / sampleCount;
  float meanAccelYG = sumAccelYG / sampleCount;
  float meanAccelZG = sumAccelZG / sampleCount;
  float meanAccelMagnitudeG = sumAccelMagnitudeG / sampleCount;
  const float meanGyroMagnitudeDegPerSec = sumGyroMagnitudeDegPerSec / sampleCount;
  float accelSpanG = maxAccelMagnitudeG - minAccelMagnitudeG;
  const float meanRawAccelMagnitude = sumRawAccelMagnitude / sampleCount;
  const float rawAccelSpan = maxRawAccelMagnitude - minRawAccelMagnitude;

  if ((meanAccelMagnitudeG < AppConfig::SENSOR_ACCEL_CALIBRATION_MIN_MAG_G ||
       meanAccelMagnitudeG > AppConfig::SENSOR_ACCEL_CALIBRATION_MAX_MAG_G) &&
      meanGyroMagnitudeDegPerSec <= AppConfig::SENSOR_ACCEL_CALIBRATION_MAX_GYRO_DPS) {
    const float inferredLsbPerG = nearestAccelLsbPerGForRest(meanRawAccelMagnitude);
    const float inferredMagnitudeG = meanRawAccelMagnitude / inferredLsbPerG;
    const float inferredSpanG = rawAccelSpan / inferredLsbPerG;

    if (fabsf(inferredLsbPerG - accelLsbPerG_) >= 1.0f &&
        inferredMagnitudeG >= AppConfig::SENSOR_ACCEL_CALIBRATION_MIN_MAG_G &&
        inferredMagnitudeG <= AppConfig::SENSOR_ACCEL_CALIBRATION_MAX_MAG_G &&
        inferredSpanG <= AppConfig::SENSOR_ACCEL_CALIBRATION_MAX_SPAN_G) {
      AppLog::warnf("[sensor] accel scale sanity adjusted raw_rest=%.0f old_lsb_per_g=%.0f new_lsb_per_g=%.0f old_mag=%.3f new_mag=%.3f\n",
                    meanRawAccelMagnitude,
                    accelLsbPerG_,
                    inferredLsbPerG,
                    meanAccelMagnitudeG,
                    inferredMagnitudeG);

      accelLsbPerG_ = inferredLsbPerG;
      accelFsBits_ = accelFsFromLsbPerG(inferredLsbPerG);
      accelRangeG_ = accelRangeGFromFs(accelFsBits_);

      meanAccelXG = (sumRawAccelX / sampleCount) / accelLsbPerG_;
      meanAccelYG = (sumRawAccelY / sampleCount) / accelLsbPerG_;
      meanAccelZG = (sumRawAccelZ / sampleCount) / accelLsbPerG_;
      meanAccelMagnitudeG = inferredMagnitudeG;
      accelSpanG = inferredSpanG;

      AppLog::infof("[sensor] mpu range accel=+-%ug gyro=+-%udps\n",
                    static_cast<unsigned>(accelRangeG_),
                    static_cast<unsigned>(gyroRangeDegPerSec_));
      AppLog::infof("[sensor] accel scale lsb_per_g=%.0f gyro_lsb_per_dps=%.1f\n",
                    accelLsbPerG_,
                    gyroLsbPerDegPerSec_);
    }
  }

  if (meanAccelMagnitudeG < AppConfig::SENSOR_ACCEL_CALIBRATION_MIN_MAG_G ||
      meanAccelMagnitudeG > AppConfig::SENSOR_ACCEL_CALIBRATION_MAX_MAG_G) {
    calibrationStatus_ = "scale_or_orientation";
    AppLog::warnf("[sensor] calibration skipped reason=scale_or_orientation magnitude_before=%.3f expected=%.2f..%.2f\n",
                  meanAccelMagnitudeG,
                  AppConfig::SENSOR_ACCEL_CALIBRATION_MIN_MAG_G,
                  AppConfig::SENSOR_ACCEL_CALIBRATION_MAX_MAG_G);
    AppLog::warn("[sensor] calibration skipped continuing_without_offsets");
    return;
  }

  if (accelSpanG > AppConfig::SENSOR_ACCEL_CALIBRATION_MAX_SPAN_G ||
      meanGyroMagnitudeDegPerSec > AppConfig::SENSOR_ACCEL_CALIBRATION_MAX_GYRO_DPS) {
    calibrationStatus_ = "unstable";
    AppLog::warnf("[sensor] calibration skipped reason=unstable span=%.3f gyro=%.2f\n",
                  accelSpanG,
                  meanGyroMagnitudeDegPerSec);
    AppLog::warn("[sensor] calibration skipped continuing_without_offsets");
    return;
  }

  const float targetAccelXG = meanAccelXG / meanAccelMagnitudeG;
  const float targetAccelYG = meanAccelYG / meanAccelMagnitudeG;
  const float targetAccelZG = meanAccelZG / meanAccelMagnitudeG;

  accelOffsetXG_ = meanAccelXG - targetAccelXG;
  accelOffsetYG_ = meanAccelYG - targetAccelYG;
  accelOffsetZG_ = meanAccelZG - targetAccelZG;
  accelCalibrationApplied_ = true;
  calibrationStatus_ = "applied";

  const float magnitudeAfter =
      sqrtf(((meanAccelXG - accelOffsetXG_) * (meanAccelXG - accelOffsetXG_)) +
            ((meanAccelYG - accelOffsetYG_) * (meanAccelYG - accelOffsetYG_)) +
            ((meanAccelZG - accelOffsetZG_) * (meanAccelZG - accelOffsetZG_)));

  AppLog::infof("[sensor] calibration ok samples=%u offset_ax=%.4f offset_ay=%.4f offset_az=%.4f magnitude_before=%.3f magnitude_after=%.3f\n",
                static_cast<unsigned>(validSamples),
                accelOffsetXG_,
                accelOffsetYG_,
                accelOffsetZG_,
                meanAccelMagnitudeG,
                magnitudeAfter);
}

bool SensorMPU6050::readRawSample(int16_t& accelX,
                                  int16_t& accelY,
                                  int16_t& accelZ,
                                  int16_t& gyroX,
                                  int16_t& gyroY,
                                  int16_t& gyroZ) {
  if (wire_ == nullptr) {
    return false;
  }

  uint8_t rawData[14] = {};

  bool readOk = false;
  for (uint8_t attempt = 1; attempt <= AppConfig::I2C_READ_RETRY_COUNT; ++attempt) {
    if (readRegisters(*wire_, address_, kRegisterAccelXoutH, rawData, sizeof(rawData))) {
      readOk = true;
      break;
    }

    delay(AppConfig::I2C_READ_RETRY_DELAY_MS);
  }

  if (!readOk) {
    return false;
  }

  accelX = joinBytes(rawData[0], rawData[1]);
  accelY = joinBytes(rawData[2], rawData[3]);
  accelZ = joinBytes(rawData[4], rawData[5]);
  gyroX = joinBytes(rawData[8], rawData[9]);
  gyroY = joinBytes(rawData[10], rawData[11]);
  gyroZ = joinBytes(rawData[12], rawData[13]);

  return true;
}

bool SensorMPU6050::update() {
  if (!ready_) {
    return false;
  }

  int16_t rawAccelX = 0;
  int16_t rawAccelY = 0;
  int16_t rawAccelZ = 0;
  int16_t rawGyroX = 0;
  int16_t rawGyroY = 0;
  int16_t rawGyroZ = 0;

  if (!readRawSample(rawAccelX, rawAccelY, rawAccelZ, rawGyroX, rawGyroY, rawGyroZ)) {
    lastReadSucceeded_ = false;
    lastI2cError_ = kI2cErrorReadFailed;
    ++totalI2cErrors_;
    ++i2cErrorsSinceSummary_;
    ++consecutiveReadFailures_;
    logI2cErrorSummaryIfDue(millis());

    if (consecutiveReadFailures_ >= AppConfig::SENSOR_I2C_RECOVERY_FAILURE_THRESHOLD) {
      recoverI2CBus();
    }

    return false;
  }

  lastReadSucceeded_ = true;
  lastI2cError_ = kI2cErrorNone;
  consecutiveReadFailures_ = 0;

  reading_.rawAccelX = rawAccelX;
  reading_.rawAccelY = rawAccelY;
  reading_.rawAccelZ = rawAccelZ;
  reading_.rawGyroX = rawGyroX;
  reading_.rawGyroY = rawGyroY;
  reading_.rawGyroZ = rawGyroZ;

  const float accelXG =
      (static_cast<float>(rawAccelX) / accelLsbPerG_) - accelOffsetXG_;
  const float accelYG =
      (static_cast<float>(rawAccelY) / accelLsbPerG_) - accelOffsetYG_;
  const float accelZG =
      (static_cast<float>(rawAccelZ) / accelLsbPerG_) - accelOffsetZG_;

  const float gyroXDegPerSec = static_cast<float>(rawGyroX) / gyroLsbPerDegPerSec_;
  const float gyroYDegPerSec = static_cast<float>(rawGyroY) / gyroLsbPerDegPerSec_;
  const float gyroZDegPerSec = static_cast<float>(rawGyroZ) / gyroLsbPerDegPerSec_;

  applyLowPass(accelXG, accelYG, accelZG, gyroXDegPerSec, gyroYDegPerSec, gyroZDegPerSec);
  computeDerivedValues();

  reading_.timestampMs = millis();
  reading_.valid = true;

  return true;
}

const SensorReading& SensorMPU6050::getReading() const {
  return reading_;
}

bool SensorMPU6050::isReady() const {
  return ready_;
}

bool SensorMPU6050::lastReadSucceeded() const {
  return lastReadSucceeded_;
}

unsigned long SensorMPU6050::consecutiveFailureCount() const {
  return consecutiveReadFailures_;
}

unsigned long SensorMPU6050::totalI2cErrorCount() const {
  return totalI2cErrors_;
}

unsigned long SensorMPU6050::i2cRecoveryCount() const {
  return i2cRecoveryCount_;
}

const char* SensorMPU6050::lastI2cError() const {
  return lastI2cError_;
}

uint8_t SensorMPU6050::activeAddress() const {
  return address_;
}

uint8_t SensorMPU6050::whoAmI() const {
  return whoAmI_;
}

uint8_t SensorMPU6050::accelRangeG() const {
  return accelRangeG_;
}

uint16_t SensorMPU6050::gyroRangeDegPerSec() const {
  return gyroRangeDegPerSec_;
}

float SensorMPU6050::accelLsbPerG() const {
  return accelLsbPerG_;
}

float SensorMPU6050::gyroLsbPerDegPerSec() const {
  return gyroLsbPerDegPerSec_;
}

bool SensorMPU6050::accelCalibrationApplied() const {
  return accelCalibrationApplied_;
}

const char* SensorMPU6050::calibrationStatus() const {
  return calibrationStatus_;
}

void SensorMPU6050::logI2cErrorSummaryIfDue(unsigned long nowMs) {
  if (!AppConfig::FIRMWARE_SENSOR_HEALTH_LOG_ENABLED) {
    return;
  }

  if (lastI2cSummaryAtMs_ > 0U &&
      (nowMs - lastI2cSummaryAtMs_) <
          AppConfig::SENSOR_I2C_ERROR_SUMMARY_INTERVAL_MS) {
    return;
  }

  lastI2cSummaryAtMs_ = nowMs;
  AppLog::warnf("[sensor] i2c errors summary last_window=%lu total=%lu consecutive=%lu recoveries=%lu last_error=%s\n",
                i2cErrorsSinceSummary_,
                totalI2cErrors_,
                consecutiveReadFailures_,
                i2cRecoveryCount_,
                lastI2cError_);
  i2cErrorsSinceSummary_ = 0;
}

bool SensorMPU6050::recoverI2CBus() {
  if (wire_ == nullptr) {
    return false;
  }

  const unsigned long nowMs = millis();
  if (lastRecoveryAttemptAtMs_ > 0U &&
      (nowMs - lastRecoveryAttemptAtMs_) <
          AppConfig::SENSOR_I2C_RECOVERY_COOLDOWN_MS) {
    return false;
  }

  lastRecoveryAttemptAtMs_ = nowMs;
  ++i2cRecoveryCount_;

  AppLog::warnf("[sensor] i2c recovery start reason=consecutive_failures count=%lu total=%lu\n",
                consecutiveReadFailures_,
                totalI2cErrors_);

  wire_->end();
  delay(20);
  pinMode(AppConfig::I2C_SDA_PIN, INPUT_PULLUP);
  pinMode(AppConfig::I2C_SCL_PIN, INPUT_PULLUP);
  wire_->begin(AppConfig::I2C_SDA_PIN, AppConfig::I2C_SCL_PIN);
  wire_->setClock(AppConfig::I2C_CLOCK_HZ);
  wire_->setTimeOut(AppConfig::I2C_TIMEOUT_MS);
  delay(20);
  AppLog::warn("[sensor] i2c bus restarted");

  const bool configured = configureSensor(false);

  int16_t rawAccelX = 0;
  int16_t rawAccelY = 0;
  int16_t rawAccelZ = 0;
  int16_t rawGyroX = 0;
  int16_t rawGyroY = 0;
  int16_t rawGyroZ = 0;

  if (readRawSample(rawAccelX, rawAccelY, rawAccelZ, rawGyroX, rawGyroY, rawGyroZ)) {
    consecutiveReadFailures_ = 0;
    lastI2cError_ = kI2cErrorNone;
    AppLog::infof("[sensor] recovery ok configured=%u recoveries=%lu\n",
                  configured ? 1U : 0U,
                  i2cRecoveryCount_);
    return true;
  }

  lastI2cError_ = kI2cErrorRecoveryFailed;
  AppLog::warn("[sensor] recovery failed, keeping last valid sample");
  return false;
}

void SensorMPU6050::applyLowPass(float rawAccelX,
                                 float rawAccelY,
                                 float rawAccelZ,
                                 float rawGyroX,
                                 float rawGyroY,
                                 float rawGyroZ) {
  if (!filterInitialized_) {
    filteredAccelXG_ = rawAccelX;
    filteredAccelYG_ = rawAccelY;
    filteredAccelZG_ = rawAccelZ;
    filteredGyroXDegPerSec_ = rawGyroX;
    filteredGyroYDegPerSec_ = rawGyroY;
    filteredGyroZDegPerSec_ = rawGyroZ;
    filterInitialized_ = true;
  } else {
    filteredAccelXG_ = AppConfig::ACCEL_FILTER_ALPHA * filteredAccelXG_ +
                       (1.0f - AppConfig::ACCEL_FILTER_ALPHA) * rawAccelX;
    filteredAccelYG_ = AppConfig::ACCEL_FILTER_ALPHA * filteredAccelYG_ +
                       (1.0f - AppConfig::ACCEL_FILTER_ALPHA) * rawAccelY;
    filteredAccelZG_ = AppConfig::ACCEL_FILTER_ALPHA * filteredAccelZG_ +
                       (1.0f - AppConfig::ACCEL_FILTER_ALPHA) * rawAccelZ;

    filteredGyroXDegPerSec_ = AppConfig::GYRO_FILTER_ALPHA * filteredGyroXDegPerSec_ +
                              (1.0f - AppConfig::GYRO_FILTER_ALPHA) * rawGyroX;
    filteredGyroYDegPerSec_ = AppConfig::GYRO_FILTER_ALPHA * filteredGyroYDegPerSec_ +
                              (1.0f - AppConfig::GYRO_FILTER_ALPHA) * rawGyroY;
    filteredGyroZDegPerSec_ = AppConfig::GYRO_FILTER_ALPHA * filteredGyroZDegPerSec_ +
                              (1.0f - AppConfig::GYRO_FILTER_ALPHA) * rawGyroZ;
  }

  reading_.accelXG = filteredAccelXG_;
  reading_.accelYG = filteredAccelYG_;
  reading_.accelZG = filteredAccelZG_;
  reading_.gyroXDegPerSec = filteredGyroXDegPerSec_;
  reading_.gyroYDegPerSec = filteredGyroYDegPerSec_;
  reading_.gyroZDegPerSec = filteredGyroZDegPerSec_;
}

void SensorMPU6050::computeDerivedValues() {
  reading_.accelMagnitudeG = sqrtf(
      (reading_.accelXG * reading_.accelXG) +
      (reading_.accelYG * reading_.accelYG) +
      (reading_.accelZG * reading_.accelZG));

  reading_.gyroMagnitudeDegPerSec = sqrtf(
      (reading_.gyroXDegPerSec * reading_.gyroXDegPerSec) +
      (reading_.gyroYDegPerSec * reading_.gyroYDegPerSec) +
      (reading_.gyroZDegPerSec * reading_.gyroZDegPerSec));

  const float accelYZMagnitude =
      sqrtf((reading_.accelYG * reading_.accelYG) + (reading_.accelZG * reading_.accelZG));

  reading_.pitchDeg = atan2f(-reading_.accelXG, accelYZMagnitude) * kRadiansToDegrees;
  reading_.rollDeg = atan2f(reading_.accelYG, reading_.accelZG) * kRadiansToDegrees;
}
