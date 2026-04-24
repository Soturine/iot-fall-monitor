# Firmware e Hardware

Este documento concentra a documentacao embarcada do projeto: pinagem recomendada, ligacoes, detalhes do `MPU6050`, portal local do ESP32, pairing por codigo, payloads do firmware, parametros de calibracao e observacoes praticas de montagem e teste.

Para o fluxo completo com backend e frontend, consulte [integration.md](integration.md). Para setup geral do sistema, consulte o [README da raiz](../README.md). Para o passo a passo operacional no Windows, consulte [quickstart-windows.md](quickstart-windows.md).

## Ponto principal de configuracao do ESP32

O firmware hoje trabalha com duas camadas:

1. defaults e constantes em [include/app_config.h](../include/app_config.h)
2. configuracao persistida em `Preferences` / `NVS`

Na pratica:

- `include/app_config.h` guarda defaults de fabrica, pinos, limites e thresholds
- o portal local do ESP32 grava em `NVS` as redes Wi-Fi, MQTT, `DEVICE_ID`, `MQTT_CLIENT_ID`, `BACKEND_API_BASE_URL`, `deviceSyncToken` e o perfil resumido do paciente
- depois da primeira configuracao, voce normalmente nao precisa recompilar para mudar Wi-Fi, broker ou backend acessivel para pairing

### O que continua em `include/app_config.h`

- `DEFAULT_DEVICE_ID`
- `DEFAULT_WIFI_SSID`
- `DEFAULT_WIFI_PASSWORD`
- `DEFAULT_MQTT_HOST`
- `DEFAULT_MQTT_PORT`
- `DEFAULT_MQTT_USERNAME`
- `DEFAULT_MQTT_PASSWORD`
- `DEFAULT_MQTT_CLIENT_ID`
- `DEFAULT_BACKEND_API_BASE_URL`
- `DEFAULT_MQTT_USE_TLS`
- `DEFAULT_MQTT_TLS_INSECURE`
- `DEFAULT_MQTT_TLS_CA_CERT`
- `DEFAULT_MQTT_TOPIC_BASE`
- `FORCE_SETUP_MODE_ON_BOOT`
- `FIRMWARE_LOG_LEVEL`
- `FIRMWARE_I2C_DEBUG_ENABLED`
- `FIRMWARE_CONNECTIVITY_DEBUG_ENABLED`
- `FIRMWARE_EVENT_BUFFER_DEBUG_ENABLED`
- `DEVICE_PROFILE_SYNC_INTERVAL_MS`
- `DEVICE_PROFILE_SYNC_RETRY_INTERVAL_MS`
- `EVENT_BUFFER_PERSISTENCE_ENABLED`
- `PERSISTED_EVENT_BUFFER_CAPACITY`
- limites do portal, timeouts de fallback, pinos e thresholds do detector

## Estado atual do firmware

Plataforma e build:

- `platform = espressif32`
- `board = esp32dev`
- `framework = arduino`
- `monitor_speed = 115200`

Defaults atuais relevantes:

- `DEFAULT_DEVICE_ID = "esp32_01"`
- `DEFAULT_MQTT_HOST = "broker.hivemq.com"`
- `DEFAULT_MQTT_PORT = 1883`
- `DEFAULT_BACKEND_API_BASE_URL = ""`
- `DEFAULT_MQTT_USE_TLS = false`
- `MAX_WIFI_NETWORKS = 5`
- `BUZZER_ENABLED = true`
- `BUZZER_ACTIVE_HIGH = true`
- `SOS_BUTTON_ENABLED = false`
- `STATUS_LED_ENABLED = false`
- `MOTION_TEST_MODE_ENABLED = false`

Comandos uteis:

```bash
platformio run -e esp32dev
platformio device monitor -b 115200
```

No Windows, se a `COM` ficar ocupada por um monitor antigo do `PlatformIO`, use:

```powershell
.\scripts\free-serial-port.ps1 -Port COM4
```

Configuracao atual do sensor no boot:

- barramento `I2C` a `100 kHz`
- `WHO_AM_I` compativel com `0x68` (`MPU6050`) e fallback para `0x69` quando necessario
- acelerometro em faixa `+-8 g`
- giroscopio em faixa `+-500 dps`
- `DLPF` configurado para reduzir ruido de bancada

## Logs e diagnostico no firmware

