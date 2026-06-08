# Quickstart no Windows

Este guia foi pensado para uso no Windows com VS Code e PowerShell. Ele cobre o fluxo real atual do projeto: ambiente local, banco multi-tenant, dashboard por organização, mock publisher e pairing do ESP32 por código temporário.

Antes de continuar, vale ter em mão também:

- [README.md](../README.md)
- [firmware-hardware.md](firmware-hardware.md)
- [integration.md](integration.md)
- [alerting-architecture.md](alerting-architecture.md)

## 1. O que instalar

Instale antes:

- `Node.js 20+` com `npm`
- `MySQL Server` ou acesso a um servidor MySQL existente
- opcionalmente `mysql CLI` ou `MySQL Workbench`
- `PlatformIO Core` ou a extensão PlatformIO do VS Code, se você for compilar o firmware

## 2. Diagnóstico inicial

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

- instala dependencias do backend e do frontend quando necessário
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

Notas práticas:

- o ambiente local atual usa `MYSQL_PASSWORD=` vazio
- backend e frontend podem usar `localhost` no notebook; para MQTT local do backend, prefira `127.0.0.1`
- isso não vale para o ESP32 físico
- para o backend local, prefira `MQTT_BROKER_URL=mqtt://127.0.0.1:1883` para evitar resolucao de `localhost` em IPv6
- o broker local de desenvolvimento usa `MQTT_BIND_HOST=0.0.0.0` para aceitar conexão pelo IPv4 da LAN
- `mqtts://...` ficou preparado de forma opt-in, mas o fluxo padrão local do backend continua sendo `mqtt://127.0.0.1:1883`

## 5. Configurar `frontend/.env`

Arquivo principal:

- [frontend/.env](../frontend/.env)

Configuracao padrão:

```env
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
```

## 6. Inicializar o banco

Rode:

```powershell
.\scripts\init-db.ps1
```

Importante nesta versão:

- [database/schema.sql](../database/schema.sql) recria o schema do projeto
- rodar `init-db` funciona como reset do ambiente para o modelo multi-tenant atual

Quando tudo funciona, o seed cria:

- organização `Familia Demo`
- usuário `admin@queda.local`
- senha `Admin@123`
- paciente `Paciente Demo`
- device demo claimed `legacy:esp32_01`

### Se a automação falhar

Os casos mais comuns são:

- MySQL desligado
- host, porta, usuário ou senha errados em `backend/.env`
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

- valida pré-requisitos
- sobe o broker MQTT local se necessário
- inicia backend
- inicia frontend
- opcionalmente inicia o mock publisher
- aguarda o frontend ficar disponível
- abre o site no navegador

Fluxo local esperado:

- backend em `http://localhost:4000`
- frontend em `http://localhost:5173`
- broker dev na porta `1883`, escutando por padrão em `0.0.0.0`

## 8. Como entrar no site

### Opcao A: usar o ambiente demo do seed

Se você aplicou o seed:

- e-mail: `admin@queda.local`
- senha: `Admin@123`

### Opcao B: criar uma nova organização

Se não quiser usar o seed:

1. abra `/login`
2. clique em `Criar conta`
3. informe nome, e-mail, senha, nome da organização e tipo
4. envie o formulario

Esse fluxo cria:

- um novo usuário
- uma nova organização
- a membership inicial como `organization_admin`

## 9. Como a UX mudou

Depois do login:

- a sidebar mostra a organização ativa
- o dashboard deixa de ser global
- `patients`, `devices`, `alerts` e `organization` passam a refletir o tenant ativo
- `Sair` encerra a sessão
- `Trocar usuário` abre `/login?force=1`
- o cadastro de paciente agora inclui `nome`, `peso` e `altura`

Peso e altura continuam sendo editados no dashboard/back-end. O portal do ESP32 recebe apenas um resumo sincronizado para uso local futuro.

## 10. Como testar sem ESP32 físico

Fluxo recomendado:

