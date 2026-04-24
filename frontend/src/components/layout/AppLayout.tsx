import { useState } from "react";
import {
  Activity,
  BellRing,
  Building2,
  ChevronRight,
  Cpu,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../../contexts/AuthContext";
import { useRealtime } from "../../contexts/RealtimeContext";
import {
  humanizeRealtimePhase,
  humanizeSocketDisconnectReason,
  realtimeTone,
} from "../../lib/format";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cn } from "../../lib/cn";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: Activity },
  { to: "/patients", label: "Pacientes", icon: UserRound },
  { to: "/devices", label: "Dispositivos", icon: Cpu },
  { to: "/alerts", label: "Alertas & Histórico", icon: BellRing },
  { to: "/organization", label: "Organização", icon: UsersRound },
];

export function AppLayout() {
  const {
    user,
    logout,
    activeOrganization,
    activeOrganizationId,
    activeRole,
    setActiveOrganizationId,
  } = useAuth();
  const {
    connectionPhase,
    isConnected,
    lastConnectError,
    lastConnectErrorCode,
    lastDisconnectReason,
    reconnectAttempts,
  } = useRealtime();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const memberships = user?.memberships || [];
  const realtimeDetail = isConnected
    ? "Canal do painel conectado ao backend. Se um device aparecer offline, isso reflete ausencia recente de telemetria MQTT, nao o socket do navegador."
    : lastConnectError
      ? `${lastConnectError}${lastConnectErrorCode ? ` (${lastConnectErrorCode})` : ""}`
      : `Socket do painel desconectado: ${humanizeSocketDisconnectReason(lastDisconnectReason)}. O ultimo snapshot continua visivel ate a reconexao.`;

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate("/login", {
      replace: true,
      state: { loggedOut: true },
    });
  }

  function handleSwitchUser() {
    setMenuOpen(false);
    navigate("/login?force=1", { replace: true });
  }

  return (
    <div className="min-h-screen px-4 py-4 md:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1500px] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside
          className={cn(
            "panel fixed inset-y-4 left-4 z-40 w-[calc(100vw-2rem)] max-w-sm overflow-hidden p-0 transition duration-300 lg:static lg:w-auto lg:max-w-none",
            menuOpen ? "translate-x-0" : "-translate-x-[110%] lg:translate-x-0",
          )}
        >
          <div className="flex h-full flex-col bg-app-grid bg-[size:24px_24px]">
            <div className="border-b border-surface-100 px-6 py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.34em] text-surface-500">
                    Projeto Queda
                  </p>
                  <h1 className="mt-3 font-display text-3xl text-surface-900">
                    Monitor IoT
                  </h1>
                  <p className="mt-2 text-sm text-surface-600">
                    Escopo por organização, pacientes, dispositivos pareados e
                    resposta operacional.
                  </p>
                </div>
                <Button
                  className="lg:hidden"
                  onClick={() => setMenuOpen(false)}
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2 px-4 py-4">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition",
                      isActive
                        ? "bg-surface-800 text-white shadow-panel"
                        : "text-surface-700 hover:bg-white/75",
                    )
                  }
                  onClick={() => setMenuOpen(false)}
                  to={to}
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        {label}
                      </span>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition",
                          isActive ? "opacity-100" : "opacity-40",
                        )}
                      />
                    </>
                  )}
                </NavLink>
              ))}
            </div>

            <div className="mt-auto border-t border-surface-100 p-4">
              <div className="rounded-3xl bg-surface-900 p-4 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-white/60">
                      Sessão
                    </p>
                    <p className="mt-2 font-semibold">{user?.name}</p>
                    <p className="text-sm text-white/70">{user?.email}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.24em] text-white/50">
                      {activeRole || user?.globalRole || "sem papel"}
                    </p>
                  </div>
                  <ShieldCheck className="h-8 w-8 text-amber-300" />
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-white/60">
                    <Building2 className="h-3.5 w-3.5" />
                    Organização ativa
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {activeOrganization?.name || "Sem organização selecionada"}
                  </p>
                  {memberships.length > 1 ? (
                    <select
                      className="mt-3 w-full rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                      onChange={(event) => setActiveOrganizationId(event.target.value)}
                      value={activeOrganizationId || ""}
                    >
                      {memberships.map((membership) => (
                        <option
                          key={membership.id}
                          value={membership.organization.id}
                        >
                          {membership.organization.name}
                        </option>
                      ))}
                    </select>
                  ) : memberships.length === 1 ? (
                    <p className="mt-3 text-xs text-white/65">
                      Esta sessao possui uma unica organizacao ativa.
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-white/65">
                      Nenhuma membership ativa disponivel para troca neste perfil.
                    </p>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge tone={realtimeTone(connectionPhase) as never}>
                      {humanizeRealtimePhase(connectionPhase)}
                    </Badge>
                    <button
                      className="text-xs font-semibold text-white/80 underline-offset-4 transition hover:text-white hover:underline"
                      onClick={handleSwitchUser}
                      type="button"
                    >
                      Trocar usuario
                    </button>
                  </div>
                  <p className="text-xs leading-5 text-white/70">
                    {realtimeDetail}
                    {!isConnected && reconnectAttempts > 0
                      ? ` Tentativas de reconexao nesta sessao: ${reconnectAttempts}.`
                      : ""}
                  </p>
                  <Button
                    className="w-full justify-center border border-white/15 bg-white/10 text-white hover:border-white/30 hover:bg-white/20"
                    onClick={handleLogout}
                    variant="secondary"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-4 rounded-[28px] border border-white/70 bg-white/80 px-4 py-3 shadow-panel backdrop-blur">
            <div className="flex items-center gap-3">
              <Button
                className="lg:hidden"
                onClick={() => setMenuOpen(true)}
                variant="secondary"
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
                  Monitoramento multi-tenant
                </p>
                <p className="text-sm text-surface-600">
                  Organização ativa, pacientes, devices locked e atualização em
                  tempo real filtrada no backend.
                </p>
                <p className="mt-1 text-xs text-surface-500">
                  Canal do painel e saude MQTT/device aparecem separados para evitar diagnostico falso quando o navegador perde o socket.
                </p>
              </div>
            </div>
            <div className="text-right">
              <Badge tone={realtimeTone(connectionPhase) as never}>
                {humanizeRealtimePhase(connectionPhase)}
              </Badge>
              <p className="mt-2 max-w-xs text-xs text-surface-500">
                {realtimeDetail}
              </p>
            </div>
          </div>

          <Outlet />
        </main>
      </div>
      {menuOpen ? (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-surface-900/30 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
    </div>
  );
}
