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
- em debug de conectividade, o firmware imprime topicos efetivos, host/porta MQTT e clientId sem expor senha

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

O campo `timestamp` deve ser Unix time em segundos quando o NTP ja sincronizou. Se o firmware ainda estiver no fallback monotônico de boot (`millis()/1000`), o backend considera o valor implausivel e usa a hora de recebimento para `lastSeenAt`, `event_time` e `created_at`.

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
  "roll_deg": 2.7,
  "battery_level": 100,
  "wifi_rssi": -58
}
```

## Status interpretado experimental

O backend agora deriva um status comportamental/postural inicial a partir da telemetria mais recente do device, sem alterar o contrato MQTT original.

Principios atuais:

- feature experimental e pre-calibracao
- sem diagnostico clinico
- prioridade para estados mais honestos quando a confianca estiver baixa
- preparada para evoluir no futuro sem quebrar o payload base

Estados implementados nesta versao:

- `pre_calibracao`
- `desconhecido`
- `em_reposo`
- `deitado`
- `sentado`
- `em_movimento`
- `queda_suspeita`
- `queda_confirmada`

Estados reservados para evolucao futura:

- `andando`
- `correndo`
- `caido`

Cada snapshot de device agora pode carregar um bloco derivado como:

```json
{
  "behavior": {
    "state": "em_reposo",
    "confidence": "medio",
    "reason": "Telemetria recente sugere repouso estavel, ainda sem postura especifica forte.",
    "experimental": true,
    "version": "heuristic_v1",
    "source": "telemetry_window",
    "updatedAt": "2026-04-21T20:10:00.000Z",
    "telemetrySampleCount": 6,
    "telemetryWindowSeconds": 25,
    "plannedFutureStates": ["andando", "correndo", "caido"]
  }
}
```

Heuristica atual, em alto nivel:

- sem telemetria suficiente ou conexao muito recente: `pre_calibracao`
- telemetria stale ou insuficiente: `desconhecido`
- baixa movimentacao: `em_reposo`
- baixa movimentacao + orientacao horizontal estavel: `deitado`
- baixa movimentacao + orientacao inclinada estavel: `sentado`
- variacao acima do repouso: `em_movimento`
- `fall_detected` recente: `queda_suspeita` ou `queda_confirmada`

O frontend usa esse bloco para mostrar o estado atual no dashboard, na lista de devices e na pagina de detalhe, sempre como heuristica experimental.

## Realtime do painel x MQTT do device

Nesta baseline, o frontend passou a separar melhor tres camadas diferentes:

- socket do navegador com o backend (`Socket.IO`)
- ultimo snapshot conhecido do device no backend
- presenca recente de status/telemetria MQTT do ESP32

Regras praticas:

- `socket do painel desconectado` significa apenas que o navegador perdeu o canal realtime
- `device offline` continua significando ausencia recente de `status`/`telemetry` MQTT no backend
- o frontend agora recebe `telemetry:new` com `deviceBehavior` e `deviceStatusPatch`, o que permite atualizar `lastSeenAt`, bateria, RSSI e a heuristica local sem refetch completo a cada amostra
- a pagina de detalhe do device tambem faz um refresh HTTP leve a cada 10s como fallback, para cobrir perda de evento realtime durante reload, troca de sessao ou reconexao do socket

## Identidade do device MQTT

O firmware pode publicar `device_id` como identificador humano/tecnico curto, por exemplo `esp32_01`, e `device_uid` como identidade fisica real do chip. Em bases antigas ou seeds de demo, alguns devices podem existir como `device_uid = legacy:{device_id}`.

Na ingestao MQTT atual, quando chega uma mensagem com `device_uid` real e o backend encontra um cadastro legado `legacy:{device_id}` ja `claimed` e com organizacao, ele reconcilia o cadastro para o UID real antes de persistir status/telemetria. Se uma tentativa anterior ja tiver criado um duplicado tecnico sem organizacao para esse UID real, o backend move telemetrias, eventos e alertas desse duplicado para o device pareado e remove o duplicado.

Isso evita o caso em que o broker recebe telemetria corretamente, mas o dashboard da organizacao continua stale porque o payload foi associado a um device sem tenant. Se a mensagem MQTT chegar sem `device_uid` depois da reconciliacao, o backend tenta associar por `device_id` apenas quando houver exatamente um cadastro pareado com aquele identificador.

Isso reduz a chance de interpretar uma falha do navegador como se o ESP32 tivesse realmente caido.

### Concorrencia no realtime/MQTT

Nesta baseline, mensagens MQTT do mesmo `device_id` sao serializadas por um lock leve em memoria dentro da instancia Node. O objetivo e impedir que dois pacotes simultaneos do mesmo ESP32 tentem reconciliar identidade, atualizar status e emitir realtime em ordem conflitante.

O lock e local ao processo. Ele cobre o ambiente atual de desenvolvimento e instancia unica; se o backend for escalado horizontalmente, a garantia precisa migrar para um lock distribuido, uma fila particionada por device ou outro mecanismo equivalente.

A entrega Socket.IO deixou de iterar todos os sockets conectados a cada evento. Cada conexao entra em rooms de organizacao, paciente ou plataforma global conforme o contexto de acesso, e `emitScopedEvent` publica diretamente nessas rooms.

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

No portal local do ESP32, a rodada atual tambem adicionou um bloco de saude operacional com:

- `Wi-Fi conectado`
- `MQTT OK`
- `Backend API`
- `Pronto para operar`

Com `SETUP_PORTAL_ALWAYS_ON = true`, o portal tambem pode ficar em modo de manutencao paralelo: o AP `Q-ESP32-*` permanece visivel, mas Wi-Fi station, MQTT, sensor, status/eventos e telemetria continuam no loop normal. Em `SETUP_MODE`, o portal continua sendo fallback/configuracao e o operador pode usar `Testar backend` e `Testar MQTT` para validar a configuracao antes de reiniciar o ESP32.

### Broker MQTT local no Windows

O broker local de desenvolvimento fica em `backend/scripts/devBroker.js` e usa `Aedes`. Para bancada com ESP32 fisico, ele deve aceitar conexao pelo IPv4 da LAN do notebook:

```env
MQTT_BIND_HOST=0.0.0.0
MQTT_PORT=1883
```

Para descobrir quem esta usando a porta:

```powershell
netstat -ano | findstr :1883
Get-CimInstance Win32_Process -Filter "ProcessId = PID_AQUI" | Select-Object ProcessId,CommandLine
```

Para validar o acesso esperado pelo ESP32:

```powershell
Test-NetConnection IP_DO_NOTEBOOK -Port 1883
```

O esperado e `TcpTestSucceeded : True`.

Esse teste valida apenas abertura de porta TCP. Para confirmar o protocolo MQTT, rode um cliente e aguarde `CONNACK`:

```powershell
cd backend
npm run mqtt:test -- 127.0.0.1 1883
npm run mqtt:test -- IP_DO_NOTEBOOK 1883
```

O esperado e `MQTT handshake OK`. Para o backend local, prefira `MQTT_BROKER_URL=mqtt://127.0.0.1:1883`; para o ESP32, use o IPv4 real do notebook.

