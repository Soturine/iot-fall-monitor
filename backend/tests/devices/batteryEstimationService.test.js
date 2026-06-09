const assert = require("node:assert/strict");
const test = require("node:test");

const {
  INITIAL_MINUTES_PER_PERCENT,
  calculateLearnedRate,
  estimateBattery,
} = require("../../src/services/batteryEstimationService");

const now = new Date("2026-06-09T12:00:00.000Z");

test("estimativa preserva 100% em calibracao feita agora", () => {
  const result = estimateBattery({
    manualPercent: 100,
    manualUpdatedAt: now,
    now,
  });

  assert.equal(result.percent, 100);
});

test("estimativa reduz 1% depois de 33.5 minutos", () => {
  const result = estimateBattery({
    manualPercent: 100,
    manualUpdatedAt: new Date(now.getTime() - 33.5 * 60000),
    now,
  });

  assert.equal(result.percent, 99);
});

test("estimativa reduz 96% para 94% depois de 67 minutos", () => {
  const result = estimateBattery({
    manualPercent: 96,
    manualUpdatedAt: new Date(now.getTime() - 67 * 60000),
    now,
  });

  assert.equal(result.percent, 94);
});

test("estimativa limita o percentual entre 0 e 100", () => {
  assert.equal(
    estimateBattery({
      manualPercent: 100,
      manualUpdatedAt: new Date(now.getTime() + 60000),
      now,
    }).percent,
    100,
  );
  assert.equal(
    estimateBattery({
      manualPercent: 1,
      manualUpdatedAt: new Date(now.getTime() - 10000 * 60000),
      now,
    }).percent,
    0,
  );
});

test("aprendizado suaviza duas calibracoes validas", () => {
  const result = calculateLearnedRate({
    previousPercent: 100,
    previousAt: new Date("2026-06-09T10:00:00.000Z"),
    currentPercent: 98,
    currentAt: new Date("2026-06-09T11:00:00.000Z"),
    currentRate: INITIAL_MINUTES_PER_PERCENT,
  });

  assert.equal(result.ignoredReason, null);
  assert.equal(result.observedRate, 30);
  assert.equal(result.appliedRate, INITIAL_MINUTES_PER_PERCENT * 0.7 + 30 * 0.3);
});

test("aprendizado ignora aumento de percentual e taxa absurda", () => {
  const increased = calculateLearnedRate({
    previousPercent: 90,
    previousAt: new Date("2026-06-09T10:00:00.000Z"),
    currentPercent: 95,
    currentAt: new Date("2026-06-09T11:00:00.000Z"),
  });
  assert.equal(increased.ignoredReason, "percent_increased");

  const absurd = calculateLearnedRate({
    previousPercent: 100,
    previousAt: new Date("2026-06-09T10:00:00.000Z"),
    currentPercent: 90,
    currentAt: new Date("2026-06-09T10:20:00.000Z"),
  });
  assert.equal(absurd.ignoredReason, "observed_rate_out_of_range");
});