O firmware agora usa um gating simples de logs em [include/app_config.h](../include/app_config.h):

- `FIRMWARE_LOG_LEVEL`
- `FIRMWARE_I2C_DEBUG_ENABLED`
- `FIRMWARE_CONNECTIVITY_DEBUG_ENABLED`
- `FIRMWARE_EVENT_BUFFER_DEBUG_ENABLED`
- `SERIAL_SENSOR_DEBUG_ENABLED`
- `MOTION_TEST_SERIAL_DEBUG_ENABLED`

Na pratica:

- falhas e mensagens importantes continuam aparecendo
- diagnosticos detalhados de I2C, buffer e conectividade podem ser ligados sem poluir o loop principal por padrao
- o `MOTION TEST` continua com flags proprias para bancada, mas agora fica desabilitado por padrao para nao misturar teste de bancada com alarme real

## Identidade do device e pairing

O firmware agora usa dois identificadores diferentes:

- `device_id`: nome operacional configuravel no portal e usado nos topicos MQTT
- `device_uid`: identidade tecnica estavel do ESP32, derivada do eFuse MAC

### O que isso resolve

- `device_id` pode mudar sem perder a identidade tecnica do hardware
- o backend consegue distinguir discovery tecnico de ownership real
- o claim usa `device_uid` + codigo temporario em vez de depender apenas de `device_id`

## Portal de configuracao e pairing

O portal local do ESP32 agora cobre:

- redes Wi-Fi
- broker MQTT, porta, usuario e senha
- `DEVICE_ID`
- `MQTT_CLIENT_ID`
- `BACKEND_API_BASE_URL`
- claim por codigo temporario
- bloco de saude operacional com `Wi-Fi conectado`, `MQTT OK`, `Backend API` e `Pronto para operar`
- botoes `Testar backend` e `Testar MQTT`
- visualizacao do perfil resumido do paciente sincronizado

Fluxo oficial:

1. o ESP32 liga
2. tenta usar as redes e o MQTT salvos em `NVS`
3. se falhar ou estiver sem configuracao valida, entra em `SETUP_MODE`
4. sobe o AP `Queda-Setup-*`
5. o usuario abre o portal
6. salva rede, broker e backend
7. opcionalmente pareia o device informando o codigo temporario gerado no dashboard
8. o ESP32 reinicia e tenta operar normalmente

### Como forcar o portal em bancada

Se voce quiser testar o AP local sem depender de falha real de conectividade:

1. abra [include/app_config.h](../include/app_config.h)
2. defina `FORCE_SETUP_MODE_ON_BOOT = true`
3. grave o firmware
4. reinicie o ESP32
5. procure a rede `Queda-Setup-*`

Depois do teste, volte `FORCE_SETUP_MODE_ON_BOOT = false` para restaurar o comportamento normal.

### Observacao importante sobre upload

Se a placa ainda exigir segurar `BOOT` durante o upload, isso indica que ela nao esta entrando automaticamente em modo de download. Nesta rodada, a serial e o log ficaram acessiveis, mas o auto-reset para upload ainda permaneceu dependente do hardware/driver da placa.

Estado validado nesta bancada:

- `COM4` voltou a aceitar upload depois que a porta foi liberada
- a gravacao da build nova funcionou quando `BOOT` foi mantido pressionado
- o problema restante nao e mais "porta ocupada", e sim auto-reset/entrada automatica em bootloader

## Captive portal e acesso pelo celular

Quando o ESP32 entra em setup:

- sobe `AP + WebServer + DNSServer`
- responde probes comuns de captive portal
- tenta redirecionar para `http://setup.queda/`
- continua acessivel manualmente em `http://192.168.4.1`

Na pratica, isso tende a funcionar melhor em:

- Android
- Windows

No iOS, a notificacao de "fazer login na rede" pode variar mais. Se ela nao aparecer:

- abra `http://setup.queda`
- ou abra `http://192.168.4.1`

### Saude operacional no portal

Como o portal existe principalmente em `SETUP_MODE`, a leitura de saude precisa ser honesta:

- `Wi-Fi conectado` usa o estado station atual do ESP32
- `MQTT OK` pode vir de conexao atual ou do ultimo `Testar MQTT`
- `Backend API` mostra validade da URL e ultimo `Testar backend`
- `Pronto para operar` so aparece quando configuracao, backend e MQTT ja responderam de forma coerente

