# Integracao Firmware, Backend e Frontend

Este documento descreve o contrato MQTT real do projeto, o fluxo de pairing por codigo temporario e como os dados percorrem firmware, backend, banco e frontend no modelo multi-tenant atual.

Para hardware, pinagem e calibracao do detector, consulte [firmware-hardware.md](firmware-hardware.md). Para setup geral do projeto, consulte o [README da raiz](../README.md). Para o passo a passo operacional no Windows, consulte [quickstart-windows.md](quickstart-windows.md).

## O que mudou na integracao

O sistema preservou o contrato MQTT, mas mudou o modelo de ownership do device.

Hoje existem duas camadas:

- descoberta tecnica do hardware
- claim definitivo dentro de uma organizacao

Em outras palavras:

- um device desconhecido que chega por MQTT pode ser criado tecnicamente
- ele entra como `unclaimed`
- somente o fluxo de pairing por codigo temporario o transforma em device de fato pertencente a uma organizacao

## Identidade do dispositivo

O projeto agora trabalha com duas identidades complementares:

- `device_id`: identificador operacional usado nos topicos MQTT, configuravel no portal do ESP32
- `device_uid`: identidade tecnica estavel do hardware, derivada do ESP32

Regra atual:

- o backend prefere `payload.device_uid` quando ele existe
- se ele nao vier, faz fallback para `legacy:{device_id}`

Isso preserva compatibilidade com devices antigos e permite evoluir para um claim mais seguro.

## Topicos MQTT reais

Base configurada no backend:

- `MQTT_TOPIC_BASE=queda/devices`

Topicos assinados:

- `queda/devices/+/events`
- `queda/devices/+/status`
- `queda/devices/+/telemetry`

Topicos publicados hoje pelo firmware:

- `queda/devices/{deviceId}/events`
- `queda/devices/{deviceId}/status`
- `queda/devices/{deviceId}/telemetry`

Observacoes importantes:

- o contrato MQTT foi preservado
- os topicos continuam sendo montados a partir de `device_id`
- o backend continua conseguindo trabalhar com o mock publisher e com devices antigos
- backend e firmware foram preparados para `MQTT/TLS` de forma opt-in, sem mudar o fluxo padrao atual com `mqtt://`

## Payloads reais do firmware

Os payloads continuam em `JSON` com `snake_case`, mas agora incluem `device_uid`.

### `events`

Exemplo de `fall_detected`:

```json
{
  "device_uid": "esp32-a1b2c3d4e5f6",
  "device_id": "esp32_01",
  "event_type": "fall_detected",
  "timestamp": 1760000000,
  "accel_magnitude": 3.74,
  "gyro_magnitude": 182.5,
  "immobility_confirmed": true,
  "battery_level": 100
}
```

### `status`

```json
{
  "device_uid": "esp32-a1b2c3d4e5f6",
  "device_id": "esp32_01",
  "event_type": "device_status",
  "timestamp": 1760000000,
  "accel_magnitude": 1.01,
  "gyro_magnitude": 8.4,
  "immobility_confirmed": false,
  "battery_level": 100,
  "wifi_rssi": -58,
  "buffered_events": 0
}
```

### `telemetry`

