#pragma once

#include <Arduino.h>

#include "app_config.h"

namespace AppLog {

inline bool enabled(uint8_t level) {
  return level <= AppConfig::FIRMWARE_LOG_LEVEL;
}

inline void printLine(uint8_t level, const char* prefix, const char* message) {
  if (!enabled(level)) {
    return;
  }

  Serial.print(prefix);
  Serial.println(message);
}

inline void printLine(uint8_t level, const char* prefix, const String& message) {
  if (!enabled(level)) {
    return;
  }

  Serial.print(prefix);
  Serial.println(message);
}

template <typename... Args>
inline void printf(uint8_t level, const char* prefix, const char* format, Args... args) {
  if (!enabled(level)) {
    return;
  }

  Serial.print(prefix);
  Serial.printf(format, args...);
}

inline void error(const char* message) {
  printLine(AppConfig::LOG_LEVEL_ERROR, "[error] ", message);
}

inline void error(const String& message) {
  printLine(AppConfig::LOG_LEVEL_ERROR, "[error] ", message);
}

template <typename... Args>
inline void errorf(const char* format, Args... args) {
  printf(AppConfig::LOG_LEVEL_ERROR, "[error] ", format, args...);
}

inline void warn(const char* message) {
  printLine(AppConfig::LOG_LEVEL_WARN, "[warn] ", message);
}

inline void warn(const String& message) {
  printLine(AppConfig::LOG_LEVEL_WARN, "[warn] ", message);
}

template <typename... Args>
inline void warnf(const char* format, Args... args) {
  printf(AppConfig::LOG_LEVEL_WARN, "[warn] ", format, args...);
}

inline void info(const char* message) {
  printLine(AppConfig::LOG_LEVEL_INFO, "[info] ", message);
}

inline void info(const String& message) {
  printLine(AppConfig::LOG_LEVEL_INFO, "[info] ", message);
}

template <typename... Args>
inline void infof(const char* format, Args... args) {
  printf(AppConfig::LOG_LEVEL_INFO, "[info] ", format, args...);
}

inline void debug(const char* message) {
  printLine(AppConfig::LOG_LEVEL_DEBUG, "[debug] ", message);
}

inline void debug(const String& message) {
  printLine(AppConfig::LOG_LEVEL_DEBUG, "[debug] ", message);
}

template <typename... Args>
inline void debugf(const char* format, Args... args) {
  printf(AppConfig::LOG_LEVEL_DEBUG, "[debug] ", format, args...);
}

}  // namespace AppLog
