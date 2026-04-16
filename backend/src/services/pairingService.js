const crypto = require("crypto");

const { execute, one, transaction } = require("../db/pool");
const { HttpError } = require("../utils/httpError");
const { createAuditLog } = require("./auditService");
const {
  assignDeviceToPatient,
  claimDeviceToOrganization,
  getDeviceStatusSnapshot,
  getOrCreateDeviceByIdentity,
  setDevicePatientAssignment,
} = require("./deviceService");
const { assertRole } = require("./scopeService");

function hashPairingCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function hashDeviceSyncToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generatePairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let code = "";

  for (let index = 0; index < bytes.length; index += 1) {
    code += alphabet[bytes[index] % alphabet.length];
  }

  return code;
}

function generateDeviceSyncToken() {
  return crypto.randomBytes(24).toString("hex");
}

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isSchemaMismatchError(error) {
  return [
    "ER_BAD_FIELD_ERROR",
    "ER_NO_SUCH_TABLE",
    "ER_UNKNOWN_TABLE",
    "ER_DUP_FIELDNAME",
  ].includes(error?.code);
}

function isDataIntegrityError(error) {
  return [
    "ER_NO_REFERENCED_ROW_2",
    "ER_ROW_IS_REFERENCED_2",
    "ER_DUP_ENTRY",
  ].includes(error?.code);
}

function wrapClaimFlowError(error, stage) {
  if (error instanceof HttpError) {
    return error;
  }

  if (isSchemaMismatchError(error)) {
    return new HttpError(
      500,
      "O schema do banco usado pelo pairing esta desatualizado. Atualize o banco/backend antes de tentar novamente.",
      {
        code: "PAIRING_SCHEMA_MISMATCH",
        stage,
        sqlCode: error.code || null,
      },
    );
  }

  if (isDataIntegrityError(error)) {
    return new HttpError(
      409,
      "O claim nao conseguiu concluir por uma inconsistencia de dados no backend.",
      {
        code: "PAIRING_DATA_INTEGRITY_ERROR",
        stage,
        sqlCode: error.code || null,
      },
    );
  }

  return new HttpError(
    500,
    "Falha interna ao concluir o pareamento do dispositivo.",
    {
      code: "PAIRING_INTERNAL_ERROR",
      stage,
    },
  );
}

async function createPairingSession(accessContext, data, actorId) {
  assertRole(
    accessContext,
    ["organization_admin"],
    "Somente administradores da organização podem gerar códigos de pareamento.",
  );

  if (!accessContext.activeOrganizationId) {
    throw new HttpError(400, "Nenhuma organização ativa foi selecionada.");
  }

  const expiresInMinutes = Math.min(
    Math.max(Number(data.expiresInMinutes || 10), 1),
    30,
  );
  const patientId = data.patientId ? Number(data.patientId) : null;

  return transaction(async (connection) => {
    if (patientId) {
      const patient = await one(
        connection,
        `
          SELECT id
          FROM patients
          WHERE id = ?
            AND organization_id = ?
            AND status = 'active'
        `,
        [patientId, accessContext.activeOrganizationId],
      );

      if (!patient) {
        throw new HttpError(404, "Paciente não encontrado para o pareamento.");
      }
    }

    const pairingCode = generatePairingCode();
    const pairingCodeHash = hashPairingCode(pairingCode);

    const result = await execute(
      connection,
      `
        INSERT INTO device_pairing_sessions (
          organization_id,
          patient_id,
          pairing_code_hash,
          expires_at,
          created_by_user_id,
          metadata_json
        )
        VALUES (
          ?,
          ?,
          ?,
          UTC_TIMESTAMP() + INTERVAL ? MINUTE,
          ?,
          JSON_OBJECT('expires_in_minutes', ?)
        )
      `,
      [
        accessContext.activeOrganizationId,
        patientId,
        pairingCodeHash,
        expiresInMinutes,
        actorId,
        expiresInMinutes,
      ],
    );

    const sessionRow = await one(
      connection,
      `
        SELECT
          dps.id,
          dps.organization_id,
          dps.patient_id,
          dps.expires_at,
          dps.created_at,
          o.name AS organization_name,
          p.full_name AS patient_name
        FROM device_pairing_sessions dps
        INNER JOIN organizations o ON o.id = dps.organization_id
        LEFT JOIN patients p ON p.id = dps.patient_id
        WHERE dps.id = ?
      `,
      [result.insertId],
    );

    await createAuditLog(
      {
        organizationId: accessContext.activeOrganizationId,
        userId: actorId,
        action: "device.pairing_session.create",
        entityType: "device_pairing_session",
        entityId: result.insertId,
        metadata: {
          organizationId: accessContext.activeOrganizationId,
          patientId,
          expiresInMinutes,
        },
      },
      connection,
    );

    return {
      id: Number(sessionRow.id),
      pairingCode,
      organizationId: Number(sessionRow.organization_id),
      organizationName: sessionRow.organization_name,
      patientId: sessionRow.patient_id ? Number(sessionRow.patient_id) : null,
      patientName: sessionRow.patient_name || null,
      expiresAt: toIso(sessionRow.expires_at),
      createdAt: toIso(sessionRow.created_at),
    };
  });
}

