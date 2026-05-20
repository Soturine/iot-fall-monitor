# Relatorio de bancada do Motion Test

Data: 2026-04-07  
Projeto: Sistema IoT de Deteccao de Quedas com ESP32  
Porta observada: `COM4`

Nota atual v0.8.12: este documento preserva observações historicas de bancada. O SSID atual do portal passou a ser `Q-ESP32-*`, `SETUP_PORTAL_ALWAYS_ON = true` pode manter o AP de manutenção ativo em paralelo ao Wi-Fi/MQTT, e o buzzer agora fica desabilitado por padrão com `BUZZER_ENABLED = false`.

## Objetivo

Verificar a viabilidade do teste local de:

- `MOTION TEST` do `MPU6050 + buzzer`
- portal local/AP de configuração do ESP32
- fluxo de configuração Wi-Fi para uso em case

## Contexto observado

- o dispositivo foi identificado no Windows como `USB-Enhanced-SERIAL CH9102 (COM4)`
- o firmware compilou com sucesso depois dos ajustes desta rodada
- havia um monitor `PlatformIO` orfao segurando a `COM4`
- depois da limpeza da porta, foi possível ler logs reais do ESP32 pela serial
- a gravação automática ainda não foi concluida porque o chip não entrou sozinho em modo de download

## Avanco real desta rodada

Foi possível separar dois problemas diferentes:

1. porta serial ocupada
2. upload automático sem entrar em bootloader

Tambem houve um terceiro avanco importante:

3. a nova build foi gravada com sucesso na placa quando o botão `BOOT` foi segurado manualmente
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

O fluxo de upload do `PlatformIO` no Windows agora também executa a limpeza da porta automaticamente antes da gravação.

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

Essa falha foi corrigida no código local desta rodada.

## Gravacao da nova build

Status desta iteracao:

- a nova build local foi gravada com sucesso na `COM4`
- isso só funcionou quando o botão `BOOT` foi mantido pressionado durante o `Connecting...`
- portanto o firmware novo já foi enviado para a placa

## Boot limpo após a gravação

Depois da gravação:

- um boot limpo da placa iniciou a aplicação normalmente
- o boot observado foi `SPI_FAST_FLASH_BOOT`
- a aplicação subiu sem repetir o `Guru Meditation Error` anterior

Trecho relevante observado na serial:

- `IMU inicializada com sucesso`
- `Modo de teste MPU6050 + buzzer habilitado`
- `=== SETUP MODE ===`
- `AP de configuração: Queda-Setup-077000-esp32_01`
- `Motivo: Nenhuma rede Wi-Fi válida foi encontrada`

### Conclusao desta parte

Isso confirma que:

- a build nova esta efetivamente rodando na placa
- o crash loop visto antes pertencia a uma build antiga
- o portal/AP agora deve estar disponível no hardware quando o device estiver em `SETUP_MODE`

## Estado atual do upload

### O que funcionou

- liberar a `COM4`
- compilar o firmware
- gravar a nova build segurando `BOOT`
- reiniciar em boot normal e observar a nova build entrando em `SETUP_MODE`

### O que ainda não ficou resolvido

- upload automático sem segurar `BOOT`
- entrada automática em modo de download pela placa

Interpretacao atual:

- o bloqueio principal deixou de ser a porta ocupada
- o ponto fraco restante esta no auto-reset/bootloader da placa `CH9102`

## Diagnostico histórico do AP de setup

### Comportamento observado na epoca

Naquela build, o AP `Queda-Setup-*` não ficava visivel o tempo todo.

Na versão atual, o SSID esperado e `Q-ESP32-*`. Com `SETUP_PORTAL_ALWAYS_ON = true`, esse AP pode ficar ativo como manutenção mesmo quando o device continua tentando Wi-Fi/MQTT.

Na build historica deste relatório, ele subia apenas quando o ESP32 entrava em `SETUP_MODE`, por exemplo quando:

