const { execute, one, transaction } = require("../db/pool");
const { HttpError } = require("../utils/httpError");
const { createAuditLog } = require("./auditService");
const { assertRole, buildScopeFilter } = require("./scopeService");

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseNullableMeasurement(value, { label, min, max }) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `${label} deve ser um numero valido.`);
  }

  if (parsed < min || parsed > max) {
    throw new HttpError(
      400,
      `${label} deve ficar entre ${min} e ${max}.`,
    );
  }

  return Number(parsed.toFixed(2));
}

function normalizeMemberIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

function mapPatientRow(row) {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    fullName: row.full_name,
    birthDate: row.birth_date || null,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    heightCm: row.height_cm == null ? null : Number(row.height_cm),
    notes: row.notes || "",
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    currentDevice: row.device_id
      ? {
          id: Number(row.device_id),
          deviceUid: row.device_uid,
          deviceIdentifier: row.device_identifier,
          name: row.device_name,
          claimStatus: row.claim_status,
        }
      : null,
    assignedCaregivers: [],
  };
}

async function syncCaregiverAssignments(connection, organizationId, patientId, memberIds) {
  const normalizedMemberIds = normalizeMemberIds(memberIds);

  if (!normalizedMemberIds.length) {
    await execute(
      connection,
      `
        DELETE FROM caregiver_assignments
        WHERE patient_id = ?
      `,
      [patientId],
    );
    return;
  }

  const placeholders = normalizedMemberIds.map(() => "?").join(", ");
  const validMembers = await execute(
    connection,
    `
      SELECT id
      FROM organization_members
      WHERE organization_id = ?
        AND status = 'active'
        AND id IN (${placeholders})
    `,
    [organizationId, ...normalizedMemberIds],
  );

  const validMemberIds = validMembers.map((row) => Number(row.id));

  if (validMemberIds.length !== normalizedMemberIds.length) {
    throw new HttpError(
      400,
      "Um ou mais cuidadores informados não pertencem à organização ativa.",
    );
  }

  await execute(
    connection,
    `
      DELETE FROM caregiver_assignments
      WHERE patient_id = ?
        AND organization_member_id NOT IN (${placeholders})
    `,
    [patientId, ...validMemberIds],
  );

  for (const memberId of validMemberIds) {
    await execute(
      connection,
      `
        INSERT INTO caregiver_assignments (organization_member_id, patient_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
      `,
      [memberId, patientId],
    );
  }
}

async function hydrateCaregivers(connection, patients) {
  if (!patients.length) {
    return patients;
  }

  const placeholders = patients.map(() => "?").join(", ");
  const caregiverRows = await execute(
    connection,
    `
      SELECT
        ca.patient_id,
        om.id AS organization_member_id,
        om.role,
        u.id AS user_id,
        u.name,
        u.email
      FROM caregiver_assignments ca
      INNER JOIN organization_members om ON om.id = ca.organization_member_id
      INNER JOIN users u ON u.id = om.user_id
      WHERE ca.patient_id IN (${placeholders})
      ORDER BY u.name ASC
    `,
    patients.map((patient) => patient.id),
  );

  const caregiversByPatientId = new Map();
  caregiverRows.forEach((row) => {
    const patientId = Number(row.patient_id);
    const current = caregiversByPatientId.get(patientId) || [];
    current.push({
      organizationMemberId: Number(row.organization_member_id),
      role: row.role,
      user: {
        id: Number(row.user_id),
        name: row.name,
        email: row.email,
      },
    });
    caregiversByPatientId.set(patientId, current);
  });

  return patients.map((patient) => ({
    ...patient,
    assignedCaregivers: caregiversByPatientId.get(patient.id) || [],
  }));
}

async function listPatients(accessContext, filters = {}) {
  if (!accessContext.activeOrganizationId && !accessContext.isPlatformAdmin) {
    throw new HttpError(400, "Nenhuma organização ativa foi selecionada.");
  }

  const { clauses, params } = buildScopeFilter(accessContext, {
    organizationColumn: "p.organization_id",
    patientColumn: "p.id",
  });

  if (String(filters.includeArchived || "").toLowerCase() !== "true") {
    clauses.push("p.status = 'active'");
  }

  const rows = await execute(
    null,
    `
      SELECT
        p.id,
        p.organization_id,
        p.full_name,
        p.birth_date,
        p.weight_kg,
        p.height_cm,
        p.notes,
        p.status,
        p.created_at,
        p.updated_at,
        d.id AS device_id,
        d.device_uid,
        d.device_identifier,
        d.name AS device_name,
        d.claim_status
      FROM patients p
      LEFT JOIN devices d
        ON d.current_patient_id = p.id
       AND d.claim_status = 'claimed'
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY p.full_name ASC
    `,
    params,
  );

  return hydrateCaregivers(null, rows.map(mapPatientRow));
}