1. rode `.\scripts\start-all.ps1 -StartMock`
2. entre no site
3. acompanhe `Dashboard`, `Patients`, `Devices` e `Alerts`
4. rode:

```powershell
.\scripts\smoke-test.ps1
```

O smoke test continua validando o fluxo principal de backend, frontend, login e endpoints basicos.

Na versão atual ele também:

- reaproveita o `activeOrganizationId` retornado no login
- envia `X-Organization-Id` nas consultas protegidas
- valida `organization`, `patients`, `dashboard`, `devices` e `alerts`
- trata a publicação do mock como verificação auxiliar, sem mascarar o sucesso do fluxo principal

### Testes técnicos de backend e stress

Para validar a arquitetura de alertas e MQTT sem hardware físico:

```powershell
npm run check --prefix backend
npm test --prefix backend
npm run test:smoke --prefix backend
npm run test:integration --prefix backend
npm run test:alerts --prefix backend
npm run test:mqtt --prefix backend
npm run stress:dry --prefix backend
```

O `stress:dry` roda com mocks locais. Para testar broker MQTT, backend e MySQL reais de desenvolvimento, deixe backend/broker/banco rodando e use:

```powershell
npm run stress:real --prefix backend
```

O script real aborta se o backend `/health`, o broker MQTT ou o banco não estiverem disponíveis, e também bloqueia ambiente de produção.

As suites geram relatórios em:

```text
backend/logs/stress/
```

Arquivos esperados:

- `stress-<runId>.jsonl`: eventos detalhados por fase, tópico, device, latencia e erro
- `summary-<runId>.json`: resumo com totais, p95/p99 e falhas
- `failures-<runId>.json`: falhas completas para análise
- `report-<runId>.md`: relatório legível com MQTT, telemetria, quedas/alertas e recomendações

Para limpar apenas logs locais de stress:

```powershell
npm run stress:cleanup --prefix backend -- --yes
```

## 11. Como parear um ESP32 real

### Passo 1: gravar o firmware

Compile e grave o firmware no ESP32.

### Passo 2: configurar rede e MQTT no portal

Se o device entrar em `SETUP_MODE` ou se o portal de manutenção estiver ativo:

1. conecte no AP `Q-ESP32-*`
2. abra `http://setup.queda` ou `http://192.168.4.1`
3. cadastre Wi-Fi
4. preencha `MQTT_HOST`, `MQTT_PORT`, usuário/senha se houver
5. preencha `DEVICE_ID`, `MQTT_CLIENT_ID` e `BACKEND_API_BASE_URL`

Na bancada atual, `SETUP_PORTAL_ALWAYS_ON = true` deixa esse AP visível em paralelo com Wi-Fi station e MQTT. Isso não é `SETUP_MODE`: o ESP32 pode continuar publicando status, eventos e telemetria enquanto o portal está aberto.

Se você quiser testar especificamente o modo bloqueante de setup:

1. abra [include/app_config.h](../include/app_config.h)
2. defina `FORCE_SETUP_MODE_ON_BOOT = true`
3. grave o firmware
4. reinicie o ESP32
5. procure a rede `Q-ESP32-*`

### Passo 3: gerar código de pairing no dashboard

No site:

1. abra `Devices`
2. clique em `Parear dispositivo`
3. opcionalmente escolha um paciente inicial
4. gere o código temporário
5. copie primeiro a URL principal recomendada para a rede atual

### Passo 4: concluir o claim no portal do ESP32

No portal do ESP32:

1. abra a seção de pairing
2. preencha `BACKEND_API_BASE_URL` com a URL principal recomendada
3. cole o código temporário
4. clique em `Parear agora`

Se tudo estiver correto:

- o backend faz o claim
- o device passa para `claimed`
- ele fica locked na organização
- se o pairing code tinha paciente inicial, o assignment já fica criado
- o ESP32 salva `deviceSyncToken` e o perfil resumido do paciente atual em `NVS`

### Se a URL principal não funcionar

O modal `Parear dispositivo` mostra uma URL principal recomendada e, quando necessário, uma área `Outras opções de rede`.

