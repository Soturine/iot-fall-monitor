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

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden bg-gradient-to-br from-surface-900 via-surface-800 to-surface-700 text-white">
        <div className="absolute inset-y-0 right-0 w-72 bg-gradient-to-l from-amber-300/20 to-transparent blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.34em] text-white/60">
              Organização ativa
            </p>
            <h2 className="mt-3 font-display text-4xl">{organization.name}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
              O backend agora filtra devices, pacientes, eventos, telemetria e alertas
              pelo tenant ativo. A gestão de membros também fica restrita ao mesmo escopo.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Badge tone="info">{organization.type}</Badge>
              <Badge tone="success">{members.length} membros ativos</Badge>
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
        <Card>
          <div className="rounded-2xl bg-surface-50 p-4">
            <Building2 className="h-5 w-5 text-surface-700" />
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
              Tipo
            </p>
            <p className="mt-2 text-2xl font-semibold text-surface-900">
              {organization.type}
            </p>
          </div>
        </Card>
        <Card>
          <div className="rounded-2xl bg-surface-50 p-4">
            <UsersRound className="h-5 w-5 text-surface-700" />
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
              Membros
            </p>
            <p className="mt-2 text-2xl font-semibold text-surface-900">
              {members.length}
            </p>
          </div>
        </Card>
        <Card>
          <div className="rounded-2xl bg-surface-50 p-4">
            <ShieldCheck className="h-5 w-5 text-surface-700" />
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
              Seu papel
            </p>
            <p className="mt-2 text-2xl font-semibold text-surface-900">
              {activeRole || user?.globalRole}
            </p>
          </div>
        </Card>
      </section>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
              Equipe da organização
            </p>
            <h3 className="mt-2 font-display text-2xl text-surface-900">
              Membros com acesso ao tenant
            </h3>
          </div>
          <Badge tone="info">{members.length} registros</Badge>
        </div>

        <div className="mt-5 space-y-3">
          {members.length ? (
            members.map((member) => (
              <div
                key={member.id}
                className="rounded-[24px] border border-surface-100 bg-surface-50/70 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-surface-900">{member.user.name}</p>
                    <p className="text-sm text-surface-600">{member.user.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">{member.role}</Badge>
                    <Badge tone={member.status === "active" ? "success" : "warning"}>
                      {member.status}
                    </Badge>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              description="Nenhum membro foi vinculado à organização ativa ainda."
              title="Sem membros"
            />
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
