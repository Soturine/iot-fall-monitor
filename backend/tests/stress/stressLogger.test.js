const assert = require("node:assert/strict");
const fs = require("fs");
const test = require("node:test");

const {
  createStressLogger,
  renderMarkdownReport,
} = require("../../scripts/stress/stressLogger");

function buildSummary(runId) {
  return {
    runId,
    startedAt: "2026-05-13T14:38:00.000Z",
    finishedAt: "2026-05-13T14:38:05.000Z",
    durationMs: 5000,
    mode: "dry-run",
    environment: {
      backend: "mockado",
      broker: "mockado",
      database: "mockado",
    },
    totals: {
      published: 10,
      processed: 9,
      persisted: 8,
      alertsCreated: 2,
      alertsWithEvidence: 1,
      alertsWithoutEvidence: 0,
      fallEvents: 3,
      fallEventsWithEvidence: 1,
      fallEventsWithoutEvidence: 1,
      alertsBlocked: 1,
      failed: 1,
    },
    latency: {
      avgMs: 3,
      p95Ms: 7,
      p99Ms: 9,
      maxMs: 10,
    },
    failures: [
      {
        phase: "mqtt_publish",
        scenario: "real_fall_burst",
        reason: "Falha detalhada sem truncamento para leitura humana.",
        recommendation: "Verificar broker local.",
      },
    ],
  };
}

test("renderMarkdownReport gera secoes humanas sem truncar falhas", () => {
  const markdown = renderMarkdownReport(buildSummary("stress-unit"));

  assert.match(markdown, /# Relatorio de Stress - stress-unit/);
  assert.match(markdown, /## Resultado geral/);
  assert.match(markdown, /## Fluxo MQTT/);
  assert.match(markdown, /## Quedas e alertas/);
  assert.match(markdown, /Falha detalhada sem truncamento para leitura humana/);
});

test("createStressLogger escreve JSONL, summary, failures e report", () => {
  const runId = `stress-unit-${Date.now()}`;
  const stressLogger = createStressLogger(runId);
  stressLogger.write({
    phase: "mqtt_publish",
    scenario: "unit",
    message: "Linha JSONL completa.",
    metadata: { payload: { device_id: "stress_esp32_001" } },
  });

  const artifacts = stressLogger.writeArtifacts(buildSummary(runId));

  assert.ok(fs.existsSync(stressLogger.jsonlPath));
  assert.ok(fs.existsSync(artifacts.summaryPath));
  assert.ok(fs.existsSync(artifacts.failuresPath));
  assert.ok(fs.existsSync(artifacts.reportPath));
  assert.match(fs.readFileSync(stressLogger.jsonlPath, "utf8"), /Linha JSONL completa/);
  assert.match(fs.readFileSync(artifacts.reportPath, "utf8"), /Resumo numerico/);
});
