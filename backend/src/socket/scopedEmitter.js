const { canAccessScope } = require("../services/scopeService");

function emitScopedEvent(io, eventName, payload, scope) {
  if (!io) {
    return;
  }

  for (const socket of io.sockets.sockets.values()) {
    if (!socket.accessContext) {
      continue;
    }

    if (
      canAccessScope(
        socket.accessContext,
        scope.organizationId || null,
        scope.patientId || null,
      )
    ) {
      socket.emit(eventName, payload);
    }
  }
}

module.exports = {
  emitScopedEvent,
};
