# Sistema IoT de Detecção de Quedas com ESP32

Projeto acadêmico full-stack para monitoramento de quedas, imobilidade e telemetria com firmware `ESP32 + MPU6050`, comunicação `MQTT`, backend `Node.js + Express + MySQL + Socket.IO` e frontend `React + Vite + TypeScript + Tailwind CSS`.

O objetivo do repositório é integrar hardware embarcado, ingestão de eventos, persistência, atualização em tempo real e uma interface web multi-tenant para acompanhamento operacional de pacientes, dispositivos e alertas.

## Baseline Atual

Baseline atual do repositório: `v0.8.12`.

A baseline `v0.8.12` mantém o portal/AP de manutenção do ESP32 ativo em paralelo ao fluxo normal de Wi-Fi/MQTT durante desenvolvimento, corrige timestamps MQTT implausíveis antes de persistir telemetria, estabiliza a hidratação de sessão após F5 e deixa o buzzer conservador por padrão.

Para a experiência local prevista nesta fase, o projeto está estabilizado para `Node.js 20+`.

## Visão Geral

O projeto é composto por:

- firmware para `ESP32`, com leitura do sensor `MPU6050`
- comunicação MQTT entre dispositivo e backend
- backend `Node.js` com `Express`, API REST, bridge MQTT e emissão `Socket.IO`
- banco de dados `MySQL`
- frontend web em `React`, `Vite`, `TypeScript` e `Tailwind CSS`
- portal local de configuração do ESP32
- dashboard multi-tenant por organização

O modelo atual deixou de ser um painel global único e passou a trabalhar com organizações, membros, pacientes, dispositivos, vínculos e histórico de assignments. O backend preserva o contrato MQTT existente, mas passa a persistir o escopo de `organization_id`, `patient_id` e `device_assignment_history_id` no momento da ingestão para manter rastreabilidade.

## Principais Funcionalidades

- pareamento seguro por código temporário
- cadastro, descoberta técnica e reivindicação (`claim`) de dispositivos
- vínculo de dispositivo com paciente
- histórico de vínculos entre dispositivo e paciente
- dashboard multi-tenant por organização
- controle de acesso por papel e organização ativa
- ingestão MQTT de eventos, status e telemetria
- alertas de queda e imobilidade
- telemetria em tempo real no dashboard
- atualização do navegador via `Socket.IO`
- portal local do ESP32 para Wi-Fi, MQTT, backend e pareamento
- opção de AP/portal de manutenção sempre ativo em bancada, sem bloquear telemetria MQTT
- bloco de saúde operacional no portal do ESP32 com testes de backend e MQTT
- diagnóstico de realtime/socket no frontend
- separação entre saúde do socket do navegador e saúde operacional do dispositivo
- status comportamental/postural heurístico experimental
- suporte a buzzer e modo opcional de teste de movimento em bancada
- scripts Windows para setup, banco, start, stop e smoke test

## Arquitetura

```text
ESP32 + MPU6050
      |
      | MQTT
      v
Broker MQTT
      |
      v
Backend Node.js + Express + Socket.IO
      |
      v
MySQL
      |
      v
Frontend React + Vite
```

### Camadas

- **Firmware ESP32:** lê o `MPU6050`, executa a detecção local, publica `events`, `status` e `telemetry`, mantém configurações em `NVS` e oferece portal local de configuração.
- **Broker MQTT:** transporta mensagens do ESP32 para o backend nos tópicos `queda/devices/{deviceId}/events`, `status` e `telemetry`.
- **Backend API REST:** autentica usuários, aplica escopo multi-tenant, gerencia pacientes, dispositivos, pareamento, alertas e ingestão.
- **Banco MySQL:** armazena organizações, membros, pacientes, dispositivos, histórico de vínculos, eventos, alertas, status e telemetria.
- **Socket.IO:** entrega atualizações do backend para o navegador em tempo real.
- **Frontend Web:** oferece dashboard operacional, telas de pacientes, dispositivos, alertas, organização, pareamento e detalhe de dispositivo.

## Estrutura de Pastas

```text
/
  backend/     API REST, bridge MQTT, Socket.IO, scripts de backend e .env.example
  frontend/    aplicação React/Vite, telas web, serviços, tipos e .env.example
  src/         firmware do ESP32 em C++/Arduino
  include/     headers, constantes, modelos e configuração do firmware
  database/    schema.sql e seed.sql do MySQL
  docs/        documentação complementar de integração, firmware, quickstart e regras
  scripts/     automações PowerShell e auxiliares de desenvolvimento
  test/        estrutura reservada para testes do PlatformIO
```

Arquivos principais na raiz:

- [CHANGELOG.md](CHANGELOG.md)
- [LICENSE](LICENSE)
- [package.json](package.json)
- [platformio.ini](platformio.ini)

## Requisitos

- `Node.js 20+`
- `npm`
- `MySQL Server` ou acesso a um servidor MySQL compatível
- `PlatformIO` para compilar e gravar o firmware
- placa `ESP32`
- sensor `MPU6050`
- broker MQTT local ou remoto
- navegador moderno
- PowerShell no Windows para usar os scripts da raiz

