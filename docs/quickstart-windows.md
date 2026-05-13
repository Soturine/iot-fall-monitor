# Quickstart no Windows

Este guia foi pensado para uso no Windows com VS Code e PowerShell. Ele cobre o fluxo real atual do projeto: ambiente local, banco multi-tenant, dashboard por organizacao, mock publisher e pairing do ESP32 por codigo temporario.

Antes de continuar, vale ter em mao tambem:

- [README.md](../README.md)
- [firmware-hardware.md](firmware-hardware.md)
- [integration.md](integration.md)
- [alerting-architecture.md](alerting-architecture.md)

## 1. O que instalar

Instale antes:

- `Node.js 20+` com `npm`
- `MySQL Server` ou acesso a um servidor MySQL existente
- opcionalmente `mysql CLI` ou `MySQL Workbench`
- `PlatformIO Core` ou a extensao PlatformIO do VS Code, se voce for compilar o firmware

## 2. Diagnostico inicial

Rode:

```powershell
.\scripts\check-env.ps1
```

Esse comando verifica:

- `Node.js`
- `npm`
- `PlatformIO`
- `backend/.env`
- `frontend/.env`
- `node_modules`
- reachability do MySQL
- portas do backend e frontend
- broker MQTT
- `database/schema.sql`
- `database/seed.sql`

Se o `Node.js` estiver abaixo da faixa recomendada, o script agora avisa explicitamente antes do build.

## 3. Setup inicial

Rode:

```powershell
.\scripts\setup-dev.ps1
```

O script:

- instala dependencias do backend e do frontend quando necessario
- cria `backend/.env` e `frontend/.env` a partir de `.env.example` se estiverem faltando
- destaca campos que ainda merecem revisao manual

## 4. Configurar `backend/.env`

Arquivo principal:

- [backend/.env](../backend/.env)

Campos mais importantes:

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
MQTT_CLIENT_ID=queda-backend
MQTT_TOPIC_BASE=queda/devices
MQTT_RECONNECT_PERIOD_MS=4000
MQTT_CONNECT_TIMEOUT_MS=30000
MQTT_KEEPALIVE_SECONDS=60
MQTT_TLS_REJECT_UNAUTHORIZED=true
MQTT_TLS_CA_FILE=
```

Notas praticas:

- o ambiente local atual usa `MYSQL_PASSWORD=` vazio
- backend e frontend podem usar `localhost` no notebook; para MQTT local do backend, prefira `127.0.0.1`
- isso nao vale para o ESP32 fisico
- para o backend local, prefira `MQTT_BROKER_URL=mqtt://127.0.0.1:1883` para evitar resolucao de `localhost` em IPv6
- o broker local de desenvolvimento usa `MQTT_BIND_HOST=0.0.0.0` para aceitar conexao pelo IPv4 da LAN
- `mqtts://...` ficou preparado de forma opt-in, mas o fluxo padrao local do backend continua sendo `mqtt://127.0.0.1:1883`

## 5. Configurar `frontend/.env`

Arquivo principal:

- [frontend/.env](../frontend/.env)

Configuracao padrao:

```env
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
```

## 6. Inicializar o banco

Rode:

```powershell
.\scripts\init-db.ps1
```

Importante nesta versao:

- [database/schema.sql](../database/schema.sql) recria o schema do projeto
- rodar `init-db` funciona como reset do ambiente para o modelo multi-tenant atual

Quando tudo funciona, o seed cria:

- organizacao `Familia Demo`
- usuario `admin@queda.local`
- senha `Admin@123`
- paciente `Paciente Demo`
- device demo claimed `legacy:esp32_01`

### Se a automacao falhar

Os casos mais comuns sao:

- MySQL desligado
- host, porta, usuario ou senha errados em `backend/.env`
- ambiente sem `mysql CLI` e sem acesso ao servidor

Se preferir, rode manualmente pelo Workbench:

1. execute [database/schema.sql](../database/schema.sql)
2. execute [database/seed.sql](../database/seed.sql)

## 7. Iniciar tudo

Fluxo mais simples:

```powershell
.\scripts\start-all.ps1 -StartMock
```

Esse comando:

- valida pre-requisitos
- sobe o broker MQTT local se necessario
- inicia backend
- inicia frontend
- opcionalmente inicia o mock publisher
- aguarda o frontend ficar disponivel
- abre o site no navegador

Fluxo local esperado:

