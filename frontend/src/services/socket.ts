import { io } from "socket.io-client";

import { socketOrigin } from "../config/runtime";

export function createRealtimeSocket(token: string, organizationId: string | null) {
  return io(socketOrigin, {
    autoConnect: true,
    auth: {
      token,
      organizationId: organizationId || undefined,
    },
    reconnectionDelay: 1500,
    reconnectionDelayMax: 5000,
    timeout: 8000,
    transports: ["websocket", "polling"],
  });
}
