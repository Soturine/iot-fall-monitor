import { useState } from "react";

import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export type DeviceFormValues = {
  name: string;
  location: string;
  isActive: boolean;
};

const emptyValues: DeviceFormValues = {
  name: "",
  location: "",
  isActive: true,
};

export function DeviceFormModal({
  open,
  submitting,
  initialValues,
  identifierLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting?: boolean;
  initialValues?: Partial<DeviceFormValues>;
  identifierLabel?: string;
  onClose: () => void;
  onSubmit: (values: DeviceFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<DeviceFormValues>({
    ...emptyValues,
    ...initialValues,
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(values);
  }

  return (
    <Modal
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button onClick={onClose} type="button" variant="secondary">
            Fechar
          </Button>
          <Button disabled={submitting} form="device-form" type="submit">
            {submitting ? "Salvando..." : "Atualizar dispositivo"}
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      subtitle="Altere apenas os metadados locais do device. O vínculo com paciente e o claim ficam em fluxos separados."
      title="Editar dispositivo"
    >
      <form className="grid gap-4 md:grid-cols-2" id="device-form" onSubmit={handleSubmit}>
        <div className="md:col-span-2">
          <label className="label">Identificador técnico</label>
          <div className="rounded-2xl border border-surface-100 bg-surface-50 px-4 py-3 text-sm font-semibold text-surface-700">
            {identifierLabel || "Dispositivo"}
          </div>
        </div>
        <div>
          <label className="label">Nome exibido</label>
          <input
            className="field"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder="Pulseira quarto 01"
            value={values.name}
          />
        </div>
        <div>
          <label className="label">Localização</label>
          <input
            className="field"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                location: event.target.value,
              }))
            }
            placeholder="Quarto, enfermaria ou ambiente"
            value={values.location}
          />
        </div>
        <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-surface-100 bg-surface-50 px-4 py-3">
          <input
            checked={values.isActive}
            className="h-4 w-4 rounded border-surface-300"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                isActive: event.target.checked,
              }))
            }
            type="checkbox"
          />
          <span className="text-sm font-semibold text-surface-700">
            Dispositivo ativo no monitoramento
          </span>
        </label>
      </form>
    </Modal>
  );
}
