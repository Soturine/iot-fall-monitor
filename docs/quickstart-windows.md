# Quickstart no Windows

Este guia foi pensado para uso no Windows com VS Code e PowerShell. Ele cobre o fluxo real atual do projeto: ambiente local, banco multi-tenant, dashboard por organizacao, mock publisher e pairing do ESP32 por codigo temporario.

Antes de continuar, vale ter em mao tambem:

- [README.md](../README.md)
- [firmware-hardware.md](firmware-hardware.md)
- [integration.md](integration.md)

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
MQTT_BROKER_URL=mqtt://localhost:1883
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
- backend, frontend e broker local usam `localhost` apenas no notebook
- isso nao vale para o ESP32 fisico
- `mqtts://...` ficou preparado de forma opt-in, mas o fluxo padrao continua sendo `mqtt://localhost:1883`

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
- broker dev em `mqtt://localhost:1883`

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

## 11. Como parear um ESP32 real

### Passo 1: gravar o firmware

Compile e grave o firmware no ESP32.

### Passo 2: configurar rede e MQTT no portal

Se o device entrar em `SETUP_MODE`:

1. conecte no AP `Queda-Setup-*`
2. abra `http://setup.queda` ou `http://192.168.4.1`
3. cadastre Wi-Fi
4. preencha `MQTT_HOST`, `MQTT_PORT`, usuario/senha se houver
5. preencha `DEVICE_ID`, `MQTT_CLIENT_ID` e `BACKEND_API_BASE_URL`

Se voce estiver em bancada e quiser testar o portal mesmo com configuracao ja salva:

1. abra [include/app_config.h](../include/app_config.h)
2. defina `FORCE_SETUP_MODE_ON_BOOT = true`
3. grave o firmware
4. reinicie o ESP32
5. procure a rede `Queda-Setup-*`

### Passo 3: gerar codigo de pairing no dashboard

No site:

1. abra `Devices`
2. clique em `Parear dispositivo`
3. opcionalmente escolha um paciente inicial
4. gere o codigo temporario

### Passo 4: concluir o claim no portal do ESP32

No portal do ESP32:

1. abra a secao de pairing
2. confirme `BACKEND_API_BASE_URL`
3. cole o codigo temporario
4. envie

Se tudo estiver correto:

- o backend faz o claim
- o device passa para `claimed`
- ele fica locked na organizacao
- se o pairing code tinha paciente inicial, o assignment ja fica criado
- o ESP32 salva `deviceSyncToken` e o perfil resumido do paciente atual em `NVS`

### Opcao rapida com QR

O modal `Parear dispositivo` agora tambem mostra:

- `pairingCode`
- URL sugerida do backend na rede atual
- QR code

No portal do ESP32 voce pode:

1. escanear o QR quando o navegador suportar camera
2. usar `Importar dados do QR` em cenarios tecnicos
3. ou continuar no fluxo manual de URL + codigo

## 12. Como preencher MQTT e backend corretamente no ESP32

### Cenario A: broker local no notebook

- `MQTT_HOST` = IP real do notebook
- `BACKEND_API_BASE_URL` = `http://IP-DO-NOTEBOOK:4000`
- nunca use `localhost` no ESP32

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
3. confirme `BUZZER_ENABLED = true`
4. ajuste thresholds se necessario
5. grave o firmware
6. abra o monitor serial
7. mova o conjunto `ESP32 + MPU6050`

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

### `O ESP32 conecta no Wi-Fi, mas volta ao setup`

Provavel causa:

- broker MQTT inacessivel
- `MQTT_HOST` configurado com `localhost`

Como resolver:

- use o IP real do notebook ou um broker externo
- revise a secao MQTT do portal

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
