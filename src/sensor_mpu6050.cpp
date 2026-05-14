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

constexpr float kDefaultAccelLsbPerG = 4096.0f;
constexpr float kDefaultGyroLsbPerDegPerSec = 65.5f;

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

bool readRegisters(TwoWire& wire,
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

bool readRegister(TwoWire& wire, uint8_t address, uint8_t reg, uint8_t& value) {
  return readRegisters(wire, address, reg, &value, 1);
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
  pinMode(AppConfig::I2C_SDA_PIN, INPUT_PULLUP);
  pinMode(AppConfig::I2C_SCL_PIN, INPUT_PULLUP);

  wire_ = &wire;
  address_ = address;
  whoAmI_ = 0;

  wire_->begin(AppConfig::I2C_SDA_PIN, AppConfig::I2C_SCL_PIN);
  wire_->setClock(100000);
  wire_->setTimeOut(50);
  delay(50);

  if (AppConfig::FIRMWARE_I2C_DEBUG_ENABLED) {
    AppLog::debugf("I2C iniciado em SDA=%u, SCL=%u, clock=100000 Hz\n",
                   AppConfig::I2C_SDA_PIN,
                   AppConfig::I2C_SCL_PIN);
  }
  scanI2CBus(*wire_);
  printAddressProbe(*wire_, kPrimaryAddress);
  printAddressProbe(*wire_, kAlternateAddress);
  printProbeDetails(*wire_, address_);

  if (!readRegister(*wire_, address_, kRegisterWhoAmI, whoAmI_)) {
    if (address_ != kAlternateAddress) {
      AppLog::warnf("Falha em 0x%02X. Tentando endereco alternativo 0x%02X...\n",
                    address_,
                    kAlternateAddress);
      address_ = kAlternateAddress;
      printProbeDetails(*wire_, address_);

      if (!readRegister(*wire_, address_, kRegisterWhoAmI, whoAmI_)) {
        AppLog::error("Nao foi possivel identificar o sensor no barramento I2C.");
        ready_ = false;
        return false;
      }
    } else {
      AppLog::error("Nao foi possivel identificar o sensor no barramento I2C.");
      ready_ = false;
      return false;
    }
  }

  if (whoAmI_ != kMpu6050WhoAmIValue && whoAmI_ != kMpu6500WhoAmIValue) {
    AppLog::errorf("WHO_AM_I 0x%02X nao eh compativel com o driver atual.\n", whoAmI_);
    ready_ = false;
    return false;
  }

  if (!configureSensor()) {
    AppLog::error("Falha ao configurar os registradores do IMU.");
    ready_ = false;
    return false;
  }

  AppLog::infof("IMU compativel inicializado em 0x%02X com WHO_AM_I=0x%02X [%s].\n",
                address_,
                whoAmI_,
                sensorNameFromWhoAmI(whoAmI_));

  ready_ = true;
  return true;
}

bool SensorMPU6050::configureSensor() {
  if (wire_ == nullptr) {
    return false;
  }

  // Usa o PLL do giroscopio X para clock mais estavel e tira o sensor do sleep.
  if (!writeRegister(*wire_, address_, kRegisterPowerMgmt1, 0x01)) {
    return false;
  }
  delay(20);

  // Mantem o DLPF em faixa moderada para reduzir ruido sem perder demais a dinamica.
  if (!writeRegister(*wire_, address_, kRegisterConfig, kDlpfCfg21Hz)) {
    return false;
  }

  if (!writeRegister(*wire_, address_, kRegisterGyroConfig, kDesiredGyroFs)) {
    return false;
  }

  if (!writeRegister(*wire_, address_, kRegisterAccelConfig, kDesiredAccelFs)) {
    return false;
  }

  // Em MPUs da familia 6500/9250, ACCEL_CONFIG2 controla o filtro do acelerometro.
  // Em chips que nao implementam o registro, a escrita pode ser ignorada sem afetar a leitura basica.
  writeRegister(*wire_, address_, kRegisterAccelConfig2, kDlpfCfg21Hz);

  delay(10);
  refreshScaleFromRegisters();

  if (accelFsBits_ != kDesiredAccelFs || gyroFsBits_ != kDesiredGyroFs) {
    AppLog::warn("[sensor] range readback diferente do desejado; tentando reconfigurar uma vez.");
    writeRegister(*wire_, address_, kRegisterGyroConfig, kDesiredGyroFs);
    writeRegister(*wire_, address_, kRegisterAccelConfig, kDesiredAccelFs);
    delay(10);
    refreshScaleFromRegisters();
  }

  calibrateAccelerometer();

  return true;
}

bool SensorMPU6050::refreshScaleFromRegisters() {
  if (wire_ == nullptr) {
    return false;
  }

  bool allRead = true;
  uint8_t accelConfig = 0;
  uint8_t gyroConfig = 0;

  if (readRegister(*wire_, address_, kRegisterAccelConfig, accelConfig)) {
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

  if (readRegister(*wire_, address_, kRegisterGyroConfig, gyroConfig)) {
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
  accelOffsetXG_ = 0.0f;
  accelOffsetYG_ = 0.0f;
  accelOffsetZG_ = 0.0f;

  if (!AppConfig::SENSOR_ACCEL_CALIBRATION_ENABLED || wire_ == nullptr) {
    AppLog::info("[sensor] calibration skipped reason=disabled");
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
    AppLog::warnf("[sensor] calibration skipped reason=read_failed samples=%u/%u\n",
                  static_cast<unsigned>(validSamples),
                  static_cast<unsigned>(AppConfig::SENSOR_ACCEL_CALIBRATION_SAMPLES));
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
    AppLog::warnf("[sensor] calibration skipped reason=scale_or_orientation magnitude_before=%.3f expected=%.2f..%.2f\n",
                  meanAccelMagnitudeG,
                  AppConfig::SENSOR_ACCEL_CALIBRATION_MIN_MAG_G,
                  AppConfig::SENSOR_ACCEL_CALIBRATION_MAX_MAG_G);
    return;
  }

  if (accelSpanG > AppConfig::SENSOR_ACCEL_CALIBRATION_MAX_SPAN_G ||
      meanGyroMagnitudeDegPerSec > AppConfig::SENSOR_ACCEL_CALIBRATION_MAX_GYRO_DPS) {
    AppLog::warnf("[sensor] calibration skipped reason=unstable span=%.3f gyro=%.2f\n",
                  accelSpanG,
                  meanGyroMagnitudeDegPerSec);
    return;
  }

  const float targetAccelXG = meanAccelXG / meanAccelMagnitudeG;
  const float targetAccelYG = meanAccelYG / meanAccelMagnitudeG;
  const float targetAccelZG = meanAccelZG / meanAccelMagnitudeG;

  accelOffsetXG_ = meanAccelXG - targetAccelXG;
  accelOffsetYG_ = meanAccelYG - targetAccelYG;
  accelOffsetZG_ = meanAccelZG - targetAccelZG;
  accelCalibrationApplied_ = true;

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
  if (!readRegisters(*wire_, address_, kRegisterAccelXoutH, rawData, sizeof(rawData))) {
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
    return false;
  }

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
