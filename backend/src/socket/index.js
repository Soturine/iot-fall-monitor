const { Server } = require("socket.io");

const { verifyToken } = require("../utils/auth");
const { logger } = require("../utils/logger");
const { loadAccessContext } = require("../services/scopeService");

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
      return next(new Error("Unauthorized"));
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
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    logger.debug("Cliente Socket.IO conectado.", {
      socketId: socket.id,
      userId: socket.user?.id || null,
      organizationId: socket.accessContext?.activeOrganizationId || null,
    });

    socket.on("disconnect", () => {
      logger.debug("Cliente Socket.IO desconectado.", { socketId: socket.id });
    });
  });

  return io;
}

module.exports = {
  createSocketServer,
};