- não existe nenhuma rede Wi-Fi válida salva
- a configuração MQTT e inválida
- o Wi-Fi conecta, mas o MQTT falha repetidamente
- `FORCE_SETUP_MODE_ON_BOOT = true`

### Conclusao

Se o ESP32 não mostrou a rede de setup durante o teste, isso por si só não indica falha do portal. O comportamento mais provavel era:

- o dispositivo ainda estava com configuração válida salva em `NVS`
- portanto ele não entrou em `SETUP_MODE`

No hardware atual, apareceu ainda um segundo fator:

- a build gravada no ESP32 entra em crash loop antes de estabilizar o setup

Isso também ajuda a explicar por que o AP parecia não ficar disponível de forma confiável.

## Diagnostico do Motion Test

### Problema percebido

O buzzer estava apitando de forma intermitente e não necessariamente em um movimento claramente brusco.

### Causa mais provavel no firmware anterior

O modo de teste anterior disparava beep quando:

- `accel_magnitude >= threshold`
- ou `gyro_magnitude >= threshold`

Isso deixava o teste sensivel demais a:

- giro isolado
- vibracao
- ruído mecanico do case
- pequenos movimentos sem impacto claro

### Ajuste aplicado nesta rodada

O `MOTION TEST` foi refinado para bancada:

- agora pode exigir `accel + gyro` juntos
- só arma depois de um curto periodo de repouso relativo
- ganhou thresholds mais conservadores por padrão
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

Nesta rodada também:

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

## Como testar o AP de manutenção agora

### Opcao mais simples para bancada

1. abrir [include/app_config.h](../include/app_config.h)
2. manter `SETUP_PORTAL_ALWAYS_ON = true`
3. compilar e gravar no ESP32
4. reiniciar a placa
5. procurar a rede `Q-ESP32-*`
6. abrir `http://setup.queda` ou `http://192.168.4.1`

### Depois do teste

1. voltar `FORCE_SETUP_MODE_ON_BOOT = false`
2. se quiser o comportamento antigo, definir `SETUP_PORTAL_ALWAYS_ON = false`
3. gravar novamente o firmware
4. deixar o device operar normalmente

## Como testar o Motion Test em bancada

1. habilitar `MOTION_TEST_MODE_ENABLED = true`
2. habilitar `BUZZER_ENABLED = true` apenas para esse teste controlado
3. colocar o dispositivo parado por pelo menos ~1 segundo
4. executar um movimento curto e mais brusco
5. observar o beep curto e o monitor serial

### O que esperar agora

- menos apitos intermitentes em vibracao leve
- beep mais associado a um gesto realmente brusco
- necessidade de partir de um estado relativamente parado antes do disparo

## Limitações desta sessão

- foi possível validar a leitura de log na `COM4`
- foi possível gravar a nova build na placa segurando `BOOT`
- o auto-reset ainda não ficou resolvido sem ajuda manual
- houve uma tentativa intermediária que deixou a serial em `DOWNLOAD_BOOT`, mas isso foi superado com um boot limpo posterior
- o `MOTION TEST` em repouso não mostrou falso disparo nesta janela de observação
- a verificação física final agora depende principalmente de:
  - conectar ao AP `Q-ESP32-*`
  - configurar Wi-Fi/MQTT
  - repetir o teste de gesto brusco no case

## Recomendacao prática imediata

1. fechar qualquer monitor serial aberto no VS Code / PlatformIO
2. rodar `.\scripts\free-serial-port.ps1 -Port COM4`
3. iniciar o upload e segurar `BOOT` durante `Connecting...`
4. depois da gravação, dar um boot limpo na placa
5. procurar e conectar no AP `Q-ESP32-*`
6. abrir `http://setup.queda` ou `http://192.168.4.1`
7. configurar Wi-Fi/MQTT
8. depois testar o `MOTION TEST` com o dispositivo em repouso antes do movimento
