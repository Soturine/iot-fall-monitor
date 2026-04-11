# Relatorio de bancada do Motion Test

Data: 2026-04-07  
Projeto: Sistema IoT de Deteccao de Quedas com ESP32  
Porta observada: `COM4`

## Objetivo

Verificar a viabilidade do teste local de:

- `MOTION TEST` do `MPU6050 + buzzer`
- portal local/AP de configuracao do ESP32
- fluxo de configuracao Wi-Fi para uso em case

## Contexto observado

- o dispositivo foi identificado no Windows como `USB-Enhanced-SERIAL CH9102 (COM4)`
- o firmware compilou com sucesso depois dos ajustes desta rodada
- havia um monitor `PlatformIO` orfao segurando a `COM4`
- depois da limpeza da porta, foi possivel ler logs reais do ESP32 pela serial
- a gravacao automatica ainda nao foi concluida porque o chip nao entrou sozinho em modo de download

## Avanco real desta rodada

Foi possivel separar dois problemas diferentes:

1. porta serial ocupada
2. upload automatico sem entrar em bootloader

Tambem houve um terceiro avanco importante:

3. a nova build foi gravada com sucesso na placa quando o botao `BOOT` foi segurado manualmente
4. depois de um boot limpo, a nova build iniciou normalmente e entrou em `SETUP_MODE`

### Porta serial

O problema de porta ocupada foi rastreado a processos `platformio device monitor -p COM4`.

Foi criado o helper:

- [scripts/free-serial-port.ps1](../scripts/free-serial-port.ps1)
- [scripts/pio-pre-upload.py](../scripts/pio-pre-upload.py)

Uso:

```powershell
.\scripts\free-serial-port.ps1 -Port COM4
```

Depois dessa limpeza, a `COM4` voltou a aceitar abertura e upload.

O fluxo de upload do `PlatformIO` no Windows agora tambem executa a limpeza da porta automaticamente antes da gravacao.

### Log real capturado do hardware

Depois de liberar a porta, a serial mostrou que a placa atual entra em loop de reboot com:

- `Preferences.cpp: begin(): nvs_open failed: NOT_FOUND`
- `Guru Meditation Error`

O backtrace decodificado apontou a raiz real para:

- `PubSubClient::disconnect()`
- `DeviceMqttClient::disconnect()`
- `ConnectivityManager::enterSetupMode()`

Ou seja:

- a placa atual estava com uma build antiga
- ela tentava entrar em `SETUP_MODE`
- e quebrava ao chamar `disconnect()` antes do cliente MQTT estar corretamente preparado

Essa falha foi corrigida no codigo local desta rodada.

## Gravacao da nova build

Status desta iteracao:

- a nova build local foi gravada com sucesso na `COM4`
- isso so funcionou quando o botao `BOOT` foi mantido pressionado durante o `Connecting...`
- portanto o firmware novo ja foi enviado para a placa

## Boot limpo apos a gravacao

Depois da gravacao:

- um boot limpo da placa iniciou a aplicacao normalmente
- o boot observado foi `SPI_FAST_FLASH_BOOT`
- a aplicacao subiu sem repetir o `Guru Meditation Error` anterior

Trecho relevante observado na serial:

- `IMU inicializada com sucesso`
- `Modo de teste MPU6050 + buzzer habilitado`
- `=== SETUP MODE ===`
- `AP de configuracao: Queda-Setup-077000-esp32_01`
- `Motivo: Nenhuma rede Wi-Fi valida foi encontrada`

### Conclusao desta parte

Isso confirma que:

- a build nova esta efetivamente rodando na placa
- o crash loop visto antes pertencia a uma build antiga
- o portal/AP agora deve estar disponivel no hardware quando o device estiver em `SETUP_MODE`

## Estado atual do upload

### O que funcionou

- liberar a `COM4`
- compilar o firmware
- gravar a nova build segurando `BOOT`
- reiniciar em boot normal e observar a nova build entrando em `SETUP_MODE`

### O que ainda nao ficou resolvido

- upload automatico sem segurar `BOOT`
- entrada automatica em modo de download pela placa

Interpretacao atual:

- o bloqueio principal deixou de ser a porta ocupada
- o ponto fraco restante esta no auto-reset/bootloader da placa `CH9102`

## Diagnostico do AP de setup

### Comportamento real atual do firmware

O AP `Queda-Setup-*` nao fica visivel o tempo todo.

Ele sobe apenas quando o ESP32 entra em `SETUP_MODE`, por exemplo quando:

- nao existe nenhuma rede Wi-Fi valida salva
- a configuracao MQTT e invalida
- o Wi-Fi conecta, mas o MQTT falha repetidamente
- `FORCE_SETUP_MODE_ON_BOOT = true`

### Conclusao

Se o ESP32 nao mostrou a rede de setup durante o teste, isso por si so nao indica falha do portal. O comportamento mais provavel era:

- o dispositivo ainda estava com configuracao valida salva em `NVS`
- portanto ele nao entrou em `SETUP_MODE`

No hardware atual, apareceu ainda um segundo fator:

- a build gravada no ESP32 entra em crash loop antes de estabilizar o setup

