const bcrypt = require("bcrypt");

const { execute, one, transaction } = require("../db/pool");
const { HttpError } = require("../utils/httpError");
const { signToken } = require("../utils/auth");
const { createAuditLog } = require("./auditService");
const { loadAccessContext, toAuthUser } = require("./scopeService");

const ORGANIZATION_TYPES = ["family", "clinic", "hospital"];

function validatePassword(password) {
  return typeof password === "string" && password.trim().length >= 6;
}

async function getUserById(userId, requestedOrganizationId = null, executor = null) {
  const accessContext = await loadAccessContext(
    { userId, requestedOrganizationId },
    executor,
  );

  return toAuthUser(accessContext);
}

async function registerUser({ name, email, password, organizationName, organizationType }) {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedOrganizationName = String(organizationName || "").trim();
  const normalizedOrganizationType = String(organizationType || "").trim().toLowerCase();

  if (!normalizedName) {
    throw new HttpError(400, "Informe o nome do usuário.");
  }

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new HttpError(400, "Informe um e-mail válido.");
  }

  if (!validatePassword(password)) {
    throw new HttpError(400, "A senha deve ter pelo menos 6 caracteres.");
  }

  if (!normalizedOrganizationName) {
    throw new HttpError(400, "Informe o nome da organização.");
  }

  if (!ORGANIZATION_TYPES.includes(normalizedOrganizationType)) {
    throw new HttpError(400, "Escolha um tipo de organização válido.");
  }

  return transaction(async (connection) => {
    const existingUser = await one(
      connection,
      `
        SELECT id
        FROM users
        WHERE email = ?
      `,
      [normalizedEmail],
    );

    if (existingUser) {
      throw new HttpError(409, "Já existe um usuário com este e-mail.");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await execute(
      connection,
      `
        INSERT INTO users (name, email, password_hash, global_role, status)
        VALUES (?, ?, ?, 'user', 'active')
      `,
      [normalizedName, normalizedEmail, passwordHash],
    );

    const organizationResult = await execute(
      connection,
      `
        INSERT INTO organizations (name, type, status)
        VALUES (?, ?, 'active')
      `,
      [normalizedOrganizationName, normalizedOrganizationType],
    );

    await execute(
      connection,
      `
        INSERT INTO organization_members (
          organization_id,
          user_id,
          role,
          status
        )
        VALUES (?, ?, 'organization_admin', 'active')
      `,
      [organizationResult.insertId, userResult.insertId],
    );

    await createAuditLog(
      {
        organizationId: organizationResult.insertId,
        userId: userResult.insertId,
        action: "organization.bootstrap",
        entityType: "organization",
        entityId: organizationResult.insertId,
        metadata: {
          organizationName: normalizedOrganizationName,
          organizationType: normalizedOrganizationType,
        },
      },
      connection,
    );

    const accessContext = await loadAccessContext(
      {
        userId: userResult.insertId,
        requestedOrganizationId: organizationResult.insertId,
      },
      connection,
    );

    const user = toAuthUser(accessContext);

    return {
      user,
      token: signToken(user),
    };
  });
}

async function loginUser({ email, password, organizationId = null }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || typeof password !== "string") {
    throw new HttpError(400, "Informe e-mail e senha.");
  }

  const userRow = await one(
    null,
    `
      SELECT
        id,
        name,
        email,
        global_role,
        status,
        password_hash,
        created_at,
        updated_at
      FROM users
      WHERE email = ?
    `,
    [normalizedEmail],
  );

  if (!userRow) {
    throw new HttpError(401, "Credenciais inválidas.");
  }

  if (userRow.status !== "active") {
    throw new HttpError(403, "Esta conta está desativada.");
  }

  const passwordMatches = await bcrypt.compare(password, userRow.password_hash);

  if (!passwordMatches) {
    throw new HttpError(401, "Credenciais inválidas.");
  }

  const accessContext = await loadAccessContext({
    userId: userRow.id,
    requestedOrganizationId: organizationId,
  });

  const user = toAuthUser(accessContext);

  return {
    user,
    token: signToken(user),
  };
}

module.exports = {
  getUserById,
  loginUser,
  registerUser,
};