Isso evita prometer que o device ja esta operando normalmente quando ele ainda esta apenas em fase de ajuste/configuracao.

## Telemetria e snapshot tecnico

Nesta baseline, a telemetria continua sendo publicada em alta frequencia, mas agora tambem leva:

- `battery_level`
- `wifi_rssi`

Com isso, o backend consegue manter bateria, RSSI e `lastSeenAt` mais coerentes nas telas sem depender apenas do `status` periodico.

## Buzzer e motion test

O buzzer recebeu dois ajustes conservadores:

- polaridade explicita via `BUZZER_ACTIVE_HIGH`
- `MOTION_TEST_MODE_ENABLED = false` por padrao

Na pratica:

- o alarme real por queda/SOS continua disponivel
- o teste de bancada deixa de ficar habilitado por padrao em uso normal
- se a placa usar buzzer ativo-low, a inversao agora pode ser tratada em `include/app_config.h` sem mexer na logica do alarme
- ou conecte no AP do ESP32 e tente abrir qualquer site

## Multiplas redes Wi-Fi e saude de conectividade

O ESP32 salva ate `5` redes Wi-Fi.

Comportamento atual:

- tenta as redes em ordem
- a primeira e tratada como preferida
- salvar o mesmo `SSID` atualiza a rede existente
- se nenhuma conectar, entra em `SETUP_MODE`

Estados logicos de conectividade:

- `NO_WIFI`
- `WIFI_CONNECTING`
- `WIFI_OK_MQTT_CONNECTING`
- `ONLINE`
- `SETUP_MODE`

O device so e considerado realmente operacional em `ONLINE`.

## Fallback automatico por falha de MQTT

O firmware tambem entra em setup quando:

- o `MQTT_HOST` estiver vazio, invalido ou apontando para loopback
- o Wi-Fi conectar, mas o MQTT falhar por tempo ou tentativas suficientes
- a configuracao estiver incompleta

Isso evita o estado ruim de "Wi-Fi ok, mas broker quebrado sem caminho claro de recuperacao".

## Persistencia leve de eventos criticos

O `EventBuffer` em RAM continua existindo como antes, mas agora o firmware tambem salva um snapshot pequeno dos eventos criticos pendentes em `NVS`.

Regras atuais:

- apenas eventos criticos do canal `events` entram nesse snapshot
- `telemetry` continua fora do `EventBuffer`
- o limite persistido e pequeno (`PERSISTED_EVENT_BUFFER_CAPACITY`)
- o objetivo e reduzir perda apos reboot rapido, sem transformar o ESP32 em um journal pesado

Limites importantes:

- esse snapshot nao substitui persistencia completa
- status periodico continua priorizando simplicidade e nao vira historico local completo
- ainda existe risco de perda em falhas muito abruptas entre evento e snapshot

## MQTT/TLS preparado, mas opt-in

O comportamento padrao do projeto continua sendo `MQTT` sem `TLS`, compativel com broker local simples.

Nesta rodada, o firmware ficou preparado para um caminho futuro com TLS por defaults em `app_config.h`:

- `DEFAULT_MQTT_USE_TLS`
- `DEFAULT_MQTT_TLS_INSECURE`
- `DEFAULT_MQTT_TLS_CA_CERT`

Uso previsto:

- manter `DEFAULT_MQTT_USE_TLS = false` para o fluxo atual
- usar `DEFAULT_MQTT_USE_TLS = true` apenas quando houver broker `mqtts://` coerente
- preferir CA valida quando possivel
- usar `DEFAULT_MQTT_TLS_INSECURE = true` apenas em cenarios de teste controlado

## Pairing pelo portal local

O portal possui uma secao especifica de pairing.

### O que o usuario informa

- `BACKEND_API_BASE_URL`
- `pairing_code`

### O que o firmware envia

- `device_uid`
- `device_id`
- `device_name`
- `pairing_code`

### Resultado esperado

- o backend valida o codigo
- faz o claim transacional
- devolve `deviceSyncToken` e o perfil resumido do paciente atual
- o device fica locked naquela organizacao
- se o codigo foi gerado com paciente inicial, o backend tambem cria o vinculo inicial

### UX atual do pairing no portal

O portal foi simplificado para o caminho que funciona de forma mais consistente em captive portal HTTP e no uso por celular:

