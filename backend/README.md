# Backend do Sistema Queda

API REST, bridge MQTT, emissão `Socket.IO` e serviços de persistência para o sistema multi-tenant de monitoramento de quedas.

## Stack

- `Node.js`
- `Express`
- `MySQL` com `mysql2/promise`
- `MQTT.js`
- `Socket.IO`
- `JWT`
- `bcrypt`
- `dotenv`

Ambiente de desenvolvimento recomendado nesta fase:

- `Node.js 20+`

## Estrutura

```text
backend/
  scripts/
    check.js
    devBroker.js
    initDb.js
    migrateEvidenceSchema.js
    mockPublisher.js
    mqttPublishTest.js
    mqttWatch.js
  src/
    config/
    controllers/
    db/
    jobs/
    middlewares/
    mqtt/
    routes/
    services/
    socket/
    utils/
  .env.example
  package.json
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste:

```env
PORT=4000
JWT_SECRET=change-me
LOG_LEVEL=info
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=queda_monitor
MQTT_BROKER_URL=mqtt://127.0.0.1:1883
MQTT_BIND_HOST=0.0.0.0
MQTT_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_CLIENT_ID=queda-backend
MQTT_TOPIC_BASE=queda/devices
MQTT_RECONNECT_PERIOD_MS=4000
MQTT_CONNECT_TIMEOUT_MS=30000
MQTT_KEEPALIVE_SECONDS=60
MQTT_TLS_REJECT_UNAUTHORIZED=true
MQTT_TLS_CA_FILE=
DEVICE_OFFLINE_THRESHOLD_SECONDS=120
```

O ambiente local atual do projeto usa `MYSQL_PASSWORD=` vazio. Se o seu MySQL exigir senha, ajuste `backend/.env` e rode novamente os scripts de banco e start.

### Logs e MQTT/TLS

- `LOG_LEVEL` aceita `error`, `warn`, `info` e `debug`
- `MQTT_BROKER_URL` continua aceitando `mqtt://...` como fluxo padrão atual
- `mqtts://...` agora também pode ser usado de forma opt-in
- `MQTT_TLS_CA_FILE` permite apontar para um arquivo PEM local quando você quiser validar uma CA customizada
- `MQTT_TLS_REJECT_UNAUTHORIZED=true` mantém verificação de certificado quando TLS estiver habilitado

### Broker local de desenvolvimento

`npm run dev:broker` inicia `scripts/devBroker.js` com `Aedes`.

- `MQTT_BIND_HOST=0.0.0.0` faz o broker escutar no IPv4 da LAN do notebook
- `MQTT_PORT=1883` define a porta TCP do broker dev
- `MQTT_BROKER_URL=mqtt://127.0.0.1:1883` evita ambiguidade de `localhost`/IPv6 para o backend local
- no ESP32, use o IPv4 real do notebook como `MQTT_HOST`; nunca use `localhost`

Para validar que o broker respondeu ao protocolo MQTT, e não apenas abriu TCP:

```powershell
npm run mqtt:test -- 127.0.0.1 1883
npm run mqtt:test -- IP_DO_NOTEBOOK 1883
```

O esperado e `MQTT handshake OK`.

Para separar broker, ESP32 e backend durante bancada:

```powershell
npm run mqtt:watch --prefix backend
npm run mqtt:publish:test --prefix backend
```

`mqtt:watch` assina os tópicos reais `queda/devices/+/status`, `queda/devices/+/telemetry` e `queda/devices/+/events`, mostrando timestamp, tópico, tamanho, resumo do payload e erro de JSON quando houver. `mqtt:publish:test` publica um status e uma sequência curta de telemetria válida; use `-- --device esp32_01 --count 10 --interval-ms 1000` para testar o dashboard sem ESP32 real.

Quando o teste simulado funcionar, mas o ESP32 real não alimentar o gráfico, use o Serial Monitor do firmware junto com `mqtt:watch`: o watcher precisa mostrar mensagens novas vindas do `clientId` real do ESP32. Se apenas o publisher de teste aparece, o problema esta antes do backend.

### Identidade MQTT e devices legados

O backend aceita mensagens MQTT com `device_id` e, quando disponível, `device_uid`. Em ambientes antigos ou seeds de demo, o device pode estar cadastrado como `device_uid = legacy:{device_id}` enquanto o firmware real já publica um UID físico do ESP32.

