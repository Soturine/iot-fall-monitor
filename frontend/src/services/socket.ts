import { io } from "socket.io-client";

import { socketOrigin } from "../config/runtime";

export function createRealtimeSocket(token: string, organizationId: string | null) {
  return io(socketOrigin, {
    auth: {
      token,
      organizationId: organizationId || undefined,
    },
    transports: ["websocket", "polling"],
  });
}
