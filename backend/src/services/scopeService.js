const { execute, one } = require("../db/pool");
const { HttpError } = require("../utils/httpError");

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeOrganizationId(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function mapOrganization(row) {
  if (!row?.organization_id) {
    return null;
  }

  return {
    id: Number(row.organization_id),
    name: row.organization_name,
    type: row.organization_type,
    status: row.organization_status,
    createdAt: toIso(row.organization_created_at),
    updatedAt: toIso(row.organization_updated_at),
  };
}

function mapMembership(row) {
  if (!row?.membership_id || !row?.organization_id) {
    return null;
  }

  return {
    id: Number(row.membership_id),
    role: row.membership_role,
    status: row.membership_status,
    createdAt: toIso(row.membership_created_at),
    updatedAt: toIso(row.membership_updated_at),
    organization: mapOrganization(row),
  };
}

function mapUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    globalRole: row.global_role,
    status: row.user_status,
    createdAt: toIso(row.user_created_at),
    updatedAt: toIso(row.user_updated_at),
  };
}

async function loadOrganizationById(organizationId, executor = null) {
  const row = await one(
    executor,
    `
      SELECT
        o.id AS organization_id,
        o.name AS organization_name,
        o.type AS organization_type,
        o.status AS organization_status,
        o.created_at AS organization_created_at,
        o.updated_at AS organization_updated_at
      FROM organizations o
      WHERE o.id = ?
    `,
    [organizationId],
  );

  if (!row) {
    throw new HttpError(404, "Organização não encontrada.");
  }

  return mapOrganization(row);
}

async function loadAssignedPatientIds(activeMembershipId, organizationId, executor = null) {
  const rows = await execute(
    executor,
    `
      SELECT DISTINCT ca.patient_id
      FROM caregiver_assignments ca
      INNER JOIN patients p ON p.id = ca.patient_id
      WHERE ca.organization_member_id = ?
        AND p.organization_id = ?
        AND p.status = 'active'
    `,
    [activeMembershipId, organizationId],
  );

  return rows.map((row) => Number(row.patient_id));
}

async function loadAccessContext({ userId, requestedOrganizationId }, executor = null) {
  const rows = await execute(
    executor,
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.global_role,
        u.status AS user_status,
        u.created_at AS user_created_at,
        u.updated_at AS user_updated_at,
        om.id AS membership_id,
        om.role AS membership_role,
        om.status AS membership_status,
        om.created_at AS membership_created_at,
        om.updated_at AS membership_updated_at,
        o.id AS organization_id,
        o.name AS organization_name,
        o.type AS organization_type,
        o.status AS organization_status,
        o.created_at AS organization_created_at,
        o.updated_at AS organization_updated_at
      FROM users u
      LEFT JOIN organization_members om
        ON om.user_id = u.id
       AND om.status = 'active'
      LEFT JOIN organizations o
        ON o.id = om.organization_id
      WHERE u.id = ?
      ORDER BY om.created_at ASC, om.id ASC
    `,
    [userId],
  );

  if (!rows.length) {
    throw new HttpError(401, "Usuário não encontrado.");
  }

  const user = mapUser(rows[0]);

  if (user.status !== "active") {
    throw new HttpError(403, "A conta deste usuário está desativada.");
  }

  const memberships = rows
    .map(mapMembership)
    .filter(Boolean);

  const isPlatformAdmin = user.globalRole === "platform_admin";
  const preferredOrganizationId = normalizeOrganizationId(requestedOrganizationId);

  let activeMembership = null;
  let activeOrganization = null;

  if (preferredOrganizationId) {
    activeMembership =
      memberships.find((membership) => membership.organization.id === preferredOrganizationId) ||
      null;

    if (!activeMembership && !isPlatformAdmin) {
      throw new HttpError(403, "Você não possui acesso à organização selecionada.");
    }

    activeOrganization = activeMembership
      ? activeMembership.organization
      : await loadOrganizationById(preferredOrganizationId, executor);
  } else if (memberships.length > 0) {
    activeMembership = memberships[0];
    activeOrganization = activeMembership.organization;
  } else if (!isPlatformAdmin) {
    throw new HttpError(
      403,
      "Este usuário não possui vínculo ativo com nenhuma organização.",
    );
  }

  const activeRole = isPlatformAdmin && !activeMembership
    ? "platform_admin"
    : activeMembership?.role || (isPlatformAdmin ? "platform_admin" : null);

  let assignedPatientIds = [];
  let restrictToAssignedPatients = false;

  if (
    activeMembership &&
    ["caregiver", "operator", "viewer"].includes(activeMembership.role)
  ) {
    assignedPatientIds = await loadAssignedPatientIds(
      activeMembership.id,
      activeMembership.organization.id,
      executor,
    );
    restrictToAssignedPatients = assignedPatientIds.length > 0;
  }

  return {
    user,
    memberships,
    isPlatformAdmin,
    activeOrganization,
    activeMembership,
    activeOrganizationId: activeOrganization ? activeOrganization.id : null,
    activeMembershipId: activeMembership ? activeMembership.id : null,
    activeRole,
    assignedPatientIds,
    restrictToAssignedPatients,
  };
}

function toAuthUser(accessContext) {
  return {
    ...accessContext.user,
    activeRole: accessContext.activeRole,
    activeOrganizationId: accessContext.activeOrganizationId,
    activeOrganization: accessContext.activeOrganization,
    memberships: accessContext.memberships,
  };
}

function hasRole(accessContext, allowedRoles) {
  if (accessContext.isPlatformAdmin) {
    return true;
  }

  return allowedRoles.includes(accessContext.activeRole);
}

function assertRole(accessContext, allowedRoles, message = "Ação não permitida.") {
  if (!hasRole(accessContext, allowedRoles)) {
    throw new HttpError(403, message);
  }
}

function buildScopeFilter(accessContext, { organizationColumn, patientColumn }) {
  const clauses = [];
  const params = [];

  if (!accessContext.isPlatformAdmin || accessContext.activeOrganizationId) {
    if (!accessContext.activeOrganizationId) {
      throw new HttpError(400, "Nenhuma organização ativa foi selecionada.");
    }

    clauses.push(`${organizationColumn} = ?`);
    params.push(accessContext.activeOrganizationId);
  }

  if (
    patientColumn &&
    accessContext.restrictToAssignedPatients &&
    accessContext.assignedPatientIds.length > 0
  ) {
    clauses.push(
      `${patientColumn} IN (${accessContext.assignedPatientIds.map(() => "?").join(", ")})`,
    );
    params.push(...accessContext.assignedPatientIds);
  }

  return {
    clauses,
    params,
  };
}

function canAccessScope(accessContext, organizationId, patientId) {
  if (!organizationId) {
    return accessContext.isPlatformAdmin && !accessContext.activeOrganizationId;
  }

  if (!accessContext.isPlatformAdmin || accessContext.activeOrganizationId) {
    if (Number(organizationId) !== Number(accessContext.activeOrganizationId)) {
      return false;
    }
  }

  if (accessContext.restrictToAssignedPatients) {
    if (!patientId) {
      return false;
    }

    return accessContext.assignedPatientIds.includes(Number(patientId));
  }

  return true;
}

module.exports = {
  assertRole,
  buildScopeFilter,
  canAccessScope,
  hasRole,
  loadAccessContext,
  normalizeOrganizationId,
  toAuthUser,
};