- backend em `http://localhost:4000`
- frontend em `http://localhost:5173`
- broker dev na porta `1883`, escutando por padrao em `0.0.0.0`

## 8. Como entrar no site

### Opcao A: usar o ambiente demo do seed

Se voce aplicou o seed:

- e-mail: `admin@queda.local`
- senha: `Admin@123`

### Opcao B: criar uma nova organizacao

Se nao quiser usar o seed:

1. abra `/login`
2. clique em `Criar conta`
3. informe nome, e-mail, senha, nome da organizacao e tipo
4. envie o formulario

Esse fluxo cria:

- um novo usuario
- uma nova organizacao
- a membership inicial como `organization_admin`

## 9. Como a UX mudou

Depois do login:

- a sidebar mostra a organizacao ativa
- o dashboard deixa de ser global
- `patients`, `devices`, `alerts` e `organization` passam a refletir o tenant ativo
- `Sair` encerra a sessao
- `Trocar usuario` abre `/login?force=1`
- o cadastro de paciente agora inclui `nome`, `peso` e `altura`

Peso e altura continuam sendo editados no dashboard/back-end. O portal do ESP32 recebe apenas um resumo sincronizado para uso local futuro.

## 10. Como testar sem ESP32 fisico

Fluxo recomendado:

1. rode `.\scripts\start-all.ps1 -StartMock`
2. entre no site
3. acompanhe `Dashboard`, `Patients`, `Devices` e `Alerts`
4. rode:

```powershell
.\scripts\smoke-test.ps1
```

O smoke test continua validando o fluxo principal de backend, frontend, login e endpoints basicos.

Na versao atual ele tambem:

- reaproveita o `activeOrganizationId` retornado no login
- envia `X-Organization-Id` nas consultas protegidas
- valida `organization`, `patients`, `dashboard`, `devices` e `alerts`
- trata a publicacao do mock como verificacao auxiliar, sem mascarar o sucesso do fluxo principal

### Testes tecnicos de backend e stress

Para validar a arquitetura de alertas e MQTT sem hardware fisico:

```powershell
npm run check --prefix backend
npm test --prefix backend
npm run test:alerts --prefix backend
npm run test:mqtt --prefix backend
npm run stress:alerts --prefix backend
```

O stress roda em dry-run e gera relatorios em:

```text
backend/logs/stress/
```

Arquivos esperados:

- `stress-<runId>.jsonl`: eventos detalhados por fase, topico, device, latencia e erro
- `summary-<runId>.json`: resumo com totais, p95/p99 e falhas

Para limpar apenas logs locais de stress:

```powershell
npm run stress:cleanup --prefix backend -- --yes
```

## 11. Como parear um ESP32 real

### Passo 1: gravar o firmware

Compile e grave o firmware no ESP32.

### Passo 2: configurar rede e MQTT no portal

Se o device entrar em `SETUP_MODE` ou se o portal de manutencao estiver ativo:

1. conecte no AP `Q-ESP32-*`
2. abra `http://setup.queda` ou `http://192.168.4.1`
3. cadastre Wi-Fi
4. preencha `MQTT_HOST`, `MQTT_PORT`, usuario/senha se houver
5. preencha `DEVICE_ID`, `MQTT_CLIENT_ID` e `BACKEND_API_BASE_URL`

Na bancada atual, `SETUP_PORTAL_ALWAYS_ON = true` deixa esse AP visivel em paralelo com Wi-Fi station e MQTT. Isso nao e `SETUP_MODE`: o ESP32 pode continuar publicando status, eventos e telemetria enquanto o portal esta aberto.

Se voce quiser testar especificamente o modo bloqueante de setup:

1. abra [include/app_config.h](../include/app_config.h)
2. defina `FORCE_SETUP_MODE_ON_BOOT = true`
3. grave o firmware
4. reinicie o ESP32
5. procure a rede `Q-ESP32-*`

### Passo 3: gerar codigo de pairing no dashboard

No site:

1. abra `Devices`
2. clique em `Parear dispositivo`
3. opcionalmente escolha um paciente inicial
4. gere o codigo temporario
5. copie primeiro a URL principal recomendada para a rede atual

### Passo 4: concluir o claim no portal do ESP32

No portal do ESP32:

1. abra a secao de pairing
2. preencha `BACKEND_API_BASE_URL` com a URL principal recomendada
3. cole o codigo temporario
4. clique em `Parear agora`

Se tudo estiver correto:

