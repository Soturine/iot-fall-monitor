const bcrypt = require("bcrypt");

const { execute, one, transaction } = require("../db/pool");
const { HttpError } = require("../utils/httpError");
const { createAuditLog } = require("./auditService");
const { assertRole, toAuthUser } = require("./scopeService");

const MEMBER_ROLES = ["organization_admin", "caregiver", "operator", "viewer"];

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapMemberRow(row) {
  return {
    id: Number(row.id),
    role: row.role,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    user: {
      id: Number(row.user_id),
      name: row.user_name,
      email: row.user_email,
      globalRole: row.global_role,
      status: row.user_status,
    },
  };
}

async function getCurrentOrganization(accessContext) {
  if (!accessContext.activeOrganization) {
    throw new HttpError(400, "Nenhuma organização ativa foi selecionada.");
  }

  return {
    organization: accessContext.activeOrganization,
    activeRole: accessContext.activeRole,
    user: toAuthUser(accessContext),
  };
}

async function listMembers(accessContext) {
  if (!accessContext.activeOrganizationId) {
    throw new HttpError(400, "Nenhuma organização ativa foi selecionada.");
  }

  const rows = await execute(
    null,
    `
      SELECT
        om.id,
        om.organization_id,
        om.user_id,
        om.role,
        om.status,
        om.created_at,
        om.updated_at,
        u.name AS user_name,
        u.email AS user_email,
        u.global_role,
        u.status AS user_status
      FROM organization_members om
      INNER JOIN users u ON u.id = om.user_id
      WHERE om.organization_id = ?
      ORDER BY
        CASE om.role
          WHEN 'organization_admin' THEN 0
          WHEN 'operator' THEN 1
          WHEN 'caregiver' THEN 2
          ELSE 3
        END,
        u.name ASC
    `,
    [accessContext.activeOrganizationId],
  );

  return rows.map(mapMemberRow);
}

async function createMember(accessContext, data, actorId) {
  assertRole(
    accessContext,
    ["organization_admin"],
    "Somente administradores da organização podem criar membros.",
  );

  const normalizedName = String(data.name || "").trim();
  const normalizedEmail = String(data.email || "").trim().toLowerCase();
  const normalizedRole = String(data.role || "").trim().toLowerCase();

  if (!normalizedName) {
    throw new HttpError(400, "Informe o nome do membro.");
  }

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new HttpError(400, "Informe um e-mail válido.");
  }

  if (!MEMBER_ROLES.includes(normalizedRole)) {
    throw new HttpError(400, "Escolha um papel válido para o membro.");
  }

  return transaction(async (connection) => {
    let user = await one(
      connection,
      `
        SELECT id, email
        FROM users
        WHERE email = ?
      `,
      [normalizedEmail],
    );

    if (!user) {
      if (typeof data.password !== "string" || data.password.trim().length < 6) {
        throw new HttpError(
          400,
          "Informe uma senha com pelo menos 6 caracteres para o novo membro.",
        );
      }

      const passwordHash = await bcrypt.hash(data.password, 10);
      const result = await execute(
        connection,
        `
          INSERT INTO users (name, email, password_hash, global_role, status)
          VALUES (?, ?, ?, 'user', 'active')
        `,
        [normalizedName, normalizedEmail, passwordHash],
      );

      user = { id: result.insertId, email: normalizedEmail };
    }

    const existingMembership = await one(
      connection,
      `
        SELECT id
        FROM organization_members
        WHERE organization_id = ?
          AND user_id = ?
      `,
      [accessContext.activeOrganizationId, user.id],
    );

    if (existingMembership) {
      throw new HttpError(409, "Este usuário já pertence à organização.");
    }

    const result = await execute(
      connection,
      `
        INSERT INTO organization_members (
          organization_id,
          user_id,
          role,
          status
        )
        VALUES (?, ?, ?, 'active')
      `,
      [accessContext.activeOrganizationId, user.id, normalizedRole],
    );

    await createAuditLog(
      {
        organizationId: accessContext.activeOrganizationId,
        userId: actorId,
        action: "organization.member.create",
        entityType: "organization_member",
        entityId: result.insertId,
        metadata: {
          organizationId: accessContext.activeOrganizationId,
          email: normalizedEmail,
          role: normalizedRole,
        },
      },
      connection,
    );

    const row = await one(
      connection,
      `
        SELECT
          om.id,
          om.organization_id,
          om.user_id,
          om.role,
          om.status,
          om.created_at,
          om.updated_at,
          u.name AS user_name,
          u.email AS user_email,
          u.global_role,
          u.status AS user_status
        FROM organization_members om
        INNER JOIN users u ON u.id = om.user_id
        WHERE om.id = ?
      `,
      [result.insertId],
    );

    return mapMemberRow(row);
  });
}

module.exports = {
  createMember,
  getCurrentOrganization,
  listMembers,
};
