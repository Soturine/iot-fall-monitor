# Arquitetura de alertas de queda

Este documento descreve o fluxo real atual de alertas internos do projeto Queda. Ele cobre firmware, MQTT, backend, banco, Socket.IO e frontend. A calibracao fina do MPU6050 segue fora deste escopo porque depende do prototipo fisico.

## Fluxo ponta a ponta

```text
ESP32 detecta queda ou SOS
-> publica evento MQTT
-> backend recebe no mqttIngestionService
-> backend valida JSON, canal e device
-> backend resolve device_id/device_uid
-> backend grava evento
-> backend decide se cria alerta
-> backend garante alerta open idempotente por event_id
-> backend emite alert:new por Socket.IO no escopo correto
-> frontend atualiza dashboard/devices/alerts em tempo real
-> usuario reconhece, cancela ou resolve
-> backend grava alert_actions e audit log
```

O alerta atual e interno ao sistema: ele persiste em MySQL e aparece em realtime no painel. Ainda nao existe envio externo de SMS, WhatsApp, e-mail, push ou webhook.

## Topicos MQTT

Base padrao:

```text
MQTT_TOPIC_BASE=queda/devices
```

Topicos assinados pelo backend:

```text
queda/devices/+/status
queda/devices/+/telemetry
queda/devices/+/events
```

Topicos publicados pelo firmware:

```text
queda/devices/{deviceId}/status
queda/devices/{deviceId}/telemetry
queda/devices/{deviceId}/events
```

O `{deviceId}` do topico deve bater com o `device_id` operacional do payload sempre que possivel. Se o payload nao tiver `device_id`, o backend tenta usar o identificador do topico. Se ambos estiverem ausentes, a mensagem e descartada com log.

## Payloads minimos

### Status

```json
{
  "device_uid": "esp32-chip-077000",
  "device_id": "esp32_01",
  "timestamp": 1760000000,
  "online": true,
  "wifi_rssi": -58,
  "battery_level": 86
}
```

Campos usados:

- `device_id`: identificador operacional do device.
- `device_uid`: identidade tecnica estavel quando disponivel.
- `timestamp`: Unix time em segundos; se for implausivel, o backend usa a hora de recebimento.
- `wifi_rssi`, `battery_level` ou `battery_percent`: atualizam `device_status`.

### Telemetry

```json
{
  "device_uid": "esp32-chip-077000",
  "device_id": "esp32_01",
  "timestamp": 1760000000,
  "ax": 0.04,
  "ay": -0.02,
  "az": 0.98,
  "gx": 5.2,
  "gy": -1.1,
  "gz": 3.6,
  "accel_magnitude": 0.98,
  "gyro_magnitude": 6.4,
  "pitch_deg": -3.1,
  "roll_deg": 2.7
}
```

Telemetria atualiza `device_status`, grava `telemetry_logs` e emite `telemetry:new`. Ela nao cria alerta por si so.

### Events

```json
{
  "device_uid": "esp32-chip-077000",
  "device_id": "esp32_01",
  "event_type": "fall_detected",
  "timestamp": 1760000000,
  "accel_magnitude": 3.74,
  "gyro_magnitude": 182.5,
  "immobility_confirmed": true,
  "battery_level": 86
}
```

Campos obrigatorios para evento util:

- `device_id` no payload ou no topico.
- `event_type`, com fallback interno para `device_event`.

Campos que enriquecem severidade e mensagem:

- `immobility_confirmed` ou `immobility`
- `accel_magnitude`
- `gyro_magnitude`
- `message`
- `severity`, quando explicitamente enviada

## Resolucao de device

O backend usa `getOrCreateDeviceByIdentity`:

1. normaliza `device_id` como `device_identifier`;
2. prefere `device_uid` quando ele existe;
3. se nao houver UID, usa fallback `legacy:{device_id}`;
4. reconcilia cadastro legado claimed quando um UID fisico novo chega para o mesmo `device_id`;
5. cria device tecnico `unclaimed` se a identidade ainda nao existir.

O escopo vigente do device no momento da ingestao e copiado para:

- `device_status`
- `telemetry_logs`
- `events`
- `alerts`

Campos de escopo:

- `organization_id`
- `patient_id`
- `device_assignment_history_id`