`localhost`, `127.0.0.1` e `::1` apontam para o proprio computador e nao servem como `MQTT_HOST` no ESP32. Mesmo com o broker em `0.0.0.0:1883`, firewall local ou isolamento de clientes em rede institucional ainda podem impedir a conexao.

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
3. se a organizacao salva nao for mais valida para o usuario, remove apenas esse ID local e tenta `/me` novamente
4. normaliza memberships e organizacao ativa antes de abrir as rotas protegidas
5. cria o Socket.IO somente depois que token, usuario e organizacao ativa estao minimamente hidratados
6. passa a enviar `X-Organization-Id` e `organizationId` do socket com base nesse contexto atualizado

Isso reduz quebra por F5/refresh e por sessao antiga salva no navegador depois de mudancas de contrato no backend.

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
- o AP curto `Q-ESP32-*` pode ficar sempre ativo em bancada com `SETUP_PORTAL_ALWAYS_ON = true`; com a flag desligada, aparece apenas em `SETUP_MODE` ou quando `FORCE_SETUP_MODE_ON_BOOT = true`
- para depuracao local no Windows, a porta serial tambem pode ser liberada com `.\scripts\free-serial-port.ps1 -Port COM4` quando um monitor `PlatformIO` antigo ficar preso
- o fluxo de upload do firmware na placa atual pode ainda exigir `BOOT` manual durante o `Connecting...`; isso nao altera o contrato MQTT nem o backend
- o pairing depende de o backend estar acessivel ao ESP32 pela rede atual
- `localhost` nunca deve ser usado dentro do portal do ESP32 para broker MQTT ou backend API

## Limitacoes abertas

- o fluxo padrao do projeto continua usando `mqtt://` sem TLS, embora a base para `mqtts://` ja exista de forma opt-in
- nao existe ainda fluxo completo de unpair entre organizacoes pela UI
- o portal do ESP32 salva `BACKEND_API_BASE_URL`, mas nao faz autenticacao local propria
- se um caregiver nao tiver assignments explicitos, o backend hoje ainda devolve a organizacao ativa inteira para ele