- preencher `BACKEND_API_BASE_URL`
- preencher `pairing_code`
- clicar em `Parear agora`

Mensagens esperadas no portal:

- `Codigo expirado. Gere um novo no dashboard.`
- `Codigo invalido. Confira o valor informado.`
- `Codigo ja utilizado. Gere outro codigo.`
- `Nao foi possivel alcancar o backend nessa URL. Use o IP real do notebook na rede atual.`
- `Backend API invalida. Use o IP real do notebook na rede atual com http:// ou https://.`

## Perfil resumido do paciente no ESP32

Depois do claim e nas sincronizacoes posteriores, o ESP32 pode manter em `NVS` uma copia resumida do paciente atual do device.

Campos atuais:

- `patientName`
- `weightKg`
- `heightCm`
- `fallSensitivityPreset`
- `syncedAt`

Esses dados aparecem apenas como consulta no portal. O dashboard/back-end continuam sendo a fonte principal de cadastro e edicao de nome, peso e altura.

Observacao importante:

- `localhost`, `127.0.0.1` e `::1` nunca devem ser usados no ESP32
- se o backend estiver no notebook, use o IP real do notebook na rede atual

## Modo de teste MPU6050 + buzzer

O firmware inclui um modo opcional de bancada para validar:

- leitura do `MPU6050`
- funcionamento do buzzer
- resposta local do firmware a movimento brusco

Esse modo:

- usa `accel_magnitude` e `gyro_magnitude` ja calculados
- dispara um beep curto quando algum limiar configurado e ultrapassado
- respeita cooldown
- nao substitui a deteccao real de queda

### Onde habilitar

No arquivo [include/app_config.h](../include/app_config.h):

- `MOTION_TEST_MODE_ENABLED`
- `MOTION_TEST_SERIAL_DEBUG_ENABLED`
- `MOTION_TEST_REQUIRE_BOTH_THRESHOLDS`
- `MOTION_TEST_ARM_AFTER_STILLNESS_MS`
- `MOTION_TEST_STILL_ACCEL_TOLERANCE_G`
- `MOTION_TEST_STILL_GYRO_THRESHOLD_DPS`
- `MOTION_TEST_ACCEL_THRESHOLD_G`
- `MOTION_TEST_GYRO_THRESHOLD_DPS`
- `MOTION_TEST_BUZZER_DURATION_MS`
- `MOTION_TEST_COOLDOWN_MS`

### Como testar em bancada

1. habilite `MOTION_TEST_MODE_ENABLED = true`
2. mantenha `BUZZER_ENABLED = true`
3. grave o firmware
4. abra o monitor serial em `115200`
5. mova o conjunto `ESP32 + MPU6050`
6. quando o limiar for ultrapassado, o buzzer deve emitir um beep curto

### Comportamento atual esperado

- o teste so arma depois de um curto periodo de repouso relativo
- por padrao, `accel` e `gyro` precisam cruzar os limiares juntos
- isso reduz apitos intermitentes por vibracao leve, ruído ou giro isolado

## Pinagem recomendada

| Modulo / funcao | Pino no modulo | Pino no ESP32 | Uso no firmware | Observacoes |
|---|---|---:|---|---|
| `MPU6050` | `SDA` | `GPIO21` | ativo | barramento `I2C` principal |
| `MPU6050` | `SCL` | `GPIO22` | ativo | barramento `I2C` principal |
| `MPU6050` | `INT` | nao usado | inativo | pode ser aproveitado no futuro |
| `MPU6050` | `AD0` | `GND` | recomendado | mantem endereco `0x68` |
| Botao SOS | sinal | `GPIO27` | opcional | requer `SOS_BUTTON_ENABLED = true` |
| Buzzer ativo | `SIG` | `GPIO25` | opcional | hoje `BUZZER_ENABLED = true` |
| LED de status | anodo via resistor | `GPIO26` | opcional | requer `STATUS_LED_ENABLED = true` |

## Ligacoes recomendadas

### `MPU6050`

- `VCC -> 3V3`
- `GND -> GND`
- `SDA -> GPIO21`
- `SCL -> GPIO22`
- `AD0 -> GND`

Observacoes:

- o projeto trabalha normalmente com `AD0 -> GND`, mantendo endereco `0x68`
- se o modulo estiver em `0x69`, confira `AD0` e a montagem fisica
- o firmware consegue lidar com esse fallback no barramento

