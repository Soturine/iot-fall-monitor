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

import { humanizeAlertStatus, humanizeSeverity } from "../lib/format";
import { createRealtimeSocket } from "../services/socket";
import type { AlertRecord } from "../types/api";
import { useAuth } from "./AuthContext";

export type RealtimeConnectionPhase =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

type RealtimeContextValue = {
  socket: Socket | null;
  isConnected: boolean;
  connectionPhase: RealtimeConnectionPhase;
  activeTransport: string | null;
  lastDisconnectReason: string | null;
  lastConnectError: string | null;
  lastConnectErrorCode: string | null;
  reconnectAttempts: number;
};

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

export function RealtimeProvider({ children }: PropsWithChildren) {
  const { token, activeOrganizationId } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionPhase, setConnectionPhase] =
    useState<RealtimeConnectionPhase>(token ? "connecting" : "idle");
  const [activeTransport, setActiveTransport] = useState<string | null>(null);
  const [lastDisconnectReason, setLastDisconnectReason] = useState<string | null>(null);
  const [lastConnectError, setLastConnectError] = useState<string | null>(null);
  const [lastConnectErrorCode, setLastConnectErrorCode] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const socket = useMemo(
    () => (token ? createRealtimeSocket(token, activeOrganizationId) : null),
    [activeOrganizationId, token],
  );

  useEffect(() => {
    if (!socket) {
      return;
    }

    const manager = socket.io;
    const handleConnect = () => {
      setIsConnected(true);
      setConnectionPhase("connected");
      setActiveTransport(socket.io.engine?.transport?.name || null);
      setLastConnectError(null);
      setLastConnectErrorCode(null);
      setReconnectAttempts(0);
    };
    const handleDisconnect = (reason: string) => {
      setIsConnected(false);
      setActiveTransport(socket.io.engine?.transport?.name || null);
      setLastDisconnectReason(reason);
      setConnectionPhase(reason === "io client disconnect" ? "idle" : "reconnecting");
    };
    const handleConnectError = (
      error: Error & { data?: { code?: string | null } },
    ) => {
      setIsConnected(false);
      setConnectionPhase("error");
      setLastConnectError(error.message || "Falha ao conectar o painel em tempo real.");
      setLastConnectErrorCode(error.data?.code || null);
    };
    const handleReconnectAttempt = (attempt: number) => {
      setConnectionPhase("reconnecting");
      setReconnectAttempts(attempt);
    };
    const handleReconnectFailed = () => {
      setConnectionPhase("error");
    };
    const handleTransportUpgrade = () => {
      setActiveTransport(socket.io.engine?.transport?.name || null);
    };
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
    socket.on("connect_error", handleConnectError);
    socket.on("alert:new", handleNewAlert);
    socket.on("alert:updated", handleUpdatedAlert);
    manager.on("reconnect_attempt", handleReconnectAttempt);
    manager.on("reconnect_failed", handleReconnectFailed);
    manager.on("reconnect", handleConnect);
    socket.io.engine?.on("upgrade", handleTransportUpgrade);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("alert:new", handleNewAlert);
      socket.off("alert:updated", handleUpdatedAlert);
      manager.off("reconnect_attempt", handleReconnectAttempt);
      manager.off("reconnect_failed", handleReconnectFailed);
      manager.off("reconnect", handleConnect);
      socket.io.engine?.off("upgrade", handleTransportUpgrade);
      socket.disconnect();
      setIsConnected(false);
      setConnectionPhase(token ? "connecting" : "idle");
      setActiveTransport(null);
      setLastConnectError(null);
      setLastConnectErrorCode(null);
      setReconnectAttempts(0);
    };
  }, [socket, token]);

  const value = {
    socket,
    isConnected: socket ? isConnected : false,
    connectionPhase: socket ? connectionPhase : token ? "connecting" : "idle",
    activeTransport: socket ? activeTransport : null,
    lastDisconnectReason,
    lastConnectError,
    lastConnectErrorCode,
    reconnectAttempts: socket ? reconnectAttempts : 0,
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
