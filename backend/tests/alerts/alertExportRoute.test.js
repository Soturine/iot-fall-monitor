const assert = require("node:assert/strict");
const test = require("node:test");

const { createApp } = require("../../src/app");

test("GET /api/alerts/export exige Bearer Token", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/alerts/export`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.message, "Token de acesso ausente.");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