Use as URLs secundarias apenas se:

1. o celular não alcançar o backend pela URL principal
2. o notebook estiver em outra interface da mesma rede
3. a rede atual tiver uma topologia incomum

## 12. Como preencher MQTT e backend corretamente no ESP32

### Cenário A: broker local no notebook

- `MQTT_HOST` = IP real do notebook
- `BACKEND_API_BASE_URL` = `http://IP-DO-NOTEBOOK:4000`
- o broker dev precisa estar escutando em `0.0.0.0:1883` ou host equivalente acessível pela LAN
- nunca use `localhost` no ESP32

Diagnóstico Windows para o broker local:

```powershell
netstat -ano | findstr :1883
Get-CimInstance Win32_Process -Filter "ProcessId = PID_AQUI" | Select-Object ProcessId,CommandLine
```

Para testar o mesmo caminho TCP que o ESP32 precisa abrir:

```powershell
Test-NetConnection IP_DO_NOTEBOOK -Port 1883
```

O esperado é:

```text
TcpTestSucceeded : True
```

Isso valida apenas TCP. Para validar o handshake MQTT e o `CONNACK`:

```powershell
cd backend
npm run mqtt:test -- 127.0.0.1 1883
npm run mqtt:test -- IP_DO_NOTEBOOK 1883
```

O esperado é `MQTT handshake OK`.

Para confirmar mensagens reais do ESP32 no broker que o backend usa:

```powershell
npm run mqtt:watch --prefix backend
```

O watcher deve mostrar linhas JSON com `topic`, `bytes`, `json: "ok"` e um resumo com `device_id`, `device_uid`, `timestamp`, RSSI/bateria ou amostras do sensor.

Na `v0.8.30`, bateria só aparece como porcentagem quando o campo manual foi preenchido no portal ESP32 ou quando houver uma leitura automática futura. Sem isso, o firmware informa `battery_percent_source=not_configured` e o dashboard deve mostrar `--%`/`não informado`, não `100%`.

Durante o teste real, deixe esse terminal aberto e reinicie o ESP32 com o Serial Monitor em `115200`. O firmware deve registrar:

```text
[mqtt] connected broker=IP_DO_NOTEBOOK:1883 tls=0 clientId=esp32_01_client
[mqtt] topic telemetry=queda/devices/esp32_01/telemetry
[sensor] read ok ax=... ay=... az=...
[telemetry] publish ok topic=queda/devices/esp32_01/telemetry bytes=...
```

Se o Serial Monitor mostrar `publish ok` repetindo e o `mqtt:watch` não mostrar linhas novas, o ESP32 provavelmente está publicando em outro broker/rede. Se o `mqtt:watch` mostrar as linhas e o dashboard não atualizar, volte a investigar backend, escopo do device, Socket.IO ou frontend.

Para testar backend e dashboard sem ESP32 físico:

```powershell
npm run mqtt:publish:test --prefix backend
npm run mqtt:publish:test --prefix backend -- --device esp32_01 --count 10 --interval-ms 1000
```

Se o backend iniciar avisando schema desatualizado para evidência, rode a migração sem reset:

```powershell
npm run db:migrate:evidence --prefix backend
```

Observações:

- `localhost:1883` funcionando não garante que o ESP32 consiga acessar
- TCP aberto não garante que o broker concluiu o protocolo MQTT
- `127.0.0.1`, `localhost` e `::1` são locais do próprio computador
- o ESP32 deve usar o IPv4 real do notebook na rede atual
- em rede institucional, ainda pode haver isolamento entre clientes mesmo com o bind correto
- no backend, logs `MQTT status recebido/processado` e `MQTT telemetry recebida/processada` confirmam tópico, device resolvido e persistência
- no dashboard, `lastSeenAt` deve acompanhar a hora de recebimento mesmo quando o ESP32 ainda não sincronizou NTP

### Validar F5 no frontend

Depois do login:

