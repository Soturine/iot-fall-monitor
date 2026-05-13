const crypto = require("crypto");

function createCorrelationId(prefix = "trace") {
  const safePrefix = String(prefix || "trace").replace(/[^a-zA-Z0-9_-]/g, "");
  return `${safePrefix || "trace"}_${Date.now().toString(36)}_${crypto
    .randomBytes(4)
    .toString("hex")}`;
}

function elapsedMsSince(startedAt) {
  if (!startedAt) {
    return 0;
  }

  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}

module.exports = {
  createCorrelationId,
  elapsedMsSince,
};
