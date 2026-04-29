const net = require("net");
const path = require("path");

const { Aedes } = require("aedes");
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});

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

let aedes;
let server;
let shuttingDown = false;

function describePeer(socket) {
  const address = socket?.remoteAddress || "unknown";
  const port = socket?.remotePort || "unknown";
  return `${address}:${port}`;
}

function clientId(client) {
  return client?.id || "sem-id";
}

function registerAedesLogs(broker) {
  broker.on("client", (client) => {
    console.log(`[devBroker] MQTT client created: ${clientId(client)}`);
  });

  broker.on("clientReady", (client) => {
    console.log(`[devBroker] MQTT client connected: ${clientId(client)}`);
  });

  broker.on("clientDisconnect", (client) => {
    console.log(`[devBroker] MQTT client disconnected: ${clientId(client)}`);
  });

  broker.on("clientError", (client, error) => {
    console.error(
      `[devBroker] MQTT client error (${clientId(client)}): ${error.message}`,
    );
  });

  broker.on("connectionError", (client, error) => {
    console.error(
      `[devBroker] MQTT connection error (${clientId(client)}): ${error.message}`,
    );
  });

  broker.on("connackSent", (_connack, client) => {
    console.log(`[devBroker] MQTT CONNACK sent: ${clientId(client)}`);
  });

  broker.on("error", (error) => {
    console.error(`[devBroker] MQTT broker error: ${error.message}`);
  });

  broker.on("publish", (packet, client) => {
    if (!client || !packet?.topic || packet.topic.startsWith("$SYS/")) {
      return;
    }

    console.log(`[devBroker] ${client.id} -> ${packet.topic}`);
  });
}

function createTcpServer(broker) {
  return net.createServer((socket) => {
    console.log(`[devBroker] TCP connection from ${describePeer(socket)}`);
    socket.on("error", (error) => {
      console.error(
        `[devBroker] TCP connection error from ${describePeer(socket)}: ${error.message}`,
      );
    });
    broker.handle(socket);
  });
}

async function start() {
  aedes = await Aedes.createBroker();
  registerAedesLogs(aedes);

  server = createTcpServer(aedes);

  server.on("error", (error) => {
    console.error(
      `[devBroker] Falha ao iniciar em ${MQTT_BIND_HOST}:${MQTT_PORT}: ${error.message}`,
    );
    process.exit(1);
  });

  server.listen(MQTT_PORT, MQTT_BIND_HOST, () => {
    console.log(
      `[devBroker] MQTT dev broker listening on ${MQTT_BIND_HOST}:${MQTT_PORT}`,
    );
    console.log(
      "[devBroker] ESP32 devices should use the notebook LAN IPv4 as MQTT host.",
    );
    console.log("[devBroker] Do not use localhost on ESP32.");
    console.log(
      "[devBroker] Use apenas para desenvolvimento local. Para demos reais, prefira um broker externo controlado.",
    );
  });
}

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[devBroker] Encerrando broker (${signal})...`);

  const closeBroker = () => {
    if (!aedes || aedes.closed) {
      process.exit(0);
    }

    aedes.close(() => process.exit(0));
  };

  if (!server) {
    closeBroker();
    return;
  }

  server.close(closeBroker);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start().catch((error) => {
  console.error(
    `[devBroker] Falha ao inicializar broker MQTT: ${error.message}`,
  );
  process.exit(1);
});