1. abra `/dashboard`, `/devices` ou `/devices/:id`
2. pressione F5
3. confirme que a tela fica em `Validando sessão...` e depois reabre sem exigir logout/login
4. se a organização salva no navegador estiver inválida, o app deve escolher uma membership válida do usuário
5. o realtime deve conectar somente depois dessa hidratacao

### Cenario B: hotspot do celular

- conecte notebook e ESP32 no mesmo hotspot
- use o IP do notebook nessa rede para broker e backend

### Cenario C: Wi-Fi da faculdade

- notebook e ESP32 precisam estar na mesma rede
- algumas redes institucionais podem bloquear comunicação entre clientes
- hotspot do celular costuma ser mais confiável para demo

### Cenário D: broker ou backend externos

- use domínio ou IP externo acessível pelo ESP32
- preencha credenciais quando necessário

## 13. Como testar em bancada o `MPU6050 + buzzer`

### Fluxo real de alerta via portal

Para validar `telemetria real -> evento MQTT -> alerta -> frontend -> buzzer` sem recompilar:

1. suba `npm run dev:broker --prefix backend`
2. suba `npm run dev --prefix backend`
3. suba `npm run dev --prefix frontend`
4. abra `npm run mqtt:watch --prefix backend`
5. abra `/devices/1` no frontend
6. grave e monitore o ESP32 novo na `COM5`:

```powershell
cd C:\Queda
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run -t upload --upload-port COM5
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" device monitor --port COM5 --baud 115200
```

7. confirme no boot `WHO_AM_I`, modelo da IMU, faixa efetiva e logs de buzzer
8. no portal `Q-ESP32-*`, abra a seção de pré-calibração experimental
9. selecione `teste/demonstração`
10. confirme que `Publicar eventos MQTT de alerta experimental` está habilitado
11. habilite o buzzer apenas se o módulo estiver ligado e a polaridade estiver correta
12. salve a pré-calibração
13. clique em `Testar buzzer` para validar o hardware local
14. se quiser validar a bateria no dashboard, preencha `Energia e bateria` com o percentual exibido pelo módulo externo; deixe em branco para validar `--%`/`não informado`
15. mova o conjunto `ESP32 + MPU6050/MPU6500/MPU9250` de forma controlada em bancada

O esperado:

- Serial mostra `[alert] fall_suspected ...` ou `[alert] movement_detected ...`
- watcher mostra `queda/devices/esp32_01/events`
- backend registra `MQTT event processado` e `alert:new`
- frontend atualiza ocorrências/alertas sem F5
- se o buzzer estiver habilitado, aparecem `[buzzer] test pulse start/end reason=portal_test` e `[buzzer] alert pulse start/end reason=...`
- telemetria continua publicando depois do alerta

Volte a sensibilidade para `normal` depois do teste. Não teste queda real em pessoa; use apenas movimento controlado do hardware em bancada.

### Motion test compile-time legado

O firmware tem um modo opcional de teste local.

Passo a passo:

1. abra [include/app_config.h](../include/app_config.h)
2. defina `MOTION_TEST_MODE_ENABLED = true`
3. habilite `BUZZER_ENABLED = true` apenas para esse teste controlado
4. revise `BUZZER_ACTIVE_HIGH` conforme a polaridade do módulo
5. ajuste thresholds se necessário
6. grave o firmware
7. abra o monitor serial
8. mova o conjunto `ESP32 + MPU6050`

Esse modo serve apenas para diagnóstico local e não muda o dashboard principal.

Na versão atual, o teste:

- arma depois de um curto repouso relativo
- por padrão exige `accel + gyro` acima do limiar juntos
- reduz apitos intermitentes por vibracao leve ou giro isolado

## 14. Como parar tudo

Quando terminar:

```powershell
.\scripts\stop-all.ps1
```

## 15. Erros comuns

### `Login falhou com o usuário demo`

Provável causa:

- seed não aplicado
- banco antigo ainda não foi recriado para o schema novo

Como resolver:

- rode `.\scripts\init-db.ps1`

### `O ESP32 não consegue parear`

