# Sistema IoT de Deteccao de Quedas com ESP32

Projeto academico full-stack para monitoramento de quedas e imobilidade com firmware `ESP32 + MPU6050`, backend `Node.js + Express + MySQL + MQTT + Socket.IO` e frontend `React + Vite + TypeScript + Tailwind`.

Baseline atual do repositório: `v0.8.2`. Para a experiencia local prevista nesta fase, o projeto foi estabilizado para `Node.js 20+`.

## Visao geral

O projeto deixou de operar como um painel global unico e passou a usar um modelo multi-tenant por organizacao. A mesma base agora suporta:

- familias
- clinicas
- hospitais
- multiplos pacientes por organizacao
- multiplos usuarios por organizacao
- multiplos dispositivos por organizacao
- claim seguro de dispositivo com codigo temporario
- historico de vinculo device <-> paciente sem perder rastreabilidade

O firmware continua responsavel pela deteccao local e pela publicacao MQTT. O backend continua consumindo o mesmo contrato MQTT, mas agora persiste e expoe tudo com escopo correto por organizacao e, quando houver caregiver assignments, tambem por paciente.

No frontend, a camada multi-tenant desta fase passou por uma rodada de estabilizacao: o carregamento inicial ficou mais leve com rotas sob demanda, o dashboard voltou a receber o contexto de paciente nos eventos recentes e a automacao local passou a validar o tenant ativo de forma explicita.

Nesta mesma fase, a autenticacao do frontend passou a reidratar a sessao com `GET /api/me` no boot. Isso evita tela branca quando o navegador ainda guarda um `user` antigo no `localStorage` de uma versao anterior ao modelo multi-tenant atual.

## Estrutura do projeto

```text
/
  backend/
    scripts/
    src/
    .env.example
    README.md
  database/
    schema.sql
    seed.sql
  docs/
    firmware-hardware.md
    integration.md
    quickstart-windows.md
  frontend/
    public/
    src/
    .env.example
    README.md
  include/
  scripts/
  src/
  CHANGELOG.md
  package.json
  platformio.ini
  README.md
```

## Arquitetura atual

1. O firmware le o `MPU6050`, roda o detector local e publica `events`, `status` e `telemetry`.
2. O backend assina `queda/devices/+/events`, `status` e `telemetry`.
3. Cada payload agora pode trazer `device_uid` tecnico e continua trazendo `device_id`.
4. Devices desconhecidos podem ser descobertos tecnicamente via MQTT, mas entram como `unclaimed`.
5. O claim definitivo acontece por codigo temporario gerado no dashboard e enviado pelo portal local do ESP32.
6. Depois do claim, o device fica locked naquela organizacao.
7. O backend grava `organization_id`, `patient_id` e `device_assignment_history_id` no momento da ingestao para preservar o historico correto mesmo apos reassignment.
8. O frontend opera sempre sobre o tenant ativo do usuario.

## Multi-tenant e escopo

O modelo principal do banco agora inclui:

- `organizations`
- `organization_members`
- `patients`
- `caregiver_assignments`
- `devices`
- `device_assignment_history`
- `device_pairing_sessions`

Os pacientes agora tambem carregam `full_name`, `birth_date`, `weight_kg` e `height_cm`, preparando o dashboard e o firmware para futuras regras clinicas sem tirar o backend da posicao de fonte da verdade.

Tabelas operacionais como `device_status`, `telemetry_logs`, `events` e `alerts` tambem carregam o escopo organizacional e clinico do momento da ingestao.

Regras atuais:

- `platform_admin` pode operar globalmente ou selecionar uma organizacao especifica
- `organization_admin` gerencia membros, pacientes, devices e pairing dentro da propria organizacao
- `caregiver`, `operator` e `viewer` nunca enxergam dados de outra organizacao
- quando existem caregiver assignments para aquele membro, o backend restringe o acesso tambem ao subconjunto de pacientes atribuidos

## Pairing e vinculo do dispositivo

O contrato MQTT foi preservado, mas o vinculo final do device deixou de ser automatico.

Fluxo atual:

1. um `organization_admin` abre a tela de dispositivos
2. gera um codigo temporario de pareamento
3. o frontend consulta `GET /api/system/network-info` para destacar uma URL principal recomendada para a rede atual e guardar fallbacks opcionais
4. o modal mostra o `pairingCode`, a URL principal, estado de expiracao e as outras URLs apenas em `Outras opcoes de rede`
5. o usuario abre o portal local do ESP32 e informa manualmente a URL do backend e o codigo temporario
6. o ESP32 envia `device_uid`, `device_id` e `pairing_code` para `POST /api/pairing/claim`
7. o backend valida expiracao, uso unico e organizacao e devolve erros especificos para invalido, expirado ou ja utilizado
8. o backend faz o claim transacional, devolve `deviceSyncToken` e o perfil resumido do paciente atual
9. o device passa para `claimed` e fica locked no tenant
10. opcionalmente o codigo de pairing ja pode definir o paciente inicial

## Configuracao do ESP32

O firmware preserva o portal local com `NVS`, multiplas redes Wi-Fi, fallback automatico por falha de Wi-Fi e MQTT e agora tambem suporta o fluxo de pairing.

O arquivo [include/app_config.h](include/app_config.h) continua sendo a referencia principal de defaults e constantes de hardware. O portal local do ESP32 persiste:

- redes Wi-Fi
- broker MQTT e credenciais
- `DEVICE_ID`
- `MQTT_CLIENT_ID`
- `BACKEND_API_BASE_URL`
- `deviceSyncToken`
- perfil resumido do paciente atual (`patientName`, `weightKg`, `heightCm`, `fallSensitivityPreset`)

