const net = require("net");

const { Aedes } = require("aedes");

const aedes = new Aedes();

function toPort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const host = process.env.DEV_BROKER_HOST || "localhost";
const port = toPort(process.env.DEV_BROKER_PORT || process.argv[2], 1883);
const server = net.createServer(aedes.handle);

server.on("error", (error) => {
  console.error(`[devBroker] Falha ao iniciar em ${host}:${port}: ${error.message}`);
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

server.listen(port, host, () => {
  console.log(`[devBroker] Broker MQTT de desenvolvimento escutando em mqtt://${host}:${port}`);
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
