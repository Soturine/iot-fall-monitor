import { HeartPulse, ShieldAlert, ShieldCheck, Siren, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "../components/ui/Button";
import { LoadingState } from "../components/ui/LoadingState";
import { useAuth } from "../contexts/AuthContext";

type LoginNavigationState = {
  from?: {
    pathname?: string;
  };
  loggedOut?: boolean;
  switchUser?: boolean;
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, login, logout, register, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    organizationName: "",
    organizationType: "family",
  });
  const navigationState = (location.state as LoginNavigationState | null) ?? null;
  const shouldForceLogin = new URLSearchParams(location.search).get("force") === "1";
  const statusTitle = navigationState?.switchUser
    ? "Troca de sessao"
    : navigationState?.loggedOut
      ? "Logout concluido"
      : null;
  const statusMessage = navigationState?.switchUser
    ? "Sessao anterior encerrada. Entre com outra conta."
    : navigationState?.loggedOut
      ? "Sessao encerrada. Voce pode entrar novamente quando quiser."
      : null;

  useEffect(() => {
    if (!shouldForceLogin) {
      return;
    }

    if (isAuthenticated) {
      logout();
    }

    navigate("/login", {
      replace: true,
      state: { switchUser: true },
    });
  }, [isAuthenticated, logout, navigate, shouldForceLogin]);

  if (isAuthenticated && shouldForceLogin) {
    return <LoadingState label="Encerrando sessao atual..." />;
  }

  if (isAuthenticated) {
    return <Navigate replace to="/dashboard" />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      if (mode === "login") {
        await login(form.email, form.password);
        toast.success("Sessao iniciada com sucesso.");
      } else {
        await register(
          form.name,
          form.email,
          form.password,
          form.organizationName,
          form.organizationType,
        );
        toast.success("Organizacao criada e sessao iniciada.");
      }

      const target = navigationState?.from?.pathname;
      navigate(target || "/dashboard", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na autenticacao.");
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="panel-dark relative overflow-hidden px-8 py-10 md:px-10">
          <img
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-30"
            src="/images/hero-idosa-familia-enfermeira-campus.png"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-surface-900/85 via-surface-900/70 to-teal-900/60" />
          <div className="absolute inset-0 bg-app-grid bg-[size:28px_28px] opacity-20" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-teal-300 ring-1 ring-white/15 backdrop-blur">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-teal-200">
                Healthtech IoT · Monitoramento contínuo
              </p>
            </div>

            <h1 className="mt-8 max-w-2xl font-display text-5xl leading-[1.02] text-white md:text-6xl">
              Cuidado conectado para quem importa.
            </h1>
            <p className="mt-5 max-w-2xl text-base text-white/75 md:text-lg">
              Detecção de quedas e imobilidade em tempo real, integrada ao ESP32 via MQTT, com
              histórico clínico, alertas críticos e gestão multi-tenant de dispositivos.
            </p>

            <div className="mt-10 grid gap-3 md:grid-cols-2">
              {[
                {
                  icon: Siren,
                  title: "Alertas críticos ao vivo",
                  description: "Quedas e SOS chegam ao painel via Socket.IO em milissegundos.",
                },
                {
                  icon: Wifi,
                  title: "Saúde operacional",
                  description: "Último contato, RSSI, bateria e conectividade de cada device.",
                },
                {
                  icon: HeartPulse,
                  title: "Histórico interpretável",
                  description: "Eventos, telemetria e resolução de alertas auditáveis.",
                },
                {
                  icon: ShieldAlert,
                  title: "Fluxo de resposta",
                  description: "Acknowledge, cancelamento e resolução em um clique.",
                },
              ].map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur transition hover:border-teal-400/40 hover:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500/20 text-teal-200">
                      <Icon className="h-4 w-4" />
                    </div>
                    <h2 className="font-display text-base text-white">{title}</h2>
                  </div>
                  <p className="mt-2.5 text-sm leading-6 text-white/70">{description}</p>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-10">
              <div className="flex items-center gap-3 text-xs text-white/55">
                <span className="h-px flex-1 bg-white/15" />
                <span className="uppercase tracking-[0.3em]">Multi-tenant · LGPD-ready</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>
            </div>
          </div>
        </section>

        <section className="panel flex items-center justify-center px-6 py-8 md:px-10">
          <div className="w-full max-w-xl">
            {statusMessage ? (
              <div className="mb-5 rounded-[24px] border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
                <p className="font-semibold">{statusTitle}</p>
                <p className="mt-1">{statusMessage}</p>
              </div>
            ) : null}

            <div className="rounded-full bg-surface-50 p-1">
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`rounded-full px-4 py-3 text-sm font-semibold transition ${
                    mode === "login"
                      ? "bg-surface-800 text-white"
                      : "text-surface-600 hover:bg-white"
                  }`}
                  onClick={() => setMode("login")}
                  type="button"
                >
                  Entrar
                </button>
                <button
                  className={`rounded-full px-4 py-3 text-sm font-semibold transition ${
                    mode === "register"
                      ? "bg-surface-800 text-white"
                      : "text-surface-600 hover:bg-white"
                  }`}
                  onClick={() => setMode("register")}
                  type="button"
                >
                  Criar conta
                </button>
              </div>
            </div>

            <div className="mt-8">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
                Acesso protegido
              </p>
              <h2 className="mt-3 font-display text-3xl text-surface-900">
                {mode === "login" ? "Bem-vindo de volta" : "Ative o painel"}
              </h2>
              <p className="mt-2 text-sm text-surface-600">
                {mode === "login"
                  ? "Entre com um usuario ja vinculado a uma organizacao ou use o usuario demo do seed, se voce aplicou database/seed.sql."
                  : "O cadastro cria uma nova organizacao e ja define este usuario como organization_admin do tenant inicial."}
              </p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              {mode === "register" ? (
                <>
                  <div>
                    <label className="label">Nome</label>
                    <input
                      className="field"
                      onChange={(event) =>
                        setForm((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Seu nome"
                      required
                      value={form.name}
                    />
                  </div>

                  <div>
                    <label className="label">Nome da organizacao</label>
                    <input
                      className="field"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          organizationName: event.target.value,
                        }))
                      }
                      placeholder="Familia Silva, Clinica Vida, Hospital Demo"
                      required
                      value={form.organizationName}
                    />
                  </div>

                  <div>
                    <label className="label">Tipo da organizacao</label>
                    <select
                      className="field"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          organizationType: event.target.value,
                        }))
                      }
                      value={form.organizationType}
                    >
                      <option value="family">Familia</option>
                      <option value="clinic">Clinica</option>
                      <option value="hospital">Hospital</option>
                    </select>
                  </div>
                </>
              ) : null}

              <div>
                <label className="label">E-mail</label>
                <input
                  className="field"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="admin@queda.local"
                  required
                  type="email"
                  value={form.email}
                />
              </div>

              <div>
                <label className="label">Senha</label>
                <input
                  className="field"
                  minLength={6}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="Min. 6 caracteres"
                  required
                  type="password"
                  value={form.password}
                />
              </div>

              <Button className="w-full py-3" disabled={loading} type="submit">
                {loading
                  ? "Processando..."
                  : mode === "login"
                    ? "Entrar no sistema"
                    : "Criar conta e entrar"}
              </Button>
            </form>

            <div className="mt-6 rounded-3xl bg-surface-50 p-5 text-sm text-surface-600">
              <p className="font-semibold text-surface-800">Acesso inicial</p>
              <p className="mt-2">
                Se voce aplicou <span className="font-semibold">database/seed.sql</span>, pode entrar com:
              </p>
              <p className="mt-2">
                Usuario demo: <span className="font-semibold">admin@queda.local</span>
              </p>
              <p>
                Senha demo: <span className="font-semibold">Admin@123</span>
              </p>
              <p className="mt-3">
                Se o seed ainda nao foi aplicado, use a aba <span className="font-semibold">Criar conta</span>.
                Esse fluxo cria uma nova organizacao e ja autentica o organization_admin inicial.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