Isso tambem ajuda a explicar por que o AP parecia nao ficar disponivel de forma confiavel.

## Diagnostico do Motion Test

### Problema percebido

O buzzer estava apitando de forma intermitente e nao necessariamente em um movimento claramente brusco.

### Causa mais provavel no firmware anterior

O modo de teste anterior disparava beep quando:

- `accel_magnitude >= threshold`
- ou `gyro_magnitude >= threshold`

Isso deixava o teste sensivel demais a:

- giro isolado
- vibracao
- ruido mecanico do case
- pequenos movimentos sem impacto claro

### Ajuste aplicado nesta rodada

O `MOTION TEST` foi refinado para bancada:

- agora pode exigir `accel + gyro` juntos
- so arma depois de um curto periodo de repouso relativo
- ganhou thresholds mais conservadores por padrao
- ganhou cooldown mais folgado para reduzir repeticao

## Mudancas aplicadas no firmware

Arquivos alterados:

- [include/app_config.h](../include/app_config.h)
- [platformio.ini](../platformio.ini)
- [src/config_store.cpp](../src/config_store.cpp)
- [src/connectivity_manager.cpp](../src/connectivity_manager.cpp)
- [src/mqtt_client.cpp](../src/mqtt_client.cpp)
- [src/main.cpp](../src/main.cpp)

### Novos pontos relevantes

Em [include/app_config.h](../include/app_config.h):

- `FORCE_SETUP_MODE_ON_BOOT`
- `MOTION_TEST_REQUIRE_BOTH_THRESHOLDS`
- `MOTION_TEST_ARM_AFTER_STILLNESS_MS`
- `MOTION_TEST_STILL_ACCEL_TOLERANCE_G`
- `MOTION_TEST_STILL_GYRO_THRESHOLD_DPS`

Nesta rodada tambem:

- [src/mqtt_client.cpp](../src/mqtt_client.cpp) passou a inicializar explicitamente o `PubSubClient` com `WiFiClient`
- [src/config_store.cpp](../src/config_store.cpp) deixou de abrir `Preferences` em modo somente leitura no primeiro boot, reduzindo o erro `NOT_FOUND`
- [platformio.ini](../platformio.ini) ganhou `monitor_dtr = 0` e `monitor_rts = 0` para reduzir efeitos ruins do monitor serial sobre o ESP32

### Defaults desta rodada

- `FORCE_SETUP_MODE_ON_BOOT = false`
- `MOTION_TEST_REQUIRE_BOTH_THRESHOLDS = true`
- `MOTION_TEST_ARM_AFTER_STILLNESS_MS = 700`
- `MOTION_TEST_ACCEL_THRESHOLD_G = 2.10`
- `MOTION_TEST_GYRO_THRESHOLD_DPS = 140.0`
- `MOTION_TEST_COOLDOWN_MS = 1200`

## Como testar o AP de setup agora

### Opcao mais simples para bancada

1. abrir [include/app_config.h](../include/app_config.h)
2. definir `FORCE_SETUP_MODE_ON_BOOT = true`
3. compilar e gravar no ESP32
4. reiniciar a placa
5. procurar a rede `Queda-Setup-*`
6. abrir `http://setup.queda` ou `http://192.168.4.1`

### Depois do teste

1. voltar `FORCE_SETUP_MODE_ON_BOOT = false`
2. gravar novamente o firmware
3. deixar o device operar normalmente

## Como testar o Motion Test em bancada

1. manter `MOTION_TEST_MODE_ENABLED = true`
2. manter `BUZZER_ENABLED = true`
3. colocar o dispositivo parado por pelo menos ~1 segundo
4. executar um movimento curto e mais brusco
5. observar o beep curto e o monitor serial

### O que esperar agora

- menos apitos intermitentes em vibracao leve
- beep mais associado a um gesto realmente brusco
- necessidade de partir de um estado relativamente parado antes do disparo

## Limitacoes desta sessao

- foi possivel validar a leitura de log na `COM4`
- foi possivel gravar a nova build na placa segurando `BOOT`
- o auto-reset ainda nao ficou resolvido sem ajuda manual
- houve uma tentativa intermediaria que deixou a serial em `DOWNLOAD_BOOT`, mas isso foi superado com um boot limpo posterior
- o `MOTION TEST` em repouso nao mostrou falso disparo nesta janela de observacao
- a verificacao fisica final agora depende principalmente de:
  - conectar ao AP `Queda-Setup-*`
  - configurar Wi-Fi/MQTT
  - repetir o teste de gesto brusco no case

## Recomendacao pratica imediata

1. fechar qualquer monitor serial aberto no VS Code / PlatformIO
2. rodar `.\scripts\free-serial-port.ps1 -Port COM4`
3. iniciar o upload e segurar `BOOT` durante `Connecting...`
4. depois da gravacao, dar um boot limpo na placa
5. procurar e conectar no AP `Queda-Setup-*`
6. abrir `http://setup.queda` ou `http://192.168.4.1`
7. configurar Wi-Fi/MQTT
8. depois testar o `MOTION TEST` com o dispositivo em repouso antes do movimento
