const assert = require("node:assert/strict");
const test = require("node:test");

const { createApp } = require("../../src/app");

test("POST /api/devices/:id/reset-claim exige Bearer Token", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/devices/5/reset-claim`,
      { method: "POST" },
    );

    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