Se o device nao estiver pareado a uma organizacao, o backend persiste quando aplicavel, mas registra warning e nao entrega evento realtime para tenant de familia/clinica/hospital.

## Diferenca entre status, telemetry e events

- `status`: presenca operacional do device, bateria, RSSI, firmware e ultimo contato.
- `telemetry`: amostras do sensor usadas no grafico e na heuristica experimental de postura/movimento.
- `events`: fatos discretos, como queda detectada ou SOS manual.

## Eventos que geram alerta

Hoje `shouldCreateAlert` retorna `true` para:

- `fall_detected`
- `sos_pressed`

Severidade atual:

- `fall_detected` com `immobility_confirmed=true`: `critical`
- `fall_detected` sem imobilidade: `high`
- `sos_pressed`: `high`
- evento desconhecido: `medium`

Eventos comuns como `device_status`, `heartbeat` ou qualquer outro tipo desconhecido sao gravados como evento quando chegam no canal `events`, mas nao criam alerta.

## Persistencia do alerta

`recordEventFromMqtt` grava em `events`. Depois, `createAlertForEvent` executa:

```sql
INSERT INTO alerts (...)
VALUES (...)
ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
```

O indice unico `alerts.event_id` impede alerta duplicado para o mesmo evento persistido. Duplicatas MQTT sem identificador externo ainda podem virar eventos distintos; hoje nao existe um `event_uid` no contrato do firmware.

## Realtime

Eventos emitidos:

- `device:status`
- `telemetry:new`
- `alert:new`
- `alert:updated`

`emitScopedEvent` publica em rooms Socket.IO:

- `scope:platform:global`
- `scope:org:{organizationId}`
- `scope:patient:{patientId}`

Um evento sem organizacao fica restrito ao escopo global de plataforma e nao entra em room de tenant.

## Concorrencia e locks

A ingestao MQTT usa `runWithKeyedLock("mqtt:{deviceIdentifier}")` para serializar mensagens simultaneas do mesmo device dentro de uma instancia Node. Isso protege reconciliacao de identidade, atualizacao de status, persistencia e emissao realtime contra corrida local.

Limitacao: o lock e em memoria. Se o backend rodar em multiplas instancias, sera necessario usar fila particionada por device, lock distribuido ou consumidor MQTT com afinidade por chave.

As acoes de alerta usam transacao e `SELECT ... FOR UPDATE`, impedindo transicoes conflitantes entre operadores.

## Observabilidade

Cada mensagem MQTT processada recebe `correlationId`. Os logs do backend incluem, quando disponivel:

- `correlationId`
- topico
- canal
- `deviceIdentifier`
- `deviceUid`
- `organizationId`
- `patientId`
- `eventId`
- `alertId`
- `durationMs`
- motivo de descarte

O backend nao loga senha, token ou segredo. Payload completo fica restrito a banco/auditoria existente e aos logs de stress dry-run.

## Testes e stress

Scripts principais:

```powershell
npm test --prefix backend
npm run test:alerts --prefix backend
npm run test:mqtt --prefix backend
npm run stress:alerts --prefix backend
```

A suite `stress:alerts` roda em dry-run por padrao. Ela usa mocks do banco e do Socket.IO para pressionar:

- rajada de telemetria;
- rajada de quedas/SOS;
- payloads ruins;
- concorrencia do mesmo device;
- emissao realtime escopada.

Logs:

```text
backend/logs/stress/stress-<runId>.jsonl
backend/logs/stress/summary-<runId>.json
```

Esses arquivos sao artefatos locais e ficam ignorados pelo Git.

## Camada futura de notificacao externa

Quando houver SMS, WhatsApp, e-mail, push ou webhook, a criacao do alerta nao deve depender diretamente desses canais. O desenho sugerido e uma camada separada:

```js
async function dispatchAlertNotification(alert, options = { dryRun: true }) {}
```

Requisitos futuros:

- idempotencia por `alertId` e canal;
- retry com backoff;
- fila ou worker separado;
- status de entrega por canal;
- logs com `correlationId`;
- `ALERT_DELIVERY_DRY_RUN=true` em dev/stress;
- falha de notificacao externa nao pode bloquear a criacao do alerta interno.