### Botao SOS

- um terminal em `GPIO27`
- outro terminal em `GND`

### Buzzer

- `SIG -> GPIO25`
- `VCC -> 3V3` se o modulo for compativel com `3.3 V`
- `GND -> GND`

### LED de status

- `GPIO26 -> resistor -> anodo`
- `catodo -> GND`

## O que cada pino do MPU6050 faz aqui

### Pinos usados

- `VCC` e `GND`: alimentacao
- `SDA` e `SCL`: comunicacao `I2C`
- `AD0`: define endereco `0x68` ou `0x69`

### Pinos nao usados por enquanto

- `INT`: o firmware atual trabalha em polling
- `XDA` e `XCL`: barramento auxiliar do `MPU6050`, sem uso no projeto atual
- sensor de temperatura interno: nao participa do contrato MQTT atual

## Payloads do firmware

Todos os payloads sao `JSON` em `snake_case`.

### Evento de queda

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

### Status periodico

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

### Telemetria periodica

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
  "roll_deg": 2.7
}
```

Observacoes relevantes:

- `battery_level` ainda e placeholder
- `telemetry` nao entra no `EventBuffer`
- o modo de teste `MPU6050 + buzzer` nao altera payloads
- os topicos continuam `queda/devices/{deviceId}/{canal}`

## Parametros atuais de calibracao do `fall_detector`

| Parametro | Valor atual | Efeito principal |
|---|---:|---|
| `ACCEL_FILTER_ALPHA` | `0.75` | suavizacao do acelerometro |
| `GYRO_FILTER_ALPHA` | `0.75` | suavizacao do giroscopio |
| `IMPACT_THRESHOLD_G` | `2.2` | impacto minimo em `g` |
| `IMPACT_GYRO_THRESHOLD_DPS` | `120.0` | giro minimo no impacto |
| `ORIENTATION_CHANGE_THRESHOLD_DEG` | `45.0` | mudanca minima de postura |
| `IMMOBILE_ACCEL_TOLERANCE_G` | `0.15` | tolerancia em torno de `1 g` para repouso |
| `IMMOBILE_GYRO_THRESHOLD_DPS` | `15.0` | giro maximo para considerar imobilidade |
| `ORIENTATION_WINDOW_MS` | `1500` | janela para detectar mudanca de orientacao |
| `IMMOBILITY_WINDOW_MS` | `4000` | janela total de confirmacao |
| `REQUIRED_IMMOBILITY_MS` | `2000` | tempo minimo de imobilidade sustentada |

### Como cada ajuste afeta o detector

- aumentar `IMPACT_THRESHOLD_G` ou `IMPACT_GYRO_THRESHOLD_DPS` reduz sensibilidade e tende a cortar falso positivo
- aumentar `ORIENTATION_CHANGE_THRESHOLD_DEG` ajuda a evitar alerta em sentar ou deitar
- reduzir `IMMOBILE_ACCEL_TOLERANCE_G` exige repouso mais limpo
- reduzir `IMMOBILE_GYRO_THRESHOLD_DPS` exige menos micro-movimento para confirmar imobilidade
- aumentar `REQUIRED_IMMOBILITY_MS` torna a confirmacao mais conservadora
- aumentar `ACCEL_FILTER_ALPHA` e `GYRO_FILTER_ALPHA` suaviza ruido, mas deixa a resposta menos rapida

### Preset conservador sugerido

Use como ponto de partida se o prototipo estiver alarmando em movimentos mais bruscos do dia a dia:

```cpp
constexpr float ACCEL_FILTER_ALPHA = 0.82f;
constexpr float GYRO_FILTER_ALPHA = 0.82f;
constexpr float IMPACT_THRESHOLD_G = 2.6f;
constexpr float IMPACT_GYRO_THRESHOLD_DPS = 150.0f;
constexpr float ORIENTATION_CHANGE_THRESHOLD_DEG = 55.0f;
constexpr float IMMOBILE_ACCEL_TOLERANCE_G = 0.12f;
constexpr float IMMOBILE_GYRO_THRESHOLD_DPS = 10.0f;
constexpr unsigned long ORIENTATION_WINDOW_MS = 1200;
constexpr unsigned long IMMOBILITY_WINDOW_MS = 4500;
constexpr unsigned long REQUIRED_IMMOBILITY_MS = 2500;
```

### Preset sensivel sugerido

Use como ponto de partida se o sistema estiver perdendo eventos em simulacoes controladas:

```cpp
constexpr float ACCEL_FILTER_ALPHA = 0.68f;
constexpr float GYRO_FILTER_ALPHA = 0.68f;
constexpr float IMPACT_THRESHOLD_G = 1.9f;
constexpr float IMPACT_GYRO_THRESHOLD_DPS = 90.0f;
constexpr float ORIENTATION_CHANGE_THRESHOLD_DEG = 35.0f;
constexpr float IMMOBILE_ACCEL_TOLERANCE_G = 0.18f;
constexpr float IMMOBILE_GYRO_THRESHOLD_DPS = 18.0f;
constexpr unsigned long ORIENTATION_WINDOW_MS = 1800;
constexpr unsigned long IMMOBILITY_WINDOW_MS = 4500;
constexpr unsigned long REQUIRED_IMMOBILITY_MS = 1800;
```

## Modulos do firmware

| Modulo | Arquivos principais | Funcao real no projeto |
|---|---|---|
| `app_config` | `include/app_config.h` | defaults, pinos, intervalos, limites e thresholds |
| `device_config` | `include/device_config.h`, `src/device_config.cpp` | identidade do device, topicos e validacao de configuracao |
| `config_store` | `include/config_store.h`, `src/config_store.cpp` | persistencia em `NVS` |
| `setup_portal` | `include/setup_portal.h`, `src/setup_portal.cpp` | AP, captive portal, configuracao e pairing |
| `connectivity_manager` | `include/connectivity_manager.h`, `src/connectivity_manager.cpp` | estados Wi-Fi + MQTT e fallback para setup |
| `patient_profile_client` | `include/patient_profile_client.h`, `src/patient_profile_client.cpp` | sincronizacao do perfil resumido do paciente via backend HTTP |
| `sensor_mpu6050` | `include/sensor_mpu6050.h`, `src/sensor_mpu6050.cpp` | leitura do sensor e calculo das magnitudes |
| `fall_detector` | `include/fall_detector.h`, `src/fall_detector.cpp` | maquina de estados da queda |
| `mqtt_client` | `include/mqtt_client.h`, `src/mqtt_client.cpp` | publicacao MQTT |
| `event_buffer` | `include/event_buffer.h`, `src/event_buffer.cpp` | reenvio local de `events` e `status` |
| `buzzer_led` | `include/buzzer_led.h`, `src/buzzer_led.cpp` | sinalizacao sonora/visual e pulso do motion test |
| `main` | `src/main.cpp` | integracao do loop principal |

## Como preencher MQTT e backend em cada ambiente

### Cenario A: broker local no notebook

- `MQTT_HOST` deve ser o IP real do notebook
- `BACKEND_API_BASE_URL` tambem deve apontar para o IP real do notebook
- nunca use `localhost` no ESP32

### Cenario B: hotspot do celular

- conecte notebook e ESP32 no mesmo hotspot
- use o IP do notebook naquela rede para broker e backend
- costuma ser o melhor cenario para demo

### Cenario C: Wi-Fi da faculdade

- notebook e ESP32 precisam estar na mesma rede
- use o IP do notebook naquela rede
- algumas redes institucionais isolam clientes e podem impedir o pairing e o MQTT

### Cenario D: broker e backend externos

- use dominio ou IP acessivel pelo ESP32
- preencha autenticacao MQTT quando necessario
- e o modo mais simples para demonstracao fora da rede do notebook

## Observacoes praticas de montagem e teste

- fixe o `MPU6050` com rigidez mecanica
- mantenha `GND` comum entre todos os modulos
- deixe o dispositivo parado por alguns segundos apos ligar
- confira `AD0` se o sensor nao responder
- o snapshot em `NVS` reduz perda de eventos criticos apos reboot, mas nao substitui persistencia completa
- o fluxo padrao continua em MQTT sem `TLS`; a preparacao para TLS existe, mas fica desligada por default

## Datasheets e referencias tecnicas

| Componente | Referencia | Link |
|---|---|---|
| `ESP32-WROOM-32` | Datasheet oficial | <https://documentation.espressif.com/esp32-wroom-32_datasheet_en.html> |
| `ESP32 DevKitC` | Guia da placa | <https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html> |
| `MPU6050` | Datasheet oficial | <https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Datasheet.pdf> |
