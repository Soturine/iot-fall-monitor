#include "event_buffer.h"

bool EventBuffer::push(const String& topic, const String& payload, unsigned long queuedAtMs) {
  if (count_ == AppConfig::EVENT_BUFFER_CAPACITY) {
    // Quando o buffer lota, preservamos o evento mais recente e descartamos o mais antigo.
    head_ = (head_ + 1U) % AppConfig::EVENT_BUFFER_CAPACITY;
    --count_;
  }

  events_[tail_].topic = topic;
  events_[tail_].payload = payload;
  events_[tail_].queuedAtMs = queuedAtMs;

  tail_ = (tail_ + 1U) % AppConfig::EVENT_BUFFER_CAPACITY;
  ++count_;
  dirty_ = true;

  return true;
}

bool EventBuffer::peek(BufferedEvent& event) const {
  if (count_ == 0U) {
    return false;
  }

  // Peek permite tentar o envio sem remover o item da fila.
  event = events_[head_];
  return true;
}

bool EventBuffer::pop() {
  if (count_ == 0U) {
    return false;
  }

  // A fila e circular para evitar alocacao dinamica no loop principal.
  events_[head_] = BufferedEvent{};
  head_ = (head_ + 1U) % AppConfig::EVENT_BUFFER_CAPACITY;
  --count_;
  dirty_ = true;

  return true;
}

bool EventBuffer::isEmpty() const {
  return count_ == 0U;
}

size_t EventBuffer::size() const {
  return count_;
}

size_t EventBuffer::capacity() const {
  return AppConfig::EVENT_BUFFER_CAPACITY;
}

size_t EventBuffer::copyTo(BufferedEvent* snapshot, size_t maxCount) const {
  if (snapshot == nullptr || maxCount == 0U || count_ == 0U) {
    return 0U;
  }

  const size_t snapshotCount = count_ < maxCount ? count_ : maxCount;
  for (size_t index = 0; index < snapshotCount; ++index) {
    const size_t sourceIndex = (head_ + index) % AppConfig::EVENT_BUFFER_CAPACITY;
    snapshot[index] = events_[sourceIndex];
  }

  return snapshotCount;
}

void EventBuffer::restoreFrom(const BufferedEvent* snapshot, size_t count) {
  head_ = 0;
  tail_ = 0;
  count_ = 0;

  if (snapshot == nullptr || count == 0U) {
    dirty_ = true;
    return;
  }

  const size_t restoreCount =
      count < AppConfig::EVENT_BUFFER_CAPACITY ? count : AppConfig::EVENT_BUFFER_CAPACITY;

  for (size_t index = 0; index < restoreCount; ++index) {
    events_[tail_] = snapshot[index];
    tail_ = (tail_ + 1U) % AppConfig::EVENT_BUFFER_CAPACITY;
    ++count_;
  }

  dirty_ = true;
}

bool EventBuffer::isDirty() const {
  return dirty_;
}

void EventBuffer::markPersisted() {
  dirty_ = false;
}