Na ingestão atual, se chegar um `device_uid` real para um `device_id` que já possui um cadastro legado `claimed` com organização, o backend reconcilia esse cadastro para o UID real antes de gravar `status`, `telemetry` ou `events`. Se uma tentativa anterior criou um duplicado técnico sem organização para esse mesmo UID, as telemetrias/eventos/alertas desse duplicado são movidos para o device pareado e o duplicado e removido.

Quando a mensagem chega sem `device_uid`, o backend ainda preserva o fallback legado. Depois da reconciliacao, ele tenta resolver pelo `device_id` apenas se existir exatamente um device pareado com esse identificador, evitando associacao ambígua.

### Concorrencia e idempotência

A ingestão MQTT usa um lock leve em memoria por `device_id` para serializar mensagens simultaneas do mesmo ESP32 dentro de uma instancia Node. Isso reduz corrida entre reconciliacao de identidade, atualização de `device_status`, persistência de telemetria/eventos e emissão realtime. Em uma topologia com multiplas instancias de backend, ainda sera necessário trocar esse lock por coordenacao distribuida ou garantir particionamento por device no consumidor MQTT.

A criação de alertas para eventos de queda/SOS e idempotente sobre o indice unico `alerts.event_id`: se duas rotas tentarem criar o mesmo alerta, o backend reaproveita o registro existente por `LAST_INSERT_ID(id)`.

O Socket.IO usa rooms por escopo (`organization`, `patient` e plataforma global), evitando varrer todos os sockets a cada telemetria. Usuarios com escopo restrito por paciente entram apenas nas rooms de seus pacientes atribuidos.

O schema também possui indices de apoio para leituras recentes de telemetria, eventos por device/tipo, status online stale e filas de alertas por organização/status.

## O que mudou no modelo do backend

O backend deixou de ser global/single-tenant.

Agora ele trabalha com:

- `organizations`
- `organization_members`
- `patients`
- `caregiver_assignments`
- `devices` com `claim_status`, `organization_id` e `current_patient_id`
- `device_assignment_history`
- `device_pairing_sessions`

No cadastro de paciente, o backend agora também persiste:

- `full_name`
- `birth_date`
- `weight_kg`
- `height_cm`

Tambem passaram a carregar escopo:

- `device_status`
- `telemetry_logs`
- `events`
- `alerts`
- `audit_logs`

## Autenticação e escopo

### Register e login

- `POST /api/auth/register` cria um novo usuário, uma nova organização e a membership inicial como `organization_admin`
- `POST /api/auth/login` autentica e devolve usuário com memberships e organização ativa
- `GET /api/me` devolve o contexto autenticado atual

O frontend usa `GET /api/me` no boot para reidratar a sessão salva no navegador e atualizar o shape do usuário quando houve evolução de contrato entre versões. Se o `X-Organization-Id` salvo no navegador não existir mais para o usuário, o frontend descarta apenas essa organização local, tenta `/me` novamente e deixa o backend escolher a primeira membership válida.

Nao existe mais a regra antiga de "primeiro usuário do sistema vira admin global".

### Header de organização ativa

As rotas protegidas usam:

- `Authorization: Bearer <token>`
- `X-Organization-Id: <id>`

O frontend envia `X-Organization-Id` automaticamente a partir da organização selecionada na sidebar.

### Regras de autorizacao

- `platform_admin` pode operar globalmente ou selecionar uma organização especifica
- `organization_admin` gerencia tudo dentro da própria organização
- `caregiver`, `operator` e `viewer` nunca enxergam outra organização
- quando o membro possui caregiver assignments, o backend restringe também ao subconjunto de pacientes atribuidos

Esse filtro acontece no backend, não apenas no frontend.

## Pairing e claim seguro

O backend continua aceitando descoberta técnica por MQTT, mas isso não significa vinculo final.

Fluxo atual:

1. `organization_admin` gera um código temporário em `POST /api/devices/pairing-sessions`
2. o frontend pode consultar `GET /api/system/network-info` para sugerir a URL do backend acessivel pelo ESP32
3. o ESP32 envia `device_uid`, `device_id` e `pairing_code` para `POST /api/pairing/claim`
4. o backend valida:
   - código válido
   - não expirado
   - uso unico
   - organização correta
5. o claim e transacional
6. o backend devolve `deviceSyncToken` e um `patientProfile` resumido para o ESP32
7. o device passa para `claimed`
8. o device fica locked na organização
9. se o pairing session tiver `patient_id`, o backend cria o vinculo inicial com paciente

