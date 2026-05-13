const fs = require("fs");
const path = require("path");

const stressLogDir = path.resolve(__dirname, "..", "..", "logs", "stress");

function ensureStressLogDir() {
  fs.mkdirSync(stressLogDir, { recursive: true });
  return stressLogDir;
}

function percentile(values, ratio) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return Number(sorted[index].toFixed(2));
}

function summarizeLatencies(values) {
  if (!values.length) {
    return {
      avgMs: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    avgMs: Number((total / values.length).toFixed(2)),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: Number(Math.max(...values).toFixed(2)),
  };
}

function createStressLogger(runId) {
  const directory = ensureStressLogDir();
  const jsonlPath = path.join(directory, `${runId}.jsonl`);

  function write(entry) {
    const normalized = {
      runId,
      timestamp: new Date().toISOString(),
      level: entry.level || "info",
      phase: entry.phase || "summary",
      scenario: entry.scenario || null,
      deviceId: entry.deviceId || null,
      topic: entry.topic || null,
      message: entry.message || "",
      durationMs: entry.durationMs ?? null,
      success: entry.success ?? true,
      error: entry.error || null,
      metadata: entry.metadata || {},
    };

    fs.appendFileSync(jsonlPath, `${JSON.stringify(normalized)}\n`);
  }

  function writeSummary(summary) {
    const summaryPath = path.join(directory, `summary-${runId}.json`);
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    return summaryPath;
  }

  return {
    directory,
    jsonlPath,
    write,
    writeSummary,
  };
}

module.exports = {
  createStressLogger,
  ensureStressLogDir,
  summarizeLatencies,
};
