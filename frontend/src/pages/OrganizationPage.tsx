import { useEffect, useState } from "react";
import { Building2, Plus, ShieldCheck, UsersRound } from "lucide-react";
import toast from "react-hot-toast";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingState } from "../components/ui/LoadingState";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../contexts/AuthContext";
import { api, getErrorMessage } from "../services/api";
import type { Organization, OrganizationMember } from "../types/api";

type MemberFormState = {
  name: string;
  email: string;
  password: string;
  role: "caregiver" | "operator" | "viewer" | "organization_admin";
};

const emptyForm: MemberFormState = {
  name: "",
  email: "",
  password: "",
  role: "caregiver",
};

export function OrganizationPage() {
  const { activeOrganization, activeRole, user } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<MemberFormState>(emptyForm);

  const canManageMembers =
    activeRole === "organization_admin" || user?.globalRole === "platform_admin";

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);

      try {
        const [organizationResponse, membersResponse] = await Promise.all([
          api.get<{
            organization: Organization | null;
          }>("/organization"),
          api.get<{ items: OrganizationMember[] }>("/organization/members"),
        ]);

        if (!active) {
          return;
        }

        setOrganization(organizationResponse.data.organization);
        setMembers(membersResponse.data.items);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [activeOrganization?.id]);

  async function handleCreateMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await api.post<{ member: OrganizationMember }>(
        "/organization/members",
        form,
      );

      setMembers((current) => [...current, response.data.member]);
      setModalOpen(false);
      setForm(emptyForm);
      toast.success("Membro adicionado à organização.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !organization) {
    return <LoadingState label="Carregando organização ativa..." />;
  }

  if (!organization) {
    return (
      <EmptyState
        description="Selecione uma organização válida para carregar membros e escopo operacional."
        title="Organização indisponível"
      />
    );
  }

  const roleTone = (role: string) =>
    role === "organization_admin"
      ? "info"
      : role === "caregiver"
        ? "success"
        : role === "operator"
          ? "warning"
          : "muted";

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-petrol-900/40 bg-gradient-to-br from-petrol-950 via-petrol-900 to-petrol-800 text-white">
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-2/5 bg-cover bg-center opacity-[0.18] md:block"
          style={{
            backgroundImage: "url(/images/idosa-enfermeira-ipd.png)",
            maskImage:
              "linear-gradient(to left, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%)",
            WebkitMaskImage:
              "linear-gradient(to left, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%)",
          }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-soft">
                <Building2 className="h-4 w-4" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-white/65">
                Organização ativa
              </p>
            </div>
            <h2 className="mt-4 font-display text-4xl tracking-tight">
              {organization.name}
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/75">
              Devices, pacientes, eventos, telemetria, alertas e gestão de membros
              ficam restritos ao escopo deste tenant — controle de acesso unificado.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge tone="info">{organization.type}</Badge>
              <Badge tone="success" dot>{members.length} membros</Badge>
            </div>
          </div>

          {canManageMembers ? (
            <Button
              className="border border-white/15 bg-white/10 text-white hover:border-white/30 hover:bg-white/20"
              onClick={() => setModalOpen(true)}
              variant="secondary"
            >
              <Plus className="h-4 w-4" />
              Convidar membro
            </Button>
          ) : null}
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Building2, label: "Tipo", value: organization.type, tone: "teal" },
          { icon: UsersRound, label: "Membros", value: String(members.length), tone: "petrol" },
          {
            icon: ShieldCheck,
            label: "Seu papel",
            value: activeRole || user?.globalRole || "—",
            tone: "amber",
          },
        ].map(({ icon: Icon, label, value, tone }) => (
          <div
            key={label}
            className="panel relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-panel"
          >
            <span
              className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl ${
                tone === "teal"
                  ? "bg-teal-400/15"
                  : tone === "petrol"
                    ? "bg-petrol-500/15"
                    : "bg-amber-400/15"
              }`}
            />
            <div
              className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${
                tone === "teal"
                  ? "bg-teal-50 text-teal-700"
                  : tone === "petrol"
                    ? "bg-petrol-50 text-petrol-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.24em] text-surface-500">
              {label}
            </p>
            <p className="mt-2 font-display text-2xl font-semibold text-surface-900">
              {value}
            </p>
          </div>
        ))}
      </section>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-petrol-700">
              Equipe da organização
            </p>
            <h3 className="mt-2 font-display text-xl text-surface-900">
              Membros com acesso ao tenant
            </h3>
          </div>
          <Badge tone="muted">{members.length} registros</Badge>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {members.length ? (
            members.map((member) => {
              const initials = (member.user.name || "?")
                .split(" ")
                .map((p) => p[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase();
              return (
                <div
                  key={member.id}
                  className="group rounded-2xl border border-surface-100 bg-gradient-to-br from-white to-surface-50/60 p-4 transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-soft"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-petrol-700 font-display text-sm font-bold text-white shadow-soft">
                      {initials || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-surface-900">
                        {member.user.name}
                      </p>
                      <p className="truncate text-sm text-surface-600">
                        {member.user.email}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge tone={roleTone(member.role) as never}>
                          {member.role}
                        </Badge>
                        <Badge
                          tone={member.status === "active" ? "success" : "warning"}
                          dot
                        >
                          {member.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="md:col-span-2">
              <EmptyState
                description="Nenhum membro foi vinculado à organização ativa ainda."
                title="Sem membros"
              />
            </div>
          )}
        </div>
      </Card>

      <Modal
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setModalOpen(false)} type="button" variant="secondary">
              Fechar
            </Button>
            <Button disabled={submitting} form="member-form" type="submit">
              {submitting ? "Salvando..." : "Criar membro"}
            </Button>
          </div>
        }
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        subtitle="Cria um usuário e já vincula esse acesso à organização ativa."
        title="Novo membro"
      >
        <form className="grid gap-4 md:grid-cols-2" id="member-form" onSubmit={handleCreateMember}>
          <div>
            <label className="label">Nome</label>
            <input
              className="field"
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Nome completo"
              required
              value={form.name}
            />
          </div>
          <div>
            <label className="label">Papel</label>
            <select
              className="field"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  role: event.target.value as MemberFormState["role"],
                }))
              }
              value={form.role}
            >
              <option value="caregiver">Caregiver</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
              <option value="organization_admin">Organization admin</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">E-mail</label>
            <input
              className="field"
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="usuario@dominio.com"
              required
              type="email"
              value={form.email}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Senha inicial</label>
            <input
              className="field"
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="Senha com pelo menos 6 caracteres"
              required
              type="password"
              value={form.password}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