```json
{
  "device_uid": "esp32-a1b2c3d4e5f6",
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

## Pairing por codigo temporario

O pairing nao acontece via MQTT. Ele acontece por HTTP entre o portal do ESP32 e o backend.

### Fluxo atual

1. o `organization_admin` abre a tela de devices
2. o frontend chama `POST /api/devices/pairing-sessions`
3. o frontend consulta `GET /api/system/network-info` para sugerir a melhor URL local do backend na rede atual
4. o modal destaca uma `primaryBackendApiBaseUrl`, mostra expiracao do codigo e deixa as demais URLs em fallback opcional
5. o usuario abre o portal local do ESP32
6. informa `BACKEND_API_BASE_URL` e o codigo manualmente no portal local
7. o ESP32 chama `POST /api/pairing/claim`
8. o backend valida o codigo, classifica erros de invalido/expirado/ja usado e faz o claim transacional
9. o backend devolve `deviceSyncToken` e um `patientProfile` resumido
10. o device passa para `claimed` e fica locked na organizacao
11. se o pairing session tiver um `patient_id`, o backend cria tambem o assignment inicial

### Endpoint usado pelo ESP32

- `POST /api/pairing/claim`
- `POST /api/pairing/device-profile-sync`

Payload esperado:

```json
{
  "device_uid": "esp32-a1b2c3d4e5f6",
  "device_id": "esp32_01",
  "device_name": "esp32_01",
  "pairing_code": "ABC123"
}
```

Resposta relevante do claim:

```json
{
  "deviceSyncToken": "token-hex-gerado-no-claim",
  "patientProfile": {
    "patientName": "Paciente Demo",
    "weightKg": 72.5,
    "heightCm": 168,
    "fallSensitivityPreset": null,
    "syncedAt": "2026-04-10T00:00:00.000Z"
  }
}
```

O `deviceSyncToken` nao substitui o pairing code. Ele serve para sincronizacoes futuras do perfil resumido do paciente, sem deixar o backend depender apenas de `device_uid`.

### Endpoint de rede local para o dashboard

- `GET /api/system/network-info`

Resposta esperada:

```json
{
  "suggestedBackendApiBaseUrl": "http://192.168.0.15:4000",
  "primaryBackendApiBaseUrl": "http://192.168.0.15:4000",
  "fallbackBackendApiBaseUrls": [
    "http://10.0.0.8:4000"
  ],
  "candidateBackendApiBaseUrls": [
    "http://192.168.0.15:4000",
    "http://10.0.0.8:4000"
  ]
}
```

Esse endpoint ignora loopback, prioriza interfaces reais da rede atual e ajuda o frontend a destacar uma URL principal confiavel para o ESP32, mantendo fallbacks apenas quando fizer sentido.

### Sincronizacao resumida do paciente para o ESP32

Depois do claim, e tambem em sincronizacoes posteriores, o ESP32 pode chamar:

- `POST /api/pairing/device-profile-sync`

Payload:

```json
{
  "device_uid": "esp32-a1b2c3d4e5f6",
  "device_id": "esp32_01",
  "device_sync_token": "token-hex-gerado-no-claim"
}
```

Resposta:

```json
{
  "patientProfile": {
    "patientName": "Paciente Demo",
    "weightKg": 72.5,
    "heightCm": 168,
    "fallSensitivityPreset": null,
    "syncedAt": "2026-04-10T00:00:00.000Z"
  }
}
```

O backend continua sendo a fonte da verdade. O ESP32 recebe apenas uma copia resumida e local.

## Auto-provisionamento tecnico

O auto-provisionamento continua existindo, mas agora com comportamento mais seguro.

Se o backend receber um `device_uid` novo via MQTT:

1. ele cria um registro tecnico em `devices`
2. o registro entra como `unclaimed`
3. o device ainda nao pertence definitivamente a nenhuma organizacao
4. o claim oficial precisa acontecer depois pelo fluxo de pairing

Isso evita que qualquer device novo vire automaticamente dono de dados sensiveis de uma familia ou clinica.

## Persistencia do escopo no momento da ingestao

Ao ingerir novos dados, o backend passa a gravar o escopo vigente do device:

- `organization_id`
- `patient_id`
- `device_assignment_history_id`

Isso acontece em:

- `device_status`
- `telemetry_logs`
- `events`
- `alerts`

Consequencia pratica:

- se um device mudar de paciente no futuro, o historico antigo continua atribuido ao paciente e assignment corretos da epoca

## Como o backend filtra acesso

O backend nao depende de esconder dados no frontend.

Rotas protegidas usam:

- `Authorization: Bearer <token>`
- `X-Organization-Id: <id>`

Regras atuais:

- `platform_admin` pode operar globalmente ou escolher uma organizacao
- `organization_admin` enxerga toda a organizacao ativa
- `caregiver`, `operator` e `viewer` nunca enxergam outra organizacao
- quando existem caregiver assignments para o membro, o backend restringe tambem ao conjunto de pacientes atribuidos

Isso vale para:

- `devices`
- `events`
- `alerts`
- `telemetry`
- `dashboard`
- `device detail`
- `patients`
- `organization members`

## Boot da sessao no frontend

Na inicializacao da interface web:

1. o frontend le token e organizacao ativa do `localStorage`
2. reidrata o usuario com `GET /api/me`
3. normaliza memberships e organizacao ativa antes de abrir as rotas protegidas
4. passa a enviar `X-Organization-Id` e `organizationId` do socket com base nesse contexto atualizado

Isso reduz quebra por sessao antiga salva no navegador depois de mudancas de contrato no backend.

## Dashboard e tempo real

O dashboard deixou de somar tudo globalmente.

Hoje ele soma apenas:

- a organizacao ativa do usuario
- e, quando houver caregiver assignments, o subconjunto permitido para aquele membro

O mesmo principio vale para `Socket.IO`:

- o socket recebe token e `organizationId`
- o backend emite `alert:new`, `alert:updated`, `device:status` e `telemetry:new` apenas para conexoes autorizadas naquele escopo

No resumo atual do dashboard:

- `recentEvents` volta a incluir `patient`, `device`, `assignmentHistoryId`, `intensity` e `immobility`
- isso permite ao frontend exibir o contexto clinico correto sem refazer lookup adicional para cada card

## Conflitos e concorrencia

### Alertas

As operacoes `acknowledge`, `cancel` e `resolve` agora protegem concorrencia no backend. Quando dois operadores tentam mudar o mesmo alerta ao mesmo tempo, apenas uma transicao valida persiste e a outra recebe conflito coerente.

### Claim de device

O claim por codigo tambem e transacional e protege:

- codigo expirado
- codigo ja usado
- device ja claimed por outra organizacao

## Diferenca entre firmware real e mock publisher

O mock continua util para demo, mas nao e identico ao firmware real.

Hoje:

- ele publica `device_uid = legacy:{deviceId}`
- pode enviar alguns campos extras como `message` e `firmware_version`
- continua preservando o contrato base de `events`, `status` e `telemetry`

Essas diferencas nao quebram a integracao atual, mas precisam ser lembradas em demonstracoes.

## Automacao local e smoke test

O smoke test do Windows tambem foi alinhado ao modelo multi-tenant atual.

Fluxo:

1. faz login
2. le `activeOrganizationId` devolvido pelo backend
3. envia `X-Organization-Id` nas chamadas protegidas
4. valida `organization`, `patients`, `dashboard`, `devices` e `alerts`

Isso ajuda a pegar regressao real de escopo, em vez de apenas confirmar que o backend subiu.

## Observacoes operacionais importantes

- `telemetry` continua fora do `EventBuffer` do firmware
- `battery_level` do firmware real ainda e placeholder
- o firmware so considera o device realmente saudavel quando `Wi-Fi + MQTT` estao simultaneamente ok
- eventos criticos pendentes agora contam com um snapshot pequeno em `NVS`, reduzindo perda apos reboot rapido
- o AP de setup `Queda-Setup-*` nao fica sempre ativo; ele aparece apenas em `SETUP_MODE` ou quando `FORCE_SETUP_MODE_ON_BOOT = true`
- para depuracao local no Windows, a porta serial tambem pode ser liberada com `.\scripts\free-serial-port.ps1 -Port COM4` quando um monitor `PlatformIO` antigo ficar preso
- o fluxo de upload do firmware na placa atual pode ainda exigir `BOOT` manual durante o `Connecting...`; isso nao altera o contrato MQTT nem o backend
- o pairing depende de o backend estar acessivel ao ESP32 pela rede atual
- `localhost` nunca deve ser usado dentro do portal do ESP32 para broker MQTT ou backend API

## Limitacoes abertas

- o fluxo padrao do projeto continua usando `mqtt://` sem TLS, embora a base para `mqtts://` ja exista de forma opt-in
- nao existe ainda fluxo completo de unpair entre organizacoes pela UI
- o portal do ESP32 salva `BACKEND_API_BASE_URL`, mas nao faz autenticacao local propria
- se um caregiver nao tiver assignments explicitos, o backend hoje ainda devolve a organizacao ativa inteira para ele