O ESP32 pode usar esse `deviceSyncToken` depois em `POST /api/pairing/device-profile-sync` para sincronizar novamente o perfil resumido do paciente atual sem transformar o portal local em cadastro clínico.

Devices desconhecidos que chegam via MQTT continuam podendo ser auto-provisionados, mas entram como `unclaimed`.

## Historico de assignment

O backend preserva rastreabilidade com:

- `devices.current_patient_id`
- `devices.current_assignment_history_id`
- `device_assignment_history`

Ao trocar o paciente:

- o assignment anterior e encerrado
- um novo assignment e aberto
- eventos futuros passam a gravar o novo escopo
- eventos antigos continuam pertencendo ao assignment antigo

## Concorrencia e integridade

### Alertas

As acoes `acknowledge`, `cancel` e `resolve` agora usam transacao e lock do alerta para evitar corrida. Quando o estado já mudou, o backend responde com conflito coerente.

### Claim de device

O claim usa transacao e protege:

- código expirado
- código já utilizado
- tentativa de claim em device já locked por outra organização

### Auto-provisionamento

O device técnico e deduplicado por `device_uid` com `UNIQUE KEY`, evitando duplicidade por mensagens MQTT quase simultaneas.

## MQTT e ingestão

Topicos assinados:

- `queda/devices/+/events`
- `queda/devices/+/status`
- `queda/devices/+/telemetry`

Contrato preservado:

- o backend continua ouvindo os mesmos tópicos
- o firmware continua publicando por `device_id`
- o payload agora pode trazer `device_uid` para reforcar a identidade técnica

Nesta rodada, a bridge MQTT também ficou preparada para:

- `mqtt://` sem TLS, como hoje
- `mqtts://` com configuração opt-in por ambiente
- niveis de log mais previsiveis sem introduzir framework de logging pesado
- logs de ingestão para `status` e `telemetry` com tópico recebido, device resolvido, escopo e motivo de descarte quando a mensagem e rejeitada
- `correlationId` por mensagem MQTT, com `durationMs`, `eventId`, `alertId` e motivo de descarte quando aplicavel

Na ingestão:

- devices desconhecidos podem ser criados tecnicamente como `unclaimed`
- `status`, `telemetry` e `events` recebem snapshot do escopo atual do device
- alertas abertos herdam `organization_id` e `patient_id`
- `Socket.IO` também emite em escopo filtrado
- `device_status.last_seen_at` agora usa a hora de recebimento do MQTT no backend, porque receber status/telemetria já prova presença recente do ESP32
- timestamps MQTT em telemetria/eventos só são usados quando parecem Unix time plausível e próximos do recebimento; se o ESP32 estiver sem NTP ou com clock stale, o backend persiste a hora de recebimento para evitar device falsamente stale/offline
- `fall_detected` busca telemetria recente do mesmo device em uma janela de `-10s/+3s`; sem evidência, o evento fica auditavel, mas não cria alerta automático de queda
- `sos_pressed` segue criando alerta sem telemetria, porque e acionamento manual

## Rotas REST principais