- o backend faz o claim
- o device passa para `claimed`
- ele fica locked na organizacao
- se o pairing code tinha paciente inicial, o assignment ja fica criado
- o ESP32 salva `deviceSyncToken` e o perfil resumido do paciente atual em `NVS`

### Se a URL principal nao funcionar

O modal `Parear dispositivo` mostra uma URL principal recomendada e, quando necessario, uma area `Outras opcoes de rede`.

Use as URLs secundarias apenas se:

1. o celular nao alcancar o backend pela URL principal
2. o notebook estiver em outra interface da mesma rede
3. a rede atual tiver uma topologia incomum

## 12. Como preencher MQTT e backend corretamente no ESP32

### Cenario A: broker local no notebook

- `MQTT_HOST` = IP real do notebook
- `BACKEND_API_BASE_URL` = `http://IP-DO-NOTEBOOK:4000`
- o broker dev precisa estar escutando em `0.0.0.0:1883` ou host equivalente acessivel pela LAN
- nunca use `localhost` no ESP32

Diagnostico Windows para o broker local:

```powershell
netstat -ano | findstr :1883
Get-CimInstance Win32_Process -Filter "ProcessId = PID_AQUI" | Select-Object ProcessId,CommandLine
```

Para testar o mesmo caminho TCP que o ESP32 precisa abrir:

```powershell
Test-NetConnection IP_DO_NOTEBOOK -Port 1883
```

O esperado e:

```text
TcpTestSucceeded : True
```

Isso valida apenas TCP. Para validar o handshake MQTT e o `CONNACK`:

```powershell
cd backend
npm run mqtt:test -- 127.0.0.1 1883
npm run mqtt:test -- IP_DO_NOTEBOOK 1883
```

O esperado e `MQTT handshake OK`.

Observacoes:

- `localhost:1883` funcionando nao garante que o ESP32 consiga acessar
- TCP aberto nao garante que o broker concluiu o protocolo MQTT
- `127.0.0.1`, `localhost` e `::1` sao locais do proprio computador
- o ESP32 deve usar o IPv4 real do notebook na rede atual
- em rede institucional, ainda pode haver isolamento entre clientes mesmo com o bind correto
- no backend, logs `MQTT status recebido/processado` e `MQTT telemetry recebida/processada` confirmam topico, device resolvido e persistencia
- no dashboard, `lastSeenAt` deve acompanhar a hora de recebimento mesmo quando o ESP32 ainda nao sincronizou NTP

### Validar F5 no frontend

Depois do login:

1. abra `/dashboard`, `/devices` ou `/devices/:id`
2. pressione F5
3. confirme que a tela fica em `Validando sessao...` e depois reabre sem exigir logout/login
4. se a organizacao salva no navegador estiver invalida, o app deve escolher uma membership valida do usuario
5. o realtime deve conectar somente depois dessa hidratacao

### Cenario B: hotspot do celular

- conecte notebook e ESP32 no mesmo hotspot
- use o IP do notebook nessa rede para broker e backend

### Cenario C: Wi-Fi da faculdade

- notebook e ESP32 precisam estar na mesma rede
- algumas redes institucionais podem bloquear comunicacao entre clientes
- hotspot do celular costuma ser mais confiavel para demo

### Cenario D: broker ou backend externos

- use dominio ou IP externo acessivel pelo ESP32
- preencha credenciais quando necessario

## 13. Como testar em bancada o `MPU6050 + buzzer`

O firmware tem um modo opcional de teste local.

Passo a passo:

1. abra [include/app_config.h](../include/app_config.h)
2. defina `MOTION_TEST_MODE_ENABLED = true`
3. habilite `BUZZER_ENABLED = true` apenas para esse teste controlado
4. revise `BUZZER_ACTIVE_HIGH` conforme a polaridade do modulo
5. ajuste thresholds se necessario
6. grave o firmware
7. abra o monitor serial
8. mova o conjunto `ESP32 + MPU6050`

Esse modo serve apenas para diagnostico local e nao muda o dashboard principal.

Na versao atual, o teste:

- arma depois de um curto repouso relativo
- por padrao exige `accel + gyro` acima do limiar juntos
- reduz apitos intermitentes por vibracao leve ou giro isolado

## 14. Como parar tudo

Quando terminar:

```powershell
.\scripts\stop-all.ps1
```

## 15. Erros comuns

### `Login falhou com o usuario demo`

Provavel causa:

