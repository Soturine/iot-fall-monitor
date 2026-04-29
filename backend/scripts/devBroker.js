const net = require("net");
const path = require("path");

const { Aedes } = require("aedes");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const aedes = new Aedes();

function toPort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MQTT_BIND_HOST =
  process.env.MQTT_BIND_HOST || process.env.DEV_BROKER_HOST || "0.0.0.0";
const MQTT_PORT = toPort(
  process.env.MQTT_PORT || process.env.DEV_BROKER_PORT || process.argv[2],
  1883,
);
const server = net.createServer(aedes.handle);

server.on("error", (error) => {
  console.error(
    `[devBroker] Falha ao iniciar em ${MQTT_BIND_HOST}:${MQTT_PORT}: ${error.message}`,
  );
  process.exit(1);
});

aedes.on("clientReady", (client) => {
  console.log(`[devBroker] Cliente conectado: ${client?.id || "sem-id"}`);
});

aedes.on("clientDisconnect", (client) => {
  console.log(`[devBroker] Cliente desconectado: ${client?.id || "sem-id"}`);
});

aedes.on("publish", (packet, client) => {
  if (!client || !packet?.topic || packet.topic.startsWith("$SYS/")) {
    return;
  }

  console.log(`[devBroker] ${client.id} -> ${packet.topic}`);
});

server.listen(MQTT_PORT, MQTT_BIND_HOST, () => {
  console.log(
    `[devBroker] MQTT dev broker listening on ${MQTT_BIND_HOST}:${MQTT_PORT}`,
  );
  console.log(
    "[devBroker] ESP32 devices should use the notebook LAN IPv4 as MQTT host.",
  );
  console.log("[devBroker] Do not use localhost on ESP32.");
  console.log("[devBroker] Use apenas para desenvolvimento local. Para demos reais, prefira um broker externo controlado.");
});

function shutdown(signal) {
  console.log(`[devBroker] Encerrando broker (${signal})...`);

  server.close(() => {
    aedes.close(() => {
      process.exit(0);
    });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