## Configuração Rápida

Para o passo a passo completo no Windows, consulte [docs/quickstart-windows.md](docs/quickstart-windows.md).

Fluxo de alto nível:

1. Clone o repositório.
2. Instale as dependências com os scripts do projeto ou manualmente em `backend/` e `frontend/`.
3. Configure os arquivos `.env` a partir dos exemplos existentes.
4. Inicialize o banco MySQL com `database/schema.sql` e `database/seed.sql`.
5. Suba backend, frontend e, se necessário, broker MQTT local.
6. Configure o firmware em [include/app_config.h](include/app_config.h) quando precisar ajustar defaults de fábrica.
7. Grave o firmware no ESP32 com PlatformIO.
8. Use o portal local do ESP32 para configurar Wi-Fi, MQTT, URL do backend e código de pareamento.
9. Gere um código temporário de pareamento no dashboard.
10. Pareie o dispositivo pelo portal local do ESP32.

### Scripts Disponíveis na Raiz

```powershell
.\scripts\check-env.ps1
.\scripts\setup-dev.ps1
.\scripts\init-db.ps1
.\scripts\start-all.ps1 -StartMock
.\scripts\smoke-test.ps1
.\scripts\stop-all.ps1
```

Atalhos equivalentes no [package.json](package.json):

```powershell
npm run dev:check
npm run dev:setup
npm run dev:init-db
npm run dev:start
npm run dev:smoke
npm run dev:stop
```

O fluxo local esperado usa:

- backend em `http://localhost:4000`
- frontend em `http://localhost:5173`
- broker de desenvolvimento na porta `1883`, com bind padrão em `0.0.0.0` quando iniciado localmente

Após aplicar o seed, o ambiente demo cria:

- organização `Familia Demo`
- usuário `admin@queda.local`
- senha `Admin@123`
- paciente `Paciente Demo`
- dispositivo demo `legacy:esp32_01`

Importante: a versão atual de [database/schema.sql](database/schema.sql) recria o schema do projeto. O script `init-db` deve ser tratado como reset do ambiente local para o modelo multi-tenant atual.

## Variáveis de Ambiente

O repositório possui exemplos versionados:

- [backend/.env.example](backend/.env.example)
- [frontend/.env.example](frontend/.env.example)

Não inclua arquivos `.env`, credenciais reais, tokens, chaves, dumps ou logs no repositório.

No backend, as variáveis principais cobrem:

- porta HTTP
- segredo JWT local
- conexão MySQL
- URL e credenciais MQTT
- base de tópicos MQTT
- opções de reconnect, keepalive e TLS
- limiar de dispositivo offline

No frontend, as variáveis principais são:

- `VITE_API_URL`
- `VITE_SOCKET_URL`

Para o ESP32 físico, não use `localhost`, `127.0.0.1` ou `::1` como backend ou broker. Use o IP real do notebook na rede atual, um host acessível na mesma rede ou um serviço externo.

No Windows, `localhost:1883` funcionando no notebook não garante que o ESP32 consiga abrir TCP no broker. Para o broker local de desenvolvimento, `backend/scripts/devBroker.js` usa por padrão:

```env
MQTT_BIND_HOST=0.0.0.0
MQTT_PORT=1883
```

Valide o acesso que o ESP32 precisa usando o IPv4 real do notebook:

```powershell
Test-NetConnection IP_DO_NOTEBOOK -Port 1883
```

O esperado é `TcpTestSucceeded : True`. Em redes institucionais, firewall ou isolamento entre clientes ainda podem bloquear o acesso mesmo com o bind correto.

Esse teste valida apenas TCP. Para validar MQTT de verdade, use um cliente MQTT e confirme o recebimento de `CONNACK`:

```powershell
cd backend
npm run mqtt:test -- 127.0.0.1 1883
npm run mqtt:test -- IP_DO_NOTEBOOK 1883
```

O esperado é `MQTT handshake OK`. Para o backend rodando no mesmo notebook, prefira `MQTT_BROKER_URL=mqtt://127.0.0.1:1883`; para o ESP32, use o IPv4 real do notebook.

## Fluxo de Pareamento

O pareamento definitivo do dispositivo não acontece por MQTT. Ele acontece por HTTP entre o portal local do ESP32 e o backend.

1. Um usuário com permissão gera um código temporário no dashboard.
2. O dashboard consulta `GET /api/system/network-info` para sugerir uma URL de backend acessível na rede atual.
3. O ESP32 abre o portal local `Q-ESP32-*` quando entra em modo de configuração ou mantém esse AP de manutenção ativo em bancada com `SETUP_PORTAL_ALWAYS_ON = true`.
4. O usuário informa `BACKEND_API_BASE_URL` e o código temporário no portal.
5. O ESP32 envia `device_uid`, `device_id`, `device_name` e `pairing_code` para `POST /api/pairing/claim`.
6. O backend valida código, expiração, uso único e organização.
7. O dispositivo passa para `claimed` e fica associado à organização.
8. Se o código tiver paciente inicial, o backend cria o vínculo inicial.
9. O backend devolve `deviceSyncToken` e um resumo do perfil do paciente atual.
10. O backend emite atualização em tempo real.
11. O dashboard atualiza o estado do dispositivo.

