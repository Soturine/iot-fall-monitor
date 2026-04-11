import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import toast from "react-hot-toast";
import type { Socket } from "socket.io-client";

import { createRealtimeSocket } from "../services/socket";
import { humanizeAlertStatus, humanizeSeverity } from "../lib/format";
import type { AlertRecord } from "../types/api";
import { useAuth } from "./AuthContext";

type RealtimeContextValue = {
  socket: Socket | null;
  isConnected: boolean;
};

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

export function RealtimeProvider({ children }: PropsWithChildren) {
  const { token, activeOrganizationId } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const socket = useMemo(
    () => (token ? createRealtimeSocket(token, activeOrganizationId) : null),
    [activeOrganizationId, token],
  );

  useEffect(() => {
    if (!socket) {
      return;
    }
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleNewAlert = (alert: AlertRecord) => {
      toast.error(
        `${alert.device.name || alert.device.deviceIdentifier}: ${humanizeSeverity(alert.event.severity)}`,
      );
    };
    const handleUpdatedAlert = (alert: AlertRecord) => {
      toast.success(
        `Alerta ${alert.id} atualizado para ${humanizeAlertStatus(alert.status)}.`,
      );
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("alert:new", handleNewAlert);
    socket.on("alert:updated", handleUpdatedAlert);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("alert:new", handleNewAlert);
      socket.off("alert:updated", handleUpdatedAlert);
      socket.disconnect();
      setIsConnected(false);
    };
  }, [socket]);

  const value = {
    socket,
    isConnected,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRealtime() {
  const context = useContext(RealtimeContext);

  if (!context) {
    throw new Error("useRealtime must be used inside RealtimeProvider");
  }

  return context;
}
