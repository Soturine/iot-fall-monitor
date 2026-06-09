const assert = require("node:assert/strict");
const test = require("node:test");

const { loadWithMocks } = require("../helpers/moduleSandbox");

const actionCalls = [];

const { module: appModule, restore } = loadWithMocks("src/app.js", {
  "src/middlewares/auth.js": {
    requireAccessContext(req, _res, next) {
      req.user = { id: 7, name: "Admin Demo" };
      req.access = {
        activeOrganizationId: 1,
        activeRole: "organization_admin",
        isPlatformAdmin: false,
      };
      next();
    },
  },
  "src/services/alertService.js": {
    async updateAlertStatus(alertId, actionType, userId, note) {
      actionCalls.push({ alertId, actionType, userId, note });
      return {
        id: alertId,
        organizationId: 1,
        patientId: 2,
        status: actionType === "acknowledge" ? "acknowledged" : `${actionType}d`,
      };
    },
  },
  "src/socket/scopedEmitter.js": {
    emitScopedEvent() {},
  },
});

test.after(() => {
  restore();
});

for (const actionType of ["acknowledge", "resolve", "cancel"]) {
  test(`POST /api/alerts/:id/${actionType} funciona sem body`, async () => {
    const app = appModule.createApp();
    const server = app.listen(0);

    try {
      await new Promise((resolve) => server.once("listening", resolve));
      const address = server.address();
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/alerts/10/${actionType}`,
        {
          method: "POST",
        },
      );
      const body = await response.json();
      const call = actionCalls.at(-1);

      assert.equal(response.status, 200);
      assert.equal(body.action, actionType);
      assert.deepEqual(call, {
        alertId: 10,
        actionType,
        userId: 7,
        note: null,
      });
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
}