async function getPatientById(patientId, accessContext, executor = null) {
  const { clauses, params } = buildScopeFilter(accessContext, {
    organizationColumn: "p.organization_id",
    patientColumn: "p.id",
  });

  clauses.push("p.id = ?");
  params.push(patientId);

  const row = await one(
    executor,
    `
      SELECT
        p.id,
        p.organization_id,
        p.full_name,
        p.birth_date,
        p.weight_kg,
        p.height_cm,
        p.notes,
        p.status,
        p.created_at,
        p.updated_at,
        d.id AS device_id,
        d.device_uid,
        d.device_identifier,
        d.name AS device_name,
        d.claim_status
      FROM patients p
      LEFT JOIN devices d
        ON d.current_patient_id = p.id
       AND d.claim_status = 'claimed'
      WHERE ${clauses.join(" AND ")}
      LIMIT 1
    `,
    params,
  );

  if (!row) {
    throw new HttpError(404, "Paciente não encontrado.");
  }

  const [patient] = await hydrateCaregivers(executor, [mapPatientRow(row)]);
  return patient;
}

async function createPatient(data, accessContext, actorId) {
  assertRole(
    accessContext,
    ["organization_admin"],
    "Somente administradores da organização podem criar pacientes.",
  );

  const fullName = String(data.fullName || "").trim();
  const weightKg = parseNullableMeasurement(data.weightKg, {
    label: "Peso",
    min: 15,
    max: 350,
  });
  const heightCm = parseNullableMeasurement(data.heightCm, {
    label: "Altura",
    min: 40,
    max: 260,
  });
  if (!fullName) {
    throw new HttpError(400, "Informe o nome completo do paciente.");
  }

  return transaction(async (connection) => {
    const result = await execute(
      connection,
      `
        INSERT INTO patients (
          organization_id,
          full_name,
          birth_date,
          weight_kg,
          height_cm,
          notes,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        accessContext.activeOrganizationId,
        fullName,
        data.birthDate || null,
        weightKg === undefined ? null : weightKg,
        heightCm === undefined ? null : heightCm,
        data.notes ? String(data.notes).trim() : null,
        data.status || "active",
      ],
    );

    await syncCaregiverAssignments(
      connection,
      accessContext.activeOrganizationId,
      result.insertId,
      data.caregiverMemberIds,
    );

    await createAuditLog(
      {
        organizationId: accessContext.activeOrganizationId,
        userId: actorId,
        action: "patient.create",
        entityType: "patient",
        entityId: result.insertId,
        metadata: {
          organizationId: accessContext.activeOrganizationId,
          fullName,
        },
      },
      connection,
    );

    return getPatientById(result.insertId, accessContext, connection);
  });
}

async function updatePatient(patientId, data, accessContext, actorId) {
  assertRole(
    accessContext,
    ["organization_admin"],
    "Somente administradores da organização podem editar pacientes.",
  );

  return transaction(async (connection) => {
    const current = await getPatientById(patientId, accessContext, connection);
    const weightKg = parseNullableMeasurement(data.weightKg, {
      label: "Peso",
      min: 15,
      max: 350,
    });
    const heightCm = parseNullableMeasurement(data.heightCm, {
      label: "Altura",
      min: 40,
      max: 260,
    });

    await execute(
      connection,
      `
        UPDATE patients
        SET
          full_name = ?,
          birth_date = ?,
          weight_kg = ?,
          height_cm = ?,
          notes = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        data.fullName ? String(data.fullName).trim() : current.fullName,
        data.birthDate !== undefined ? data.birthDate || null : current.birthDate,
        weightKg !== undefined ? weightKg : current.weightKg,
        heightCm !== undefined ? heightCm : current.heightCm,
        data.notes !== undefined ? String(data.notes || "").trim() : current.notes,
        data.status || current.status,
        patientId,
      ],
    );

    if (data.caregiverMemberIds !== undefined) {
      await syncCaregiverAssignments(
        connection,
        accessContext.activeOrganizationId,
        patientId,
        data.caregiverMemberIds,
      );
    }

    const updated = await getPatientById(patientId, accessContext, connection);

    await createAuditLog(
      {
        organizationId: accessContext.activeOrganizationId,
        userId: actorId,
        action: "patient.update",
        entityType: "patient",
        entityId: patientId,
        metadata: {
          before: current,
          after: updated,
        },
      },
      connection,
    );

    return updated;
  });
}

async function archivePatient(patientId, accessContext, actorId) {
  assertRole(
    accessContext,
    ["organization_admin"],
    "Somente administradores da organizacao podem arquivar pacientes.",
  );

  return transaction(async (connection) => {
    const current = await getPatientById(patientId, accessContext, connection);

    if (current.currentDevice) {
      throw new HttpError(
        409,
        "Desvincule o dispositivo atual antes de arquivar o paciente.",
      );
    }

    await execute(
      connection,
      `
        UPDATE patients
        SET status = 'archived', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [patientId],
    );

    const archived = await getPatientById(patientId, accessContext, connection);

    await createAuditLog(
      {
        organizationId: accessContext.activeOrganizationId,
        userId: actorId,
        action: "patient.archive",
        entityType: "patient",
        entityId: patientId,
        metadata: {
          beforeStatus: current.status,
          afterStatus: archived.status,
          historyPreserved: true,
        },
      },
      connection,
    );

    return archived;
  });
}

module.exports = {
  archivePatient,
  createPatient,
  getPatientById,
  listPatients,
  updatePatient,
};