async function buildPatientProfileSummaryByDevice(deviceId, executor = null) {
  const row = await one(
    executor,
    `
      SELECT
        d.id AS device_id,
        d.device_uid,
        d.device_identifier,
        d.current_patient_id,
        p.full_name AS patient_name,
        p.weight_kg,
        p.height_cm
      FROM devices d
      LEFT JOIN patients p ON p.id = d.current_patient_id
      WHERE d.id = ?
      LIMIT 1
    `,
    [deviceId],
  );

  if (!row) {
    throw new HttpError(404, "Dispositivo nao encontrado para sincronizar perfil.");
  }

  return {
    patientName: row.patient_name || null,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    heightCm: row.height_cm == null ? null : Number(row.height_cm),
    fallSensitivityPreset: null,
    syncedAt: new Date().toISOString(),
  };
}

async function claimDeviceWithPairingCode({
  deviceUid,
  deviceIdentifier,
  deviceName,
  location,
  pairingCode,
}) {
  const normalizedPairingCode = String(pairingCode || "").trim().toUpperCase();
  if (!normalizedPairingCode) {
    throw new HttpError(400, "Informe um pairing_code valido.", {
      code: "PAIRING_CODE_REQUIRED",
    });
  }
  const pairingCodeHash = hashPairingCode(normalizedPairingCode);

  return transaction(async (connection) => {
    let stage = "load_pairing_session";

    try {
      const session = await one(
        connection,
        `
          SELECT
            dps.id,
            dps.organization_id,
            dps.patient_id,
            dps.used_at,
            dps.expires_at,
            dps.created_by_user_id,
            o.name AS organization_name
          FROM device_pairing_sessions dps
          INNER JOIN organizations o ON o.id = dps.organization_id
          WHERE dps.pairing_code_hash = ?
          FOR UPDATE
        `,
        [pairingCodeHash],
      );
      if (!session) {
        throw new HttpError(400, "Codigo invalido. Confira o valor informado.", {
          code: "PAIRING_CODE_INVALID",
        });
      }

      if (session.used_at) {
        throw new HttpError(409, "Codigo ja utilizado. Gere outro codigo.", {
          code: "PAIRING_CODE_USED",
        });
      }

      if (new Date(session.expires_at).getTime() < Date.now()) {
        throw new HttpError(409, "Codigo expirado. Gere um novo no dashboard.", {
          code: "PAIRING_CODE_EXPIRED",
        });
      }

      stage = "get_or_create_device";
      const device = await getOrCreateDeviceByIdentity(
        {
          deviceUid,
          deviceIdentifier,
          name: deviceName,
        },
        connection,
      );

      stage = "claim_device_to_organization";
      const claimedDevice = await claimDeviceToOrganization(
        {
          deviceId: device.id,
          organizationId: Number(session.organization_id),
          claimedByUserId: Number(session.created_by_user_id),
          deviceIdentifier,
          name: deviceName,
          location,
        },
        connection,
      );

      let finalDevice = claimedDevice;

      if (session.patient_id) {
        stage = "assign_initial_patient";
        finalDevice = await setDevicePatientAssignment(
          {
            deviceId: claimedDevice.id,
            organizationId: Number(session.organization_id),
            patientId: Number(session.patient_id),
            reason: "pairing_claim",
            notes: "Vínculo inicial criado automaticamente a partir do pareamento.",
            actorId: Number(session.created_by_user_id),
          },
          connection,
        );
      }

      stage = "build_patient_profile_summary";
      const patientProfile = await buildPatientProfileSummaryByDevice(
        finalDevice.id,
        connection,
      );

      stage = "mark_pairing_session_used";
      await execute(
        connection,
        `
          UPDATE device_pairing_sessions
          SET
            used_at = UTC_TIMESTAMP(),
            used_by_device_id = ?,
            metadata_json = JSON_SET(
              COALESCE(metadata_json, JSON_OBJECT()),
              '$.device_uid',
              ?,
              '$.device_identifier',
              ?
            )
          WHERE id = ?
        `,
        [
          finalDevice.id,
          finalDevice.deviceUid,
          finalDevice.deviceIdentifier,
          session.id,
        ],
      );

      stage = "persist_device_sync_token";
      const deviceSyncToken = generateDeviceSyncToken();
      await execute(
        connection,
        `
          UPDATE devices
          SET
            device_sync_token_hash = ?,
            device_sync_token_issued_at = UTC_TIMESTAMP(),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [hashDeviceSyncToken(deviceSyncToken), finalDevice.id],
      );

      stage = "create_claim_audit_log";
      await createAuditLog(
        {
          organizationId: Number(session.organization_id),
          userId: Number(session.created_by_user_id),
          action: "device.claim",
          entityType: "device",
          entityId: finalDevice.id,
          metadata: {
            organizationId: Number(session.organization_id),
            patientId: session.patient_id ? Number(session.patient_id) : null,
            deviceUid: finalDevice.deviceUid,
            deviceIdentifier: finalDevice.deviceIdentifier,
          },
        },
        connection,
      );

      stage = "load_final_device_snapshot";
      return {
        device: await getDeviceStatusSnapshot(finalDevice.id, connection),
        organization: {
          id: Number(session.organization_id),
          name: session.organization_name,
        },
        patientId: session.patient_id ? Number(session.patient_id) : null,
        deviceSyncToken,
        patientProfile,
      };
    } catch (error) {
      throw wrapClaimFlowError(error, stage);
    }
  });
}

async function syncDevicePatientProfile({
  deviceUid,
  deviceIdentifier,
  deviceSyncToken,
}) {
  const normalizedDeviceUid = String(deviceUid || "").trim();
  const normalizedIdentifier = String(deviceIdentifier || "").trim();
  const normalizedToken = String(deviceSyncToken || "").trim();

  if (!normalizedDeviceUid && !normalizedIdentifier) {
    throw new HttpError(400, "Informe device_uid ou device_id para sincronizar o perfil.");
  }

  if (!normalizedToken) {
    throw new HttpError(400, "Informe o device_sync_token gerado no claim.");
  }

  return transaction(async (connection) => {
    const row = await one(
      connection,
      `
        SELECT
          d.id,
          d.device_uid,
          d.device_identifier,
          d.organization_id,
          d.current_patient_id,
          d.claim_status
        FROM devices d
        WHERE d.device_sync_token_hash = ?
          AND (
            d.device_uid = ?
            OR d.device_identifier = ?
          )
        LIMIT 1
        FOR UPDATE
      `,
      [
        hashDeviceSyncToken(normalizedToken),
        normalizedDeviceUid || normalizedIdentifier,
        normalizedIdentifier || normalizedDeviceUid,
      ],
    );

    if (!row) {
      throw new HttpError(401, "Token de sync do dispositivo invalido ou expirado.");
    }

    if (row.claim_status !== "claimed" || !row.organization_id) {
      throw new HttpError(409, "O dispositivo precisa estar claimed para sincronizar perfil.");
    }

    const patientProfile = await buildPatientProfileSummaryByDevice(row.id, connection);

    return {
      device: {
        id: Number(row.id),
        deviceUid: row.device_uid,
        deviceIdentifier: row.device_identifier,
      },
      patientProfile,
    };
  });
}

module.exports = {
  claimDeviceWithPairingCode,
  createPairingSession,
  syncDevicePatientProfile,
};
