const { execute } = require("../db/pool");

async function createAuditLog(entry, executor = null) {
  await execute(
    executor,
    `
      INSERT INTO audit_logs (
        organization_id,
        user_id,
        action,
        entity_type,
        entity_id,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      entry.organizationId || null,
      entry.userId || null,
      entry.action,
      entry.entityType || null,
      entry.entityId || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ],
  );
}

module.exports = {
  createAuditLog,
};
