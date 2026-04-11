import { useEffect, useState } from "react";
import { Edit3, Plus } from "lucide-react";
import toast from "react-hot-toast";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingState } from "../components/ui/LoadingState";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../contexts/AuthContext";
import { formatDateTime } from "../lib/format";
import { api, getErrorMessage } from "../services/api";
import type { OrganizationMember, PatientRecord } from "../types/api";

type PatientFormState = {
  fullName: string;
  birthDate: string;
  weightKg: string;
  heightCm: string;
  notes: string;
  status: "active" | "archived";
  caregiverMemberIds: number[];
};

const emptyForm: PatientFormState = {
  fullName: "",
  birthDate: "",
  weightKg: "",
  heightCm: "",
  notes: "",
  status: "active",
  caregiverMemberIds: [],
};

export function PatientsPage() {
  const { activeOrganization, activeRole, user } = useAuth();
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PatientFormState>(emptyForm);

  const canManagePatients =
    activeRole === "organization_admin" || user?.globalRole === "platform_admin";

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);

      try {
        const [patientsResponse, membersResponse] = await Promise.all([
          api.get<{ items: PatientRecord[] }>("/patients"),
          api.get<{ items: OrganizationMember[] }>("/organization/members"),
        ]);

        if (!active) {
          return;
        }

        setPatients(patientsResponse.data.items);
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

  function openCreateModal() {
    setEditingPatient(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEditModal(patient: PatientRecord) {
    setEditingPatient(patient);
    setForm({
      fullName: patient.fullName,
      birthDate: patient.birthDate || "",
      weightKg: patient.weightKg != null ? String(patient.weightKg) : "",
      heightCm: patient.heightCm != null ? String(patient.heightCm) : "",
      notes: patient.notes || "",
      status: patient.status as PatientFormState["status"],
      caregiverMemberIds: patient.assignedCaregivers.map(
        (assignment) => assignment.organizationMemberId,
      ),
    });
    setModalOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        ...form,
        weightKg: form.weightKg.trim() ? Number(form.weightKg) : null,
        heightCm: form.heightCm.trim() ? Number(form.heightCm) : null,
      };

      if (editingPatient) {
        const response = await api.put<{ patient: PatientRecord }>(
          `/patients/${editingPatient.id}`,
          payload,
        );
        setPatients((current) =>
          current.map((patient) =>
            patient.id === editingPatient.id ? response.data.patient : patient,
          ),
        );
        toast.success("Paciente atualizado.");
      } else {
        const response = await api.post<{ patient: PatientRecord }>("/patients", payload);
        setPatients((current) => [...current, response.data.patient]);
        toast.success("Paciente criado.");
      }

      setModalOpen(false);
      setEditingPatient(null);
      setForm(emptyForm);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !patients.length) {
    return <LoadingState label="Carregando pacientes da organização..." />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
              Pacientes e idosos
            </p>
            <h2 className="mt-2 font-display text-3xl text-surface-900">
              Escopo assistencial da organização
            </h2>
            <p className="mt-2 text-sm text-surface-600">
              Cada paciente pertence ao tenant ativo, pode ter cuidadores atribuídos
              e mantém rastreabilidade do vínculo com o dispositivo.
            </p>
          </div>
          {canManagePatients ? (
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Novo paciente
            </Button>
          ) : null}
        </div>
      </Card>

      {patients.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {patients.map((patient) => (
            <Card key={patient.id} className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={patient.status === "active" ? "success" : "warning"}>
                      {patient.status}
                    </Badge>
                    {patient.currentDevice ? (
                      <Badge tone="info">1 device ativo</Badge>
                    ) : (
                      <Badge tone="neutral">Sem device atual</Badge>
                    )}
                  </div>
                  <h3 className="mt-3 font-display text-2xl text-surface-900">
                    {patient.fullName}
                  </h3>
                  <p className="mt-1 text-sm text-surface-600">
                    Nascimento:{" "}
                    {patient.birthDate ? formatDateTime(patient.birthDate) : "não informado"}
                  </p>
                  <p className="mt-1 text-sm text-surface-600">
                    Peso/altura: {patient.weightKg != null ? `${patient.weightKg} kg` : "--"} â€¢{" "}
                    {patient.heightCm != null ? `${patient.heightCm} cm` : "--"}
                  </p>
                  <p className="mt-2 text-sm text-surface-600">
                    {patient.notes || "Sem observações adicionais."}
                  </p>
                </div>

                {canManagePatients ? (
                  <Button onClick={() => openEditModal(patient)} variant="secondary">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] bg-surface-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
                    Device atual
                  </p>
                  <p className="mt-2 text-sm font-semibold text-surface-900">
                    {patient.currentDevice
                      ? `${patient.currentDevice.name} • ${patient.currentDevice.deviceIdentifier}`
                      : "Nenhum device atribuído"}
                  </p>
                </div>
                <div className="rounded-[24px] bg-surface-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
                    Cuidadores vinculados
                  </p>
                  <p className="mt-2 text-sm font-semibold text-surface-900">
                    {patient.assignedCaregivers.length
                      ? patient.assignedCaregivers.map((assignment) => assignment.user.name).join(", ")
                      : "Sem assignment explícito"}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          action={
            canManagePatients ? (
              <Button onClick={openCreateModal}>
                <Plus className="h-4 w-4" />
                Cadastrar primeiro paciente
              </Button>
            ) : undefined
          }
          description="Os devices e alertas passam a herdar o escopo organizacional e o paciente ativo no momento da ingestão."
          title="Nenhum paciente cadastrado"
        />
      )}

      <Modal
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setModalOpen(false)} type="button" variant="secondary">
              Fechar
            </Button>
            <Button disabled={submitting} form="patient-form" type="submit">
              {submitting ? "Salvando..." : editingPatient ? "Atualizar" : "Criar paciente"}
            </Button>
          </div>
        }
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        subtitle="Defina o paciente, seu status e quais membros devem enxergar esse escopo quando houver caregiver assignments."
        title={editingPatient ? "Editar paciente" : "Novo paciente"}
      >
        <form className="grid gap-4 md:grid-cols-2" id="patient-form" onSubmit={handleSubmit}>
          <div>
            <label className="label">Nome completo</label>
            <input
              className="field"
              onChange={(event) =>
                setForm((current) => ({ ...current, fullName: event.target.value }))
              }
              placeholder="Nome do paciente"
              required
              value={form.fullName}
            />
          </div>
          <div>
            <label className="label">Data de nascimento</label>
            <input
              className="field"
              onChange={(event) =>
                setForm((current) => ({ ...current, birthDate: event.target.value }))
              }
              type="date"
              value={form.birthDate}
            />
          </div>
          <div>
            <label className="label">Peso (kg)</label>
            <input
              className="field"
              inputMode="decimal"
              min="15"
              onChange={(event) =>
                setForm((current) => ({ ...current, weightKg: event.target.value }))
              }
              placeholder="Ex.: 72.5"
              step="0.1"
              type="number"
              value={form.weightKg}
            />
          </div>
          <div>
            <label className="label">Altura (cm)</label>
            <input
              className="field"
              inputMode="decimal"
              min="40"
              onChange={(event) =>
                setForm((current) => ({ ...current, heightCm: event.target.value }))
              }
              placeholder="Ex.: 168"
              step="0.1"
              type="number"
              value={form.heightCm}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Observações</label>
            <textarea
              className="field min-h-28"
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Notas clínicas ou contexto familiar"
              value={form.notes}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Status</label>
            <select
              className="field"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as PatientFormState["status"],
                }))
              }
              value={form.status}
            >
              <option value="active">Ativo</option>
              <option value="archived">Arquivado</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Cuidadores / operadores com assignment explícito</label>
            <div className="grid gap-2">
              {members.length ? (
                members.map((member) => {
                  const checked = form.caregiverMemberIds.includes(member.id);
                  return (
                    <label
                      key={member.id}
                      className="flex items-center gap-3 rounded-2xl border border-surface-100 bg-surface-50 px-4 py-3"
                    >
                      <input
                        checked={checked}
                        className="h-4 w-4"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            caregiverMemberIds: event.target.checked
                              ? [...current.caregiverMemberIds, member.id]
                              : current.caregiverMemberIds.filter((value) => value !== member.id),
                          }))
                        }
                        type="checkbox"
                      />
                      <span className="text-sm text-surface-700">
                        {member.user.name} • {member.role}
                      </span>
                    </label>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-surface-200 px-4 py-4 text-sm text-surface-500">
                  Nenhum membro disponível para assignment nesta organização.
                </div>
              )}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
