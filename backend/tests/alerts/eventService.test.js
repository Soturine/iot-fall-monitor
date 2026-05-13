const assert = require("node:assert/strict");
const test = require("node:test");

const {
  deriveSeverity,
  shouldCreateAlert,
} = require("../../src/services/eventService");

test("deriveSeverity classifica eventos criticos de queda e SOS", () => {
  assert.equal(
    deriveSeverity("fall_detected", { immobility_confirmed: true }),
    "critical",
  );
  assert.equal(
    deriveSeverity("fall_detected", { immobility_confirmed: false }),
    "high",
  );
  assert.equal(deriveSeverity("sos_pressed", {}), "high");
  assert.equal(deriveSeverity("unknown_event", {}), "medium");
});

test("deriveSeverity preserva severidade explicita do payload", () => {
  assert.equal(deriveSeverity("fall_detected", { severity: "low" }), "low");
});

test("shouldCreateAlert cria alerta apenas para queda e SOS", () => {
  assert.equal(shouldCreateAlert("fall_detected"), true);
  assert.equal(shouldCreateAlert("sos_pressed"), true);
  assert.equal(shouldCreateAlert("device_status"), false);
  assert.equal(shouldCreateAlert("heartbeat"), false);
});
