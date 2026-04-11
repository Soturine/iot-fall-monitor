#pragma once

#include "app_config.h"
#include "models.h"

class EventBuffer {
 public:
  bool push(const String& topic, const String& payload, unsigned long queuedAtMs);
  bool peek(BufferedEvent& event) const;
  bool pop();

  bool isEmpty() const;
  size_t size() const;
  size_t capacity() const;
  size_t copyTo(BufferedEvent* snapshot, size_t maxCount) const;
  void restoreFrom(const BufferedEvent* snapshot, size_t count);
  bool isDirty() const;
  void markPersisted();

 private:
  BufferedEvent events_[AppConfig::EVENT_BUFFER_CAPACITY];
  size_t head_ = 0;
  size_t tail_ = 0;
  size_t count_ = 0;
  bool dirty_ = false;
};