Provável causa:

- `BACKEND_API_BASE_URL` inválida
- notebook não acessível na rede atual
- código expirado
- código já utilizado

Como resolver:

- use IP real do notebook ou backend externo acessível
- gere um novo código no dashboard
- confira se o device e o notebook estão na mesma rede

### `O ESP32 conecta no Wi-Fi, mas o dashboard continua offline`

Provável causa:

- broker MQTT inacessível
- `MQTT_HOST` configurado com `localhost`
- backend ouvindo outro broker
- device ainda sem claim na organização do usuário
- firewall/rede bloqueando o broker pelo IPv4 real
- timestamps antigos por NTP ainda não sincronizado em firmware antigo

Como resolver:

- use o IP real do notebook ou um broker externo
- no Windows, confirme `Test-NetConnection IP_DO_NOTEBOOK -Port 1883`
- confirme `npm run mqtt:test -- IP_DO_NOTEBOOK 1883`
- revise a seção MQTT do portal
- acompanhe os logs de ingestão MQTT no backend e procure `telemetry processada`

### `A COM5 está ocupada e o monitor/upload não funciona`

Provável causa:

- monitor serial antigo do `PlatformIO` ainda aberto
- processo `device monitor` órfão segurando a porta

Como resolver:

```powershell
.\scripts\free-serial-port.ps1 -Port COM5
```

O projeto agora também executa essa limpeza automaticamente antes do upload via `PlatformIO` no Windows. Mesmo assim, ainda vale rodar o script manualmente quando a IDE ficar com monitor serial preso.

Se a porta continuar ocupada:

- feche o monitor serial do VS Code
- feche terminais seriais externos
- tente novamente o script

### `Ainda preciso segurar BOOT para fazer upload`

No ESP32 novo com CP210x em `COM5`, o upload funcionou sem segurar `BOOT`. Portanto, para o hardware atual, trate falhas novas primeiro como problema de porta ocupada, cabo, driver, alimentação ou comando errado antes de assumir problema de boot.

Provável causa:

- a placa não está entrando automaticamente em modo de download
- a `COM` pode estar livre, mas o auto-reset de upload ainda não está funcionando corretamente no hardware/driver

O que isso significa:

- problema diferente de porta ocupada
- o firmware pode estar rodando e emitindo log normalmente, mesmo assim o upload automático falha

Estado histórico da placa anterior:

- a serial/log do ESP32 ficou acessível
- o upload voltou a funcionar quando `BOOT` foi mantido pressionado durante o `Connecting...`
- sem isso, o auto-reset ainda não estava confiável naquela placa

Procedimento prático somente para placas que ainda apresentem esse sintoma:

1. rode `.\scripts\free-serial-port.ps1 -Port COM5` ou substitua pela `COM` real
2. inicie o upload
3. segure `BOOT` durante `Connecting...`
4. solte quando a gravação efetivamente começar

### `O smoke test falhou mesmo com o login funcionando`

Provável causa:

- backend ou frontend não estavam rodando
- a resposta de login não trouxe `activeOrganizationId`
- houve regressão no filtro multi-tenant de `organization`, `patients`, `dashboard`, `devices` ou `alerts`
- o backend pode estar apontando para um banco antigo, ainda sem o schema multi-tenant atual

Como resolver:

- confirme o ambiente com `.\scripts\start-all.ps1`
- teste manualmente `http://localhost:4000/health`
- faça login pela UI e confirme se a organização ativa aparece na sidebar
- se o login responder `500`, rode `.\scripts\init-db.ps1`
- rode `.\scripts\smoke-test.ps1` novamente

### `A página ficou branca e o console mostra erro no AuthProvider`

Provável causa:

- o navegador ainda tem um `user` antigo salvo no `localStorage`
- esse objeto veio de uma versão anterior ao modelo multi-tenant atual e não tem `memberships` no formato esperado

Como resolver:

- recarregue a página uma vez
- se aparecer a tela de recuperação do frontend, clique em `Limpar sessão local e abrir login`
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
