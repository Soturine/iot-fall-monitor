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

function markdownTable(headers, rows) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `| ${headers.map((header) =>
    /valor|publicadas|processadas|perdidas|taxa|persistidas|invalidas|sem device|media|p95|p99|eventos|com evidencia|sem evidencia|alertas|bloqueados/i.test(header)
      ? "---:"
      : "---",
  ).join(" | ")} |`;
  const rowLines = rows.map((row) => `| ${row.map((value) => String(value ?? "")).join(" | ")} |`);
  return [headerLine, separatorLine, ...rowLines].join("\n");
}

function formatDuration(durationMs) {
  if (!Number.isFinite(Number(durationMs))) {
    return "0 ms";
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1000).toFixed(2)} s`;
}

function renderMarkdownReport(summary) {
  const totals = summary.totals || {};
  const latency = summary.latency || {};
  const environment = summary.environment || {};
  const failures = summary.failures || [];
  const status = failures.length || totals.failed
    ? "falhou"
    : "concluido";
  const processed = totals.processed ?? totals.received ?? 0;
  const published = totals.published ?? 0;
  const persisted = totals.persisted ?? 0;
  const estimatedLoss = Math.max(0, published - processed);
  const throughput = summary.durationMs
    ? (processed / (summary.durationMs / 1000)).toFixed(2)
    : "0.00";

  return [
    `# Relatorio de Stress - ${summary.runId}`,
    "",
    "## Resultado geral",
    `- Status final: ${status}`,
    `- Duracao: ${formatDuration(summary.durationMs)}`,
    `- Modo: ${summary.mode || "dry-run"}`,
    `- Backend: ${environment.backend || "nao validado"}`,
    `- Broker: ${environment.broker || "nao validado"}`,
    `- Banco: ${environment.database || "nao validado"}`,
    "",
    "## Resumo numerico",
    markdownTable(
      ["Metrica", "Valor"],
      [
        ["Publicadas", published],
        ["Processadas", processed],
        ["Persistidas", persisted],
        ["Alertas criados", totals.alertsCreated || 0],
        ["Alertas com evidencia", totals.alertsWithEvidence || 0],
        ["Alertas sem evidencia", totals.alertsWithoutEvidence || 0],
        ["Eventos descartados", totals.discarded || 0],
        ["Falhas", totals.failed || failures.length || 0],
        ["Throughput msg/s", throughput],
        ["Memoria RSS MB", totals.memoryRssMb ?? "n/a"],
      ],
    ),
    "",
    "## Fluxo MQTT",
    markdownTable(
      ["Publicadas", "Processadas", "Perdidas estimadas", "Taxa"],
      [[published, processed, estimatedLoss, throughput]],
    ),
    "",
    "## Telemetria",
    markdownTable(
      ["Persistidas", "Invalidas", "Sem device", "Media ms", "p95", "p99"],
      [[
        totals.telemetryPersisted ?? persisted,
        totals.invalidTelemetry || 0,
        totals.missingDevice || 0,
        latency.avgMs || 0,
        latency.p95Ms || 0,
        latency.p99Ms || 0,
      ]],
    ),
    "",
    "## Quedas e alertas",
    markdownTable(
      ["Eventos fall_detected", "Com evidencia", "Sem evidencia", "Alertas criados", "Alertas bloqueados"],
      [[
        totals.fallEvents || 0,
        totals.fallEventsWithEvidence || totals.alertsWithEvidence || 0,
        totals.fallEventsWithoutEvidence || 0,
        totals.alertsCreated || 0,
        totals.alertsBlocked || 0,
      ]],
    ),
    "",
    "## Falhas encontradas",
    failures.length
      ? markdownTable(
          ["Fase", "Cenario", "Motivo", "Recomendacao"],
          failures.map((failure) => [
            failure.phase || "n/a",
            failure.scenario || "n/a",
            failure.reason || failure.error || "Falha sem motivo registrado.",
            failure.recommendation || "Revisar payload, topico e log JSONL pelo runId.",
          ]),
        )
      : "Nenhuma falha registrada.",
    "",
    "## Gargalos provaveis",
    summary.bottlenecks?.length
      ? summary.bottlenecks.map((item) => `- ${item}`).join("\n")
      : "- Sem gargalo evidente nesta execucao.",
    "",
    "## Recomendacoes",
    summary.recommendations?.length
      ? summary.recommendations.map((item) => `- ${item}`).join("\n")
      : "- Comparar publicadas, processadas e persistidas no banco antes de aumentar carga.",
    "",
  ].join("\n");
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

  function writeFailures(failures) {
    const failuresPath = path.join(directory, `failures-${runId}.json`);
    fs.writeFileSync(failuresPath, `${JSON.stringify(failures || [], null, 2)}\n`);
    return failuresPath;
  }

  function writeReport(summary) {
    const reportPath = path.join(directory, `report-${runId}.md`);
    fs.writeFileSync(reportPath, renderMarkdownReport(summary));
    return reportPath;
  }

  function writeArtifacts(summary) {
    const normalizedSummary = {
      ...summary,
      failures: summary.failures || [],
    };

    return {
      summaryPath: writeSummary(normalizedSummary),
      failuresPath: writeFailures(normalizedSummary.failures),
      reportPath: writeReport(normalizedSummary),
    };
  }

  return {
    directory,
    jsonlPath,
    write,
    writeArtifacts,
    writeFailures,
    writeReport,
    writeSummary,
  };
}

module.exports = {
  createStressLogger,
  ensureStressLogDir,
  renderMarkdownReport,
  summarizeLatencies,
};
