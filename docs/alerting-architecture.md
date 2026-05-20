# Arquitetura de alertas de queda

Este documento descreve o fluxo real atual de alertas internos do projeto Queda. Ele cobre firmware, MQTT, backend, banco, Socket.IO e frontend. A calibração fina do MPU6050 segue fora deste escopo porque depende do protótipo físico.

## Fluxo ponta a ponta

```text
ESP32 detecta queda ou SOS
-> publica evento MQTT
-> backend recebe no mqttIngestionService
-> backend valida JSON, canal e device
-> backend resolve device_id/device_uid
-> backend busca telemetria do mesmo device em janela curta quando for fall_detected
-> backend grava evento com status/resumo de evidência
-> backend vincula amostras em event_telemetry_evidence quando existirem
-> backend decide se cria alerta
-> backend garante alerta open idempotente por event_id
-> backend emite alert:new por Socket.IO no escopo correto
-> frontend atualiza dashboard/devices/alerts em tempo real
-> usuário reconhece, cancela ou resolve
-> backend grava alert_actions e audit log
```

O alerta atual e interno ao sistema: ele persiste em MySQL e aparece em realtime no painel. Ainda não existe envio externo de SMS, WhatsApp, e-mail, push ou webhook.

## Topicos MQTT

Base padrão:

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

O `{deviceId}` do tópico deve bater com o `device_id` operacional do payload sempre que possível. Se o payload não tiver `device_id`, o backend tenta usar o identificador do tópico. Se ambos estiverem ausentes, a mensagem e descartada com log.

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
- `device_uid`: identidade técnica estável quando disponível.
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

