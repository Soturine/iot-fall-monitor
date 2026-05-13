const { elapsedMsSince } = require("../utils/correlation");
const { logger } = require("../utils/logger");

const GLOBAL_PLATFORM_ROOM = "scope:platform:global";

function organizationRoom(organizationId) {
  return `scope:org:${organizationId}`;
}

function patientRoom(patientId) {
  return `scope:patient:${patientId}`;
}

function getRoomsForAccessContext(accessContext) {
  if (!accessContext) {
    return [];
  }

  if (accessContext.isPlatformAdmin && !accessContext.activeOrganizationId) {
    return [GLOBAL_PLATFORM_ROOM];
  }

  if (!accessContext.activeOrganizationId) {
    return [];
  }

  if (accessContext.restrictToAssignedPatients) {
    return accessContext.assignedPatientIds.map(patientRoom);
  }

  return [organizationRoom(accessContext.activeOrganizationId)];
}

function getRoomsForScope(scope = {}) {
  const organizationId = scope.organizationId || null;
  const patientId = scope.patientId || null;
  const rooms = new Set();

  if (!organizationId) {
    rooms.add(GLOBAL_PLATFORM_ROOM);
    return [...rooms];
  }

  rooms.add(GLOBAL_PLATFORM_ROOM);
  rooms.add(organizationRoom(organizationId));

  if (patientId) {
    rooms.add(patientRoom(patientId));
  }

  return [...rooms];
}

function joinScopedRooms(socket) {
  const rooms = getRoomsForAccessContext(socket.accessContext);

  rooms.forEach((room) => {
    socket.join(room);
  });

  return rooms;
}

function emitScopedEvent(io, eventName, payload, scope, diagnostics = {}) {
  if (!io) {
    return;
  }

  const startedAt = process.hrtime.bigint();
  const rooms = getRoomsForScope(scope);
  if (!rooms.length) {
    return;
  }

  io.to(rooms).emit(eventName, payload);
  logger.debug("Realtime escopado emitido.", {
    correlationId: diagnostics.correlationId || null,
    eventName,
    roomCount: rooms.length,
    rooms,
    organizationId: scope?.organizationId || null,
    patientId: scope?.patientId || null,
    durationMs: elapsedMsSince(startedAt),
  });
}

module.exports = {
  emitScopedEvent,
  getRoomsForAccessContext,
  getRoomsForScope,
  joinScopedRooms,
};
