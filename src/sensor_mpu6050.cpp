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
constexpr uint8_t kGyroFs500Dps = 0x08;
constexpr uint8_t kAccelFs8G = 0x10;

constexpr float kAccelLsbPerG = 4096.0f;
constexpr float kGyroLsbPerDegPerSec = 65.5f;

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

  if (!writeRegister(*wire_, address_, kRegisterGyroConfig, kGyroFs500Dps)) {
    return false;
  }

  if (!writeRegister(*wire_, address_, kRegisterAccelConfig, kAccelFs8G)) {
    return false;
  }

  // Em MPUs da familia 6500/9250, ACCEL_CONFIG2 controla o filtro do acelerometro.
  // Em chips que nao implementam o registro, a escrita pode ser ignorada sem afetar a leitura basica.
  writeRegister(*wire_, address_, kRegisterAccelConfig2, kDlpfCfg21Hz);

  return true;
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

  const float accelXG = static_cast<float>(rawAccelX) / kAccelLsbPerG;
  const float accelYG = static_cast<float>(rawAccelY) / kAccelLsbPerG;
  const float accelZG = static_cast<float>(rawAccelZ) / kAccelLsbPerG;

  const float gyroXDegPerSec = static_cast<float>(rawGyroX) / kGyroLsbPerDegPerSec;
  const float gyroYDegPerSec = static_cast<float>(rawGyroY) / kGyroLsbPerDegPerSec;
  const float gyroZDegPerSec = static_cast<float>(rawGyroZ) / kGyroLsbPerDegPerSec;

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
