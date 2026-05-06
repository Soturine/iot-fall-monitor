# Backend do Sistema Queda

API REST, bridge MQTT, emissao `Socket.IO` e servicos de persistencia para o sistema multi-tenant de monitoramento de quedas.

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
    mockPublisher.js
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

## Variaveis de ambiente

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
- `MQTT_BROKER_URL` continua aceitando `mqtt://...` como fluxo padrao atual
- `mqtts://...` agora tambem pode ser usado de forma opt-in
- `MQTT_TLS_CA_FILE` permite apontar para um arquivo PEM local quando voce quiser validar uma CA customizada
- `MQTT_TLS_REJECT_UNAUTHORIZED=true` mantem verificacao de certificado quando TLS estiver habilitado

### Broker local de desenvolvimento

`npm run dev:broker` inicia `scripts/devBroker.js` com `Aedes`.

- `MQTT_BIND_HOST=0.0.0.0` faz o broker escutar no IPv4 da LAN do notebook
- `MQTT_PORT=1883` define a porta TCP do broker dev
- `MQTT_BROKER_URL=mqtt://127.0.0.1:1883` evita ambiguidade de `localhost`/IPv6 para o backend local
- no ESP32, use o IPv4 real do notebook como `MQTT_HOST`; nunca use `localhost`

Para validar que o broker respondeu ao protocolo MQTT, e nao apenas abriu TCP:

```powershell
npm run mqtt:test -- 127.0.0.1 1883
npm run mqtt:test -- IP_DO_NOTEBOOK 1883
```

O esperado e `MQTT handshake OK`.

### Identidade MQTT e devices legados

O backend aceita mensagens MQTT com `device_id` e, quando disponivel, `device_uid`. Em ambientes antigos ou seeds de demo, o device pode estar cadastrado como `device_uid = legacy:{device_id}` enquanto o firmware real ja publica um UID fisico do ESP32.

Na ingestao atual, se chegar um `device_uid` real para um `device_id` que ja possui um cadastro legado `claimed` com organizacao, o backend reconcilia esse cadastro para o UID real antes de gravar `status`, `telemetry` ou `events`. Se uma tentativa anterior criou um duplicado tecnico sem organizacao para esse mesmo UID, as telemetrias/eventos/alertas desse duplicado sao movidos para o device pareado e o duplicado e removido.

Quando a mensagem chega sem `device_uid`, o backend ainda preserva o fallback legado. Depois da reconciliacao, ele tenta resolver pelo `device_id` apenas se existir exatamente um device pareado com esse identificador, evitando associacao ambigua.

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

No cadastro de paciente, o backend agora tambem persiste:

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

## Autenticacao e escopo

### Register e login

- `POST /api/auth/register` cria um novo usuario, uma nova organizacao e a membership inicial como `organization_admin`
- `POST /api/auth/login` autentica e devolve usuario com memberships e organizacao ativa
- `GET /api/me` devolve o contexto autenticado atual

O frontend usa `GET /api/me` no boot para reidratar a sessao salva no navegador e atualizar o shape do usuario quando houve evolucao de contrato entre versoes. Se o `X-Organization-Id` salvo no navegador nao existir mais para o usuario, o frontend descarta apenas essa organizacao local, tenta `/me` novamente e deixa o backend escolher a primeira membership valida.

Nao existe mais a regra antiga de "primeiro usuario do sistema vira admin global".

### Header de organizacao ativa

As rotas protegidas usam:

- `Authorization: Bearer <token>`
- `X-Organization-Id: <id>`

O frontend envia `X-Organization-Id` automaticamente a partir da organizacao selecionada na sidebar.

### Regras de autorizacao

- `platform_admin` pode operar globalmente ou selecionar uma organizacao especifica
- `organization_admin` gerencia tudo dentro da propria organizacao
- `caregiver`, `operator` e `viewer` nunca enxergam outra organizacao
- quando o membro possui caregiver assignments, o backend restringe tambem ao subconjunto de pacientes atribuidos

Esse filtro acontece no backend, nao apenas no frontend.

## Pairing e claim seguro

O backend continua aceitando descoberta tecnica por MQTT, mas isso nao significa vinculo final.

Fluxo atual:

1. `organization_admin` gera um codigo temporario em `POST /api/devices/pairing-sessions`
2. o frontend pode consultar `GET /api/system/network-info` para sugerir a URL do backend acessivel pelo ESP32
3. o ESP32 envia `device_uid`, `device_id` e `pairing_code` para `POST /api/pairing/claim`
4. o backend valida:
   - codigo valido
   - nao expirado
   - uso unico
   - organizacao correta
5. o claim e transacional
6. o backend devolve `deviceSyncToken` e um `patientProfile` resumido para o ESP32
7. o device passa para `claimed`
8. o device fica locked na organizacao
9. se o pairing session tiver `patient_id`, o backend cria o vinculo inicial com paciente