Autenticação:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`

Organizacao:

- `GET /api/organization`
- `GET /api/organization/members`
- `POST /api/organization/members`

Pacientes:

- `GET /api/patients`
- `POST /api/patients`
- `GET /api/patients/:id`
- `PUT /api/patients/:id`

Sistema:

- `GET /api/system/network-info`

Devices:

- `GET /api/devices`
- `POST /api/devices`
- `GET /api/devices/:id`
- `PUT /api/devices/:id`
- `DELETE /api/devices/:id`
- `POST /api/devices/pairing-sessions`
- `POST /api/devices/:id/assign-patient`
- `GET /api/devices/:id/events`

Pairing publico para o firmware:

- `POST /api/pairing/claim`
- `POST /api/pairing/device-profile-sync`

Eventos:

- `GET /api/events`
- `GET /api/events/:id`

Alertas:

- `GET /api/alerts`
- `GET /api/alerts/:id`
- `POST /api/alerts/:id/acknowledge`
- `POST /api/alerts/:id/cancel`
- `POST /api/alerts/:id/resolve`

Dashboard:

- `GET /api/dashboard/summary`
- `GET /api/dashboard/recent-alerts`
- `GET /api/dashboard/device-status`

O resumo do dashboard voltou a expor `recentEvents` com contexto de paciente e device no formato esperado pelo frontend atual, preservando o snapshot do escopo gravado no momento da ingestão.

## Banco e seed

O backend espera:

- [database/schema.sql](../database/schema.sql)
- [database/seed.sql](../database/seed.sql)

O seed atual cria:

- organização `Familia Demo`
- `organization_admin` demo `admin@queda.local / Admin@123`
- paciente `Paciente Demo`
- device claimed demo `legacy:esp32_01`
- assignment inicial coerente

Importante:

- a versão atual do schema recria as tabelas do projeto
- `npm run db:init` e `.\scripts\init-db.ps1` devem ser tratados como reset de ambiente nesta migração
- se o backend logar schema desatualizado para evidência, rode `npm run db:migrate:evidence --prefix backend`; esse script e idempotente e não apaga dados

## Scripts do backend

- `npm run dev`: inicia o backend em modo watch
- `npm start`: inicia o backend em modo normal
- `npm run check`: valida sintaxe dos arquivos JS
- `npm test`: roda toda a suite `node:test`
- `npm run test:smoke`: roda checks rapidos e sem dependencias externas
- `npm run test:integration`: roda testes de alertas e MQTT com mocks controlados
- `npm run test:alerts`: valida regras de eventos, criação/transição/escopo de alertas
- `npm run test:mqtt`: valida ingestão MQTT, lock por device e realtime escopado
- `npm run stress:dry`: roda stress dry-run para telemetria, queda/SOS, payloads ruins e concorrência
- `npm run stress:real`: valida backend, broker e MySQL reais antes de publicar MQTT real e consultar persistência
- `npm run stress:alerts`: alias compatível para `stress:dry`
- `npm run stress:cleanup`: lista/remover logs locais de stress quando chamado com `-- --yes`
- `npm run mock:publisher`: publica dados simulados no broker MQTT configurado
- `npm run dev:broker`: sobe um broker MQTT local leve com `Aedes`
- `npm run mqtt:watch`: assina os tópicos reais e imprime mensagens MQTT recebidas no broker
- `npm run mqtt:publish:test`: publica status/telemetria de teste no contrato esperado pelo backend
- `npm run db:init`: aplica schema e seed usando `mysql2` e o `backend/.env`
- `npm run db:migrate:evidence`: aplica colunas/tabela de evidência sem resetar dados existentes
- `npm run db:migrate:sensor-diagnostics`: aplica colunas de diagnóstico do sensor em `device_status` sem resetar dados existentes

O smoke test da raiz passou a validar também `GET /api/organization` e `GET /api/patients`, usando o `activeOrganizationId` retornado no login para montar o header `X-Organization-Id`.

Os relatórios de stress ficam em:

```text
backend/logs/stress/stress-<runId>.jsonl
backend/logs/stress/summary-<runId>.json
backend/logs/stress/failures-<runId>.json
backend/logs/stress/report-<runId>.md
```

O JSONL e voltado a máquina; o Markdown `report-*.md` resume resultado, MQTT, telemetria, quedas/alertas, falhas e recomendações para leitura humana. Eles são artefatos locais e ficam ignorados pelo Git. O fluxo detalhado de alertas esta em [docs/alerting-architecture.md](../docs/alerting-architecture.md).

## Tempo real

Eventos emitidos:

- `alert:new`
- `alert:updated`
- `device:status`
- `telemetry:new`

O socket também recebe contexto de organização no handshake, e o backend filtra emissão por organização e paciente.

## Observacoes e limitações

- o broker dev serve apenas para desenvolvimento e demonstração local
- o fluxo de pairing depende de o backend estar acessivel ao ESP32 pela rede
- o portal local/AP do ESP32 continua sendo um fluxo do firmware; nesta rodada o backend não precisou de alteracao de contrato para os testes de bancada
- quando a depuração embarcada no Windows prender a serial, prefira liberar a porta com `.\scripts\free-serial-port.ps1 -Port COM4` antes de atribuir o problema ao backend
- o ambiente atual continua operando por padrão com `mqtt://` sem TLS, embora `mqtts://` já esteja preparado de forma opt-in
- ainda não existe fluxo completo de unpair cross-tenant pela UI
- a restricao por caregiver assignment hoje entra em acao quando existem assignments explícitos para aquele membro; sem eles, o membro continua vendo a organização ativa inteira

## Como rodar isoladamente

```bash
cd backend
npm install
npm run dev
```

Para o fluxo completo no Windows, prefira os scripts da raiz e o guia [docs/quickstart-windows.md](../docs/quickstart-windows.md).