Devices desconhecidos que chegam via MQTT podem ser criados tecnicamente como `unclaimed`, mas só passam a pertencer a uma organização após o claim.

## MQTT e Tempo Real

MQTT e `Socket.IO` têm papéis diferentes no projeto:

- **MQTT:** comunicação do ESP32 para o backend, com eventos, status e telemetria.
- **Socket.IO:** comunicação do backend para o navegador, com atualizações em tempo real.
- **Device online/offline:** estado operacional derivado de presença recente de status ou telemetria MQTT no backend.

Eventos `Socket.IO` atuais:

- `alert:new`
- `alert:updated`
- `device:status`
- `telemetry:new`

O diagnóstico de realtime no frontend separa o socket do navegador da saúde MQTT/device. Portanto, uma mensagem de socket indisponível no navegador não significa necessariamente que o ESP32, o broker MQTT ou a ingestão MQTT tenham caído.

No firmware, os tópicos continuam seguindo `queda/devices/{deviceId}/status`, `queda/devices/{deviceId}/telemetry` e `queda/devices/{deviceId}/events`. Se o NTP do ESP32 ainda não sincronizou e o payload trouxer um timestamp monotônico de boot, o backend usa a hora de recebimento para evitar `lastSeenAt` antigo e falso offline.

Após F5 em rota protegida, o frontend preserva o token, reidrata o usuário via `GET /api/me`, descarta apenas uma organização salva inválida e só cria o Socket.IO depois que a sessão mínima está hidratada.

## Status Heurístico Experimental

O backend deriva um status comportamental/postural inicial a partir da telemetria recente do `MPU6050`.

Esse status:

- é heurístico
- está em fase de pré-calibração
- não representa diagnóstico clínico definitivo
- depende da qualidade da telemetria recebida
- deve ser validado com hardware real e cenários práticos
- inclui nível de confiança e justificativa técnica

Estados atuais:

- `pre_calibracao`
- `desconhecido`
- `em_reposo`
- `deitado`
- `sentado`
- `em_movimento`
- `queda_suspeita`
- `queda_confirmada`

O frontend exibe esse status de forma discreta no dashboard, na lista de dispositivos e na página de detalhe do dispositivo. A interpretação deve ser tratada como apoio operacional experimental, não como avaliação médica.

## Limitações Conhecidas

- O projeto não possui GPS.
- O sistema não fornece diagnóstico médico ou clínico definitivo.
- Os thresholds de queda, imobilidade e postura ainda precisam de validação prática com hardware real.
- A leitura de bateria do firmware real ainda pode ser placeholder se não houver circuito de medição dedicado.
- O fluxo padrão continua usando `mqtt://`; `mqtts://` existe como preparação opt-in e depende de configuração coerente.
- O buzzer fica desabilitado por padrão em bancada; para teste manual ou alarme sonoro real, revise `BUZZER_ENABLED` e `BUZZER_ACTIVE_HIGH` conforme a polaridade do módulo.
- O portal local do ESP32 não substitui o dashboard principal.
- O portal local do ESP32 não possui autenticação local própria.
- O pairing depende de o backend estar acessível ao ESP32 pela rede atual.
- Em redes institucionais, isolamento entre clientes pode impedir pareamento ou MQTT local.
- O broker MQTT embutido é voltado a desenvolvimento e demonstração local.
- O schema atual é aplicado como reset de ambiente, não como migração incremental versionada.
- O fluxo completo de unpair ou transferência cross-tenant pela interface ainda não está implementado.
- O auto-reset de upload pode depender da placa, driver e porta serial; em alguns casos ainda pode ser necessário segurar `BOOT` durante o upload.

## Documentação Complementar

- [docs/integration.md](docs/integration.md): integração entre firmware, backend, banco, MQTT, pareamento e tempo real.
- [docs/firmware-hardware.md](docs/firmware-hardware.md): hardware, pinagem, portal local, payloads, calibração, buzzer e bancada.
- [docs/quickstart-windows.md](docs/quickstart-windows.md): guia operacional para Windows.
- [docs/commit-guidelines.md](docs/commit-guidelines.md): padrão de commits do repositório.
- [docs/release-rules.md](docs/release-rules.md): regras de changelog e versionamento.
- [docs/motion-test-bench-report.md](docs/motion-test-bench-report.md): relatório de bancada do motion test e portal AP.
- [backend/README.md](backend/README.md): detalhes do backend, rotas, scripts e ingestão.
- [frontend/README.md](frontend/README.md): detalhes do frontend, telas e comportamento em tempo real.
- [CHANGELOG.md](CHANGELOG.md): histórico de versões, limitações e próximos passos.

## Licença

Este projeto está licenciado sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.
