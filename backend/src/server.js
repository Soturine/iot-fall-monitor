const http = require("http");

const { createApp } = require("./app");
const { env } = require("./config/env");
const { testConnection, pool } = require("./db/pool");
const { checkRuntimeSchema } = require("./db/schemaHealth");
const { startDeviceStatusJob } = require("./jobs/deviceStatusJob");
const { createMqttBridge } = require("./mqtt/client");
const { createSocketServer } = require("./socket");
const { logger } = require("./utils/logger");

async function startServer() {
  await testConnection();
  const schemaHealth = await checkRuntimeSchema();

  if (!schemaHealth.ok) {
    logger.error("Schema do banco parece desatualizado para o fluxo atual.", {
      missing: schemaHealth.missing,
      recommendation: "Execute npm run db:migrate:evidence --prefix backend, depois npm run db:migrate:sensor-diagnostics --prefix backend, e reinicie o backend.",
    });
  }

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);
  app.set("io", io);

  const mqttBridge = createMqttBridge({ io });
  const stopDeviceStatusJob = startDeviceStatusJob(io);

  httpServer.listen(env.port, () => {
    logger.info("Backend iniciado.", {
      port: env.port,
      logLevel: env.logLevel,
      mqttBrokerUrl: env.mqtt.brokerUrl,
      mqttTopicBase: env.mqtt.topicBase,
      database: env.mysql.database,
    });
  });

  async function shutdown(signal) {
    logger.warn("Encerrando backend.", { signal });
    stopDeviceStatusJob();
    await mqttBridge.close();
    io.close();
    httpServer.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => {
    shutdown("SIGINT").catch((error) => {
      logger.error("Erro ao encerrar aplicação.", { message: error.message });
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch((error) => {
      logger.error("Erro ao encerrar aplicação.", { message: error.message });
      process.exit(1);
    });
  });
}

startServer().catch((error) => {
  logger.error("Falha ao iniciar backend.", { message: error.message });
  process.exit(1);
});