O ESP32 tambem exibe e usa um `device_uid` tecnico estavel derivado do hardware para o claim seguro.

Nesta rodada, o firmware tambem passou a:

- controlar logs seriais por nivel em `include/app_config.h`, reduzindo verbosidade fora de diagnosticos
- manter um snapshot pequeno dos eventos criticos pendentes em `NVS` para reduzir perda apos reboot rapido
- aceitar preparacao opt-in para `MQTT/TLS`, preservando `mqtt://` sem TLS como comportamento padrao

O portal local agora fica focado no fluxo manual confiavel de pairing: `BACKEND_API_BASE_URL`, codigo temporario e botao `Parear agora`. O backend continua sendo a fonte da verdade para os dados do paciente; o ESP32 apenas persiste uma copia resumida para uso local futuro.

Para bancada, o firmware agora tambem possui um caminho explicito para forcar o portal local no boot com `FORCE_SETUP_MODE_ON_BOOT = true`. Isso facilita validar o AP `Queda-Setup-*` sem depender de falha real de Wi-Fi ou MQTT.

Nesta rodada tambem entrou o helper [scripts/free-serial-port.ps1](scripts/free-serial-port.ps1), pensado para desalojar monitores `PlatformIO` orfaos que prendem a `COM` e impedem upload ou captura de log no Windows.

Na placa atual com ponte `CH9102`, o upload voltou a funcionar quando o `BOOT` foi segurado manualmente durante o `Connecting...`. O auto-reset para entrar em modo de download ainda nao ficou confiavel sem intervencao manual.

O `PlatformIO` agora tambem roda automaticamente uma limpeza da porta serial antes do upload no Windows, via [scripts/pio-pre-upload.py](scripts/pio-pre-upload.py), para reduzir falhas por monitor preso na `COM`.

Detalhes completos ficam em [docs/firmware-hardware.md](docs/firmware-hardware.md).

## Banco de dados

Arquivos principais:

- [database/schema.sql](database/schema.sql)
- [database/seed.sql](database/seed.sql)

O seed atual cria um ambiente demo coerente com o modelo novo:

- organizacao `Familia Demo`
- usuario `admin@queda.local`
- senha `Admin@123`
- paciente `Paciente Demo`
- device claimed inicial `legacy:esp32_01`
- assignment inicial entre device e paciente

Importante:

- a versao atual de [database/schema.sql](database/schema.sql) recria o schema inteiro
- rodar `init-db` nesta versao reseta as tabelas do projeto para o modelo multi-tenant atual

## MQTT e tempo real

Base de topicos:

- `queda/devices`

Topicos consumidos:

- `queda/devices/{deviceId}/events`
- `queda/devices/{deviceId}/status`
- `queda/devices/{deviceId}/telemetry`

Eventos `Socket.IO`:

- `alert:new`
- `alert:updated`
- `device:status`
- `telemetry:new`

Esses eventos agora tambem sao emitidos com filtro de escopo no backend, de acordo com organizacao e paciente visiveis para o usuario conectado.

## Quickstart no Windows

Para o passo a passo operacional completo, use [docs/quickstart-windows.md](docs/quickstart-windows.md).

Fluxo minimo:

```powershell
.\scripts\setup-dev.ps1
.\scripts\init-db.ps1
.\scripts\start-all.ps1 -StartMock
```

Depois disso:

- backend em `http://localhost:4000`
- frontend em `http://localhost:5173`
- broker dev opcional em `mqtt://localhost:1883`

No backend, o broker continua funcionando normalmente com `mqtt://...`. A base para `mqtts://...` foi preparada de forma opt-in por variaveis de ambiente, sem tornar TLS obrigatorio nesta fase.

Voce pode:

- entrar com `admin@queda.local / Admin@123`
- ou usar `Criar conta` para criar uma nova organizacao e o `organization_admin` inicial

Se o navegador estiver com sessao antiga de uma versao anterior e a interface mostrar erro de renderizacao, o frontend agora exibe uma tela de recuperacao com opcao para limpar a sessao local e voltar ao `/login`.

## Teste sem hardware real

Sem ESP32 fisico, o caminho mais simples continua sendo:

1. rodar `.\scripts\start-all.ps1 -StartMock`
2. entrar no site
3. acompanhar dashboard, pacientes, dispositivos e alertas
4. rodar `.\scripts\smoke-test.ps1`

O mock publisher foi adaptado para o modelo atual e publica `device_uid = legacy:{deviceId}` para encaixar no fluxo do backend e do seed demo.

O smoke test agora usa o `activeOrganizationId` devolvido no login para enviar `X-Organization-Id` e validar:

- `GET /api/organization`
- `GET /api/patients`
- `GET /api/dashboard/summary`
- `GET /api/devices`
- `GET /api/alerts`

## Documentacao detalhada

- [docs/quickstart-windows.md](docs/quickstart-windows.md): guia operacional no Windows
- [docs/firmware-hardware.md](docs/firmware-hardware.md): hardware, pinagem, portal local, pairing, multi-Wi-Fi, payloads e calibracao
- [docs/integration.md](docs/integration.md): contrato MQTT, claim por codigo, persistencia, autorizacao e tempo real
- [docs/motion-test-bench-report.md](docs/motion-test-bench-report.md): relatorio desta rodada de bancada para `MOTION TEST` e portal AP
- [backend/README.md](backend/README.md): API, servicos, escopo por organizacao e broker dev
- [frontend/README.md](frontend/README.md): telas, organizacao ativa, login, pairing e UX operacional
- [CHANGELOG.md](CHANGELOG.md): historico real de mudancas, limitacoes e proximos passos