O ESP32 pode usar esse `deviceSyncToken` depois em `POST /api/pairing/device-profile-sync` para sincronizar novamente o perfil resumido do paciente atual sem transformar o portal local em cadastro clinico.

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

As acoes `acknowledge`, `cancel` e `resolve` agora usam transacao e lock do alerta para evitar corrida. Quando o estado ja mudou, o backend responde com conflito coerente.

### Claim de device

O claim usa transacao e protege:

- codigo expirado
- codigo ja utilizado
- tentativa de claim em device ja locked por outra organizacao

### Auto-provisionamento

O device tecnico e deduplicado por `device_uid` com `UNIQUE KEY`, evitando duplicidade por mensagens MQTT quase simultaneas.

## MQTT e ingestao

Topicos assinados:

- `queda/devices/+/events`
- `queda/devices/+/status`
- `queda/devices/+/telemetry`

Contrato preservado:

- o backend continua ouvindo os mesmos topicos
- o firmware continua publicando por `device_id`
- o payload agora pode trazer `device_uid` para reforcar a identidade tecnica

Nesta rodada, a bridge MQTT tambem ficou preparada para:

- `mqtt://` sem TLS, como hoje
- `mqtts://` com configuracao opt-in por ambiente
- niveis de log mais previsiveis sem introduzir framework de logging pesado
- logs de ingestao para `status` e `telemetry` com topico recebido, device resolvido, escopo e motivo de descarte quando a mensagem e rejeitada

Na ingestao:

- devices desconhecidos podem ser criados tecnicamente como `unclaimed`
- `status`, `telemetry` e `events` recebem snapshot do escopo atual do device
- alertas abertos herdam `organization_id` e `patient_id`
- `Socket.IO` tambem emite em escopo filtrado
- timestamps MQTT so sao usados quando parecem Unix time plausivel; se o ESP32 ainda estiver sem NTP e enviar `millis()/1000`, o backend persiste a hora de recebimento para evitar device falsamente stale/offline

## Rotas REST principais

Autenticacao:

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

O resumo do dashboard voltou a expor `recentEvents` com contexto de paciente e device no formato esperado pelo frontend atual, preservando o snapshot do escopo gravado no momento da ingestao.

## Banco e seed

O backend espera:

- [database/schema.sql](../database/schema.sql)
- [database/seed.sql](../database/seed.sql)

O seed atual cria:

- organizacao `Familia Demo`
- `organization_admin` demo `admin@queda.local / Admin@123`
- paciente `Paciente Demo`
- device claimed demo `legacy:esp32_01`
- assignment inicial coerente

Importante:

- a versao atual do schema recria as tabelas do projeto
- `npm run db:init` e `.\scripts\init-db.ps1` devem ser tratados como reset de ambiente nesta migracao

## Scripts do backend

- `npm run dev`: inicia o backend em modo watch
- `npm start`: inicia o backend em modo normal
- `npm run check`: valida sintaxe dos arquivos JS
- `npm run mock:publisher`: publica dados simulados no broker MQTT configurado
- `npm run dev:broker`: sobe um broker MQTT local leve com `Aedes`
- `npm run db:init`: aplica schema e seed usando `mysql2` e o `backend/.env`

O smoke test da raiz passou a validar tambem `GET /api/organization` e `GET /api/patients`, usando o `activeOrganizationId` retornado no login para montar o header `X-Organization-Id`.

## Tempo real

Eventos emitidos:

- `alert:new`
- `alert:updated`
- `device:status`
- `telemetry:new`

O socket tambem recebe contexto de organizacao no handshake, e o backend filtra emissao por organizacao e paciente.

## Observacoes e limitacoes

- o broker dev serve apenas para desenvolvimento e demonstracao local
- o fluxo de pairing depende de o backend estar acessivel ao ESP32 pela rede
- o portal local/AP do ESP32 continua sendo um fluxo do firmware; nesta rodada o backend nao precisou de alteracao de contrato para os testes de bancada
- quando a depuracao embarcada no Windows prender a serial, prefira liberar a porta com `.\scripts\free-serial-port.ps1 -Port COM4` antes de atribuir o problema ao backend
- o ambiente atual continua operando por padrao com `mqtt://` sem TLS, embora `mqtts://` ja esteja preparado de forma opt-in
- ainda nao existe fluxo completo de unpair cross-tenant pela UI
- a restricao por caregiver assignment hoje entra em acao quando existem assignments explicitos para aquele membro; sem eles, o membro continua vendo a organizacao ativa inteira

## Como rodar isoladamente

```bash
cd backend
npm install
npm run dev
```

Para o fluxo completo no Windows, prefira os scripts da raiz e o guia [docs/quickstart-windows.md](../docs/quickstart-windows.md).