- seed nao aplicado
- banco antigo ainda nao foi recriado para o schema novo

Como resolver:

- rode `.\scripts\init-db.ps1`

### `O ESP32 nao consegue parear`

Provavel causa:

- `BACKEND_API_BASE_URL` invalida
- notebook nao acessivel na rede atual
- codigo expirado
- codigo ja utilizado

Como resolver:

- use IP real do notebook ou backend externo acessivel
- gere um novo codigo no dashboard
- confira se o device e o notebook estao na mesma rede

### `O ESP32 conecta no Wi-Fi, mas o dashboard continua offline`

Provavel causa:

- broker MQTT inacessivel
- `MQTT_HOST` configurado com `localhost`
- backend ouvindo outro broker
- device ainda sem claim na organizacao do usuario
- firewall/rede bloqueando o broker pelo IPv4 real
- timestamps antigos por NTP ainda nao sincronizado em firmware antigo

Como resolver:

- use o IP real do notebook ou um broker externo
- no Windows, confirme `Test-NetConnection IP_DO_NOTEBOOK -Port 1883`
- confirme `npm run mqtt:test -- IP_DO_NOTEBOOK 1883`
- revise a secao MQTT do portal
- acompanhe os logs de ingestao MQTT no backend e procure `telemetry processada`

### `A COM4 esta ocupada e o monitor/upload nao funciona`

Provavel causa:

- monitor serial antigo do `PlatformIO` ainda aberto
- processo `device monitor` orfao segurando a porta

Como resolver:

```powershell
.\scripts\free-serial-port.ps1 -Port COM4
```

O projeto agora tambem executa essa limpeza automaticamente antes do upload via `PlatformIO` no Windows. Mesmo assim, ainda vale rodar o script manualmente quando a IDE ficar com monitor serial preso.

Se a porta continuar ocupada:

- feche o monitor serial do VS Code
- feche terminais seriais externos
- tente novamente o script

### `Ainda preciso segurar BOOT para fazer upload`

Provavel causa:

- a placa nao esta entrando automaticamente em modo de download
- a `COM` pode estar livre, mas o auto-reset de upload ainda nao esta funcionando corretamente no hardware/driver

O que isso significa:

- problema diferente de porta ocupada
- o firmware pode estar rodando e emitindo log normalmente, mesmo assim o upload automatico falha

Estado atual desta rodada:

- a serial/log do ESP32 ficou acessivel
- o upload voltou a funcionar quando `BOOT` foi mantido pressionado durante o `Connecting...`
- sem isso, o auto-reset ainda nao esta confiavel na placa atual

Procedimento pratico atual:

1. rode `.\scripts\free-serial-port.ps1 -Port COM4`
2. inicie o upload
3. segure `BOOT` durante `Connecting...`
4. solte quando a gravacao efetivamente comecar

### `O smoke test falhou mesmo com o login funcionando`

Provavel causa:

- backend ou frontend nao estavam rodando
- a resposta de login nao trouxe `activeOrganizationId`
- houve regressao no filtro multi-tenant de `organization`, `patients`, `dashboard`, `devices` ou `alerts`
- o backend pode estar apontando para um banco antigo, ainda sem o schema multi-tenant atual

Como resolver:

- confirme o ambiente com `.\scripts\start-all.ps1`
- teste manualmente `http://localhost:4000/health`
- faça login pela UI e confirme se a organizacao ativa aparece na sidebar
- se o login responder `500`, rode `.\scripts\init-db.ps1`
- rode `.\scripts\smoke-test.ps1` novamente

### `A pagina ficou branca e o console mostra erro no AuthProvider`

Provavel causa:

- o navegador ainda tem um `user` antigo salvo no `localStorage`
- esse objeto veio de uma versao anterior ao modelo multi-tenant atual e nao tem `memberships` no formato esperado

Como resolver:

- recarregue a pagina uma vez
- se aparecer a tela de recuperacao do frontend, clique em `Limpar sessao local e abrir login`
- se preferir manualmente, limpe o `localStorage` do site em `localhost:5173`
- depois entre novamente ou use `/login?force=1`

## 16. Menor conjunto de comandos

Primeira vez:

```powershell
.\scripts\setup-dev.ps1
.\scripts\init-db.ps1
.\scripts\start-all.ps1 -StartMock
```

Uso cotidiano:

```powershell
.\scripts\start-all.ps1
.\scripts\stop-all.ps1
```
