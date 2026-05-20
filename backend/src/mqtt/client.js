const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");

const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { parseDeviceTopic, getSubscriptionTopics } = require("./topics");
const { handleMqttMessage } = require("../services/mqttIngestionService");

function loadTlsCaIfConfigured() {
  if (!env.mqtt.tlsCaFile) {
    return undefined;
  }

  try {
    return fs.readFileSync(path.resolve(process.cwd(), env.mqtt.tlsCaFile));
  } catch (error) {
    logger.warn("Arquivo de CA do MQTT/TLS nao pode ser lido. Seguindo sem CA customizada.", {
      tlsCaFile: env.mqtt.tlsCaFile,
      message: error.message,
    });
    return undefined;
  }
}

function buildClientOptions() {
  const options = {
    username: env.mqtt.username || undefined,
    password: env.mqtt.password || undefined,
    clientId: env.mqtt.clientId,
    reconnectPeriod: env.mqtt.reconnectPeriodMs,
    connectTimeout: env.mqtt.connectTimeoutMs,
    keepalive: env.mqtt.keepaliveSeconds,
    reschedulePings: true,
    resubscribe: true,
    clean: true,
  };

  if (env.mqtt.brokerUrl.startsWith("mqtts://")) {
    options.rejectUnauthorized = env.mqtt.tlsRejectUnauthorized;
    const ca = loadTlsCaIfConfigured();
    if (ca) {
      options.ca = ca;
    }
  }

  return options;
}

function createMqttBridge({ io }) {
  const client = mqtt.connect(env.mqtt.brokerUrl, buildClientOptions());

  client.on("connect", () => {
    const topics = getSubscriptionTopics();
    logger.info("Conectado ao broker MQTT.", {
      brokerUrl: env.mqtt.brokerUrl,
      clientId: env.mqtt.clientId,
      topics,
    });

    client.subscribe(topics, (error) => {
      if (error) {
        logger.error("Falha ao assinar tópicos MQTT.", {
          message: error.message,
        });
        return;
      }

      logger.info("Topicos MQTT assinados com sucesso.", {
        topicCount: topics.length,
        topics,
      });
    });
  });

  client.on("message", (topic, payloadBuffer) => {
    const payloadBytes = payloadBuffer?.length || 0;
    const topicInfo = parseDeviceTopic(topic);

    if (!topicInfo) {
      logger.warn("Topico MQTT ignorado fora do padrao configurado.", {
        topic,
        payloadBytes,
      });
      return;
    }

    logger.debug("Pacote MQTT recebido pelo backend.", {
      topic,
      channel: topicInfo.channel,
      topicDeviceIdentifier: topicInfo.deviceIdentifier,
      payloadBytes,
    });

    handleMqttMessage({
      topicInfo,
      payloadText: payloadBuffer.toString(),
      io,
    }).catch((error) => {
      logger.error("Falha ao processar mensagem MQTT.", {
        topic,
        message: error.message,
      });
    });
  });

  client.on("reconnect", () => {
    logger.warn("Tentando reconectar ao broker MQTT...");
  });

  client.on("offline", () => {
    logger.warn("Cliente MQTT ficou offline.");
  });

  client.on("close", () => {
    logger.warn("Conexao MQTT do backend fechada.", {
      brokerUrl: env.mqtt.brokerUrl,
      clientId: env.mqtt.clientId,
      reconnectPeriodMs: env.mqtt.reconnectPeriodMs,
      keepaliveSeconds: env.mqtt.keepaliveSeconds,
    });
  });

  client.on("error", (error) => {
    logger.error("Erro no cliente MQTT.", { message: error.message });
  });

  return {
    close() {
      return new Promise((resolve) => {
        client.end(false, resolve);
      });
    },
  };
}

module.exports = {
  createMqttBridge,
};
