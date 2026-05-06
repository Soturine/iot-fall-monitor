const { Server } = require("socket.io");

const { verifyToken } = require("../utils/auth");
const { logger } = require("../utils/logger");
const { loadAccessContext } = require("../services/scopeService");
const { joinScopedRooms } = require("./scopedEmitter");

function buildSocketAuthError(message, code) {
  const error = new Error(message);
  error.data = {
    code,
  };
  return error;
}

function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers.authorization?.replace("Bearer ", "")?.trim();

    if (!token) {
      return next(buildSocketAuthError("Token do painel ausente.", "SOCKET_TOKEN_MISSING"));
    }

    try {
      const payload = verifyToken(token);
      const accessContext = await loadAccessContext({
        userId: Number(payload.id || payload.sub),
        requestedOrganizationId: socket.handshake.auth?.organizationId || null,
      });
      socket.user = accessContext.user;
      socket.accessContext = accessContext;
      return next();
    } catch (error) {
      logger.warn("Falha ao autenticar Socket.IO.", {
        message: error.message,
      });
      return next(
        buildSocketAuthError(
          "Falha ao autenticar o canal em tempo real.",
          "SOCKET_UNAUTHORIZED",
        ),
      );
    }
  });

  io.on("connection", (socket) => {
    const rooms = joinScopedRooms(socket);

    logger.debug("Cliente Socket.IO conectado.", {
      socketId: socket.id,
      userId: socket.user?.id || null,
      organizationId: socket.accessContext?.activeOrganizationId || null,
      roomCount: rooms.length,
    });

    socket.on("disconnect", (reason) => {
      logger.debug("Cliente Socket.IO desconectado.", {
        socketId: socket.id,
        reason,
      });
    });
  });

  return io;
}

module.exports = {
  createSocketServer,
};