Telemetria válida atualiza `device_status`, grava `telemetry_logs` e emite `telemetry:new`. Para ser considerada amostra real, o payload precisa trazer `ax`, `ay`, `az`, `gx`, `gy` e `gz` numericos e não pode vir com `sensor_valid=false`. Payload diagnóstico sem amostra real atualiza apenas a saúde do device e não cria linha em `telemetry_logs`.
Para queda, essas amostras também viram evidência técnica consultavel quando o evento `fall_detected` chega perto no tempo.

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
  "decision_source": "firmware",
  "algorithm_version": "threshold_fsm_v2_time_features_v1",
  "detected": true,
  "candidate": true,
  "reason": "impact_orientation_immobility",
  "activity_state_estimate": "queda_confirmada",
  "confidence": 0.76,
  "fall_reason": "impact_orientation_immobility",
  "window_started_at_ms": 123456,
  "window_ended_at_ms": 127056,
  "sample_count": 72,
  "peak_accel_g": 3.74,
  "peak_gyro_dps": 182.5,
  "features": {
    "peak_accel_magnitude_g": 3.74,
    "peak_gyro_magnitude_dps": 182.5,
    "orientation_delta_deg": 58.2,
    "immobility_confirmed": true,
    "immobility_duration_ms": 2100,
    "analysis_window_ms": 3600,
    "samples_considered": 72
  },
  "features_time_domain": {
    "available": true,
    "sample_count": 64,
    "window_duration_ms": 3200,
    "peak_accel_magnitude": 3.74,
    "peak_gyro_magnitude": 182.5,
    "peak_jerk": 8.4
  },
  "features_frequency_domain": {
    "available": false,
    "experimental": true,
    "reason": "fft_experimental_disabled",
    "window_size": 64,
    "sample_interval_ms": 50
  },
  "linked_telemetry_window": {
    "available": false,
    "reason": "backend_links_persisted_telemetry"
  },
  "battery_level": 86
}
```

Campos obrigatorios para evento útil:

- `device_id` no payload ou no tópico.
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
3. se não houver UID, usa fallback `legacy:{device_id}`;
4. reconcilia cadastro legado claimed quando um UID físico novo chega para o mesmo `device_id`;
5. cria device técnico `unclaimed` se a identidade ainda não existir.

O escopo vigente do device no momento da ingestão e copiado para:

- `device_status`
- `telemetry_logs`
- `events`
- `alerts`

Campos de escopo:

- `organization_id`
- `patient_id`
- `device_assignment_history_id`

Se o device não estiver pareado a uma organização, o backend persiste quando aplicavel, mas registra warning e não entrega evento realtime para tenant de familia/clínica/hospital.

## Diferenca entre status, telemetry e events

- `status`: presença operacional do device, bateria, RSSI, firmware e último contato.
- `telemetry`: amostras do sensor usadas no gráfico e na heurística experimental de postura/movimento.
- `events`: fatos discretos, como queda detectada ou SOS manual.

## Eventos que geram alerta

Hoje `shouldCreateAlert` continua retornando `true` para tipos candidatos a alerta:

- `fall_detected`
- `sos_pressed`

Regra de produto atual:

- `fall_detected` com evidência `linked` ou `partial`: grava evento e cria alerta interno.
- `fall_detected` sem telemetria recente suficiente: grava evento técnico com `evidenceStatus=none`, loga warning e não cria alerta automático.
- `sos_pressed`: cria alerta mesmo sem telemetria, porque e acionamento manual.
- payload inválido ou sem device: não cria evento nem alerta.

Severidade atual:

- `fall_detected` com evidência e `immobility_confirmed=true`: `critical`
- `fall_detected` sem imobilidade: `high`
- `fall_detected` sem evidência: `medium`
- `sos_pressed`: `high`
- evento desconhecido: `medium`

Eventos comuns como `device_status`, `heartbeat` ou qualquer outro tipo desconhecido são gravados como evento quando chegam no canal `events`, mas não criam alerta.

## Evidencia de telemetria

O backend não trata mais `fall_detected` como alerta confiável sem rastro de sensor. Quando recebe um evento de queda, ele procura amostras em `telemetry_logs` para o mesmo:

- `device_id`
- `organization_id`
- `patient_id`
- `device_assignment_history_id`

A janela atual e conservadora:

```text
event_time - 10s até event_time + 3s
```

O evento recebe:

- `evidenceStatus`: `none`, `partial` ou `linked`
- `evidenceTelemetryId`: amostra mais próxima do evento
- `evidenceSampleCount`: quantidade de amostras relacionadas
- `evidenceWindowSeconds`: intervalo entre primeira e última amostra vinculada
- `evidenceSummary`: pico de aceleração, pico de giro, imobilidade confirmada, primeira e última amostra

O payload bruto do firmware também fica preservado em `raw_payload_json`, incluindo `decision_source`, `algorithm_version`, `fall_reason`, `features`, `features_time_domain`, `features_frequency_domain`, thresholds e demais campos enviados.

O `evidenceSummary` do backend continua sendo o resumo das amostras realmente persistidas em `telemetry_logs`, mas agora também incorpora um bloco `firmwareDecision` com a decisão local e as features enviadas. Isso evita duplicar a decisão: o firmware decide o alarme local/buzzer, enquanto o backend audita a decisão e relaciona as amostras persistidas.

Responsabilidades atuais:

- firmware: decide queda confirmada em tempo real e aciona buzzer local somente nesse caso
- backend: registra evento, preserva payload bruto, relaciona evidência de telemetria, cria alerta interno quando a regra permitir e evita duplicata curta de alerta aberto/em atendimento para a mesma queda
- frontend: exibe estado, evidência, alertas e diagnóstico, sem decidir queda real

A tabela `event_telemetry_evidence` guarda as amostras relacionadas com `relative_ms` e `role` (`nearest`, `peak`, `before_peak`, `after_peak`). Isso mantém compatibilidade com eventos antigos: se não houver evidência, os campos ficam nulos/default e a API devolve `evidenceStatus=none`.

## Persistencia do alerta

`recordEventFromMqtt` grava em `events`. Depois, `createAlertForEvent` executa:

```sql
INSERT INTO alerts (...)
VALUES (...)
ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
```

O indice unico `alerts.event_id` impede alerta duplicado para o mesmo evento persistido. Alem disso, na ingestão MQTT, `createAlertForEvent` pode reaproveitar um alerta de queda aberto/em atendimento para o mesmo device em uma janela curta de `20s`, reduzindo duplicidade quando o mesmo movimento gera pacotes próximos.

Duplicatas MQTT sem identificador externo ainda podem virar eventos distintos em `events`; hoje não existe um `event_uid` no contrato do firmware. A deduplicacao curta age apenas sobre a fila de alertas, não apaga os eventos auditaveis.

Para `fall_detected`, a criação de alerta agora acontece somente depois de `recordEventFromMqtt` preencher a evidência. Eventos sem evidência permanecem auditaveis em `events`, mas não entram automaticamente na fila crítica.

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

Um evento sem organização fica restrito ao escopo global de plataforma e não entra em room de tenant.

## Concorrencia e locks

A ingestão MQTT usa `runWithKeyedLock("mqtt:{deviceIdentifier}")` para serializar mensagens simultaneas do mesmo device dentro de uma instancia Node. Isso protege reconciliacao de identidade, atualização de status, persistência e emissão realtime contra corrida local.

Limitacao: o lock e em memoria. Se o backend rodar em multiplas instancias, sera necessário usar fila particionada por device, lock distribuido ou consumidor MQTT com afinidade por chave.

As acoes de alerta usam transacao e `SELECT ... FOR UPDATE`, impedindo transições conflitantes entre operadores.

## Observabilidade

Cada mensagem MQTT processada recebe `correlationId`. Os logs do backend incluem, quando disponível:

- `correlationId`
- tópico
- canal
- `deviceIdentifier`
- `deviceUid`
- `organizationId`
- `patientId`
- `eventId`
- `alertId`
- `durationMs`
- motivo de descarte

O backend não loga senha, token ou segredo. Payload completo fica restrito a banco/auditoria existente e aos logs de stress dry-run.

## Testes e stress

Scripts principais:

```powershell
npm test --prefix backend
npm run test:smoke --prefix backend
npm run test:integration --prefix backend
npm run test:alerts --prefix backend
npm run test:mqtt --prefix backend
npm run stress:dry --prefix backend
npm run stress:real --prefix backend
```

`stress:dry` usa mocks do banco, broker e Socket.IO. Ele e útil para regressao rapida e smoke de carga em processo local, mas não mede MySQL/broker/backend reais.

`stress:real` valida pré-requisitos e aborta se backend `/health`, broker MQTT ou MySQL local/dev não estiverem disponíveis. Ele publica MQTT real, consulta o banco depois do teste e mede perda estimada entre mensagens publicadas, aceitas no broker e persistidas.

Variáveis uteis:

```text
STRESS_MODE=real
STRESS_DEVICE_COUNT=10
STRESS_DURATION_SECONDS=30
STRESS_TELEMETRY_RATE_HZ=10
STRESS_FALL_EVENTS=50
STRESS_REQUIRE_DEV_DB=true
```

O script bloqueia execução em `NODE_ENV=production` e, por padrão, exige banco com nome de desenvolvimento/teste/local.

As suites cobrem:

- rajada de telemetria;
- rajada de quedas/SOS;
- payloads ruins;
- concorrência do mesmo device;
- emissão realtime escopada.

Logs:

```text
backend/logs/stress/stress-<runId>.jsonl
backend/logs/stress/summary-<runId>.json
backend/logs/stress/failures-<runId>.json
backend/logs/stress/report-<runId>.md
```

O JSONL preserva detalhes por máquina. O Markdown `report-*.md` resume resultado geral, fluxo MQTT, telemetria, quedas/alertas, falhas, gargalos e recomendações para leitura humana. Esses arquivos são artefatos locais e ficam ignorados pelo Git.

## Camada futura de notificação externa

Quando houver SMS, WhatsApp, e-mail, push ou webhook, a criação do alerta não deve depender diretamente desses canais. O desenho sugerido e uma camada separada:

```js
async function dispatchAlertNotification(alert, options = { dryRun: true }) {}
```

Requisitos futuros:

- idempotência por `alertId` e canal;
- retry com backoff;
- fila ou worker separado;
- status de entrega por canal;
- logs com `correlationId`;
- `ALERT_DELIVERY_DRY_RUN=true` em dev/stress;
- falha de notificação externa não pode bloquear a criação do alerta interno.
