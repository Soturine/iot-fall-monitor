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
- `SETUP_AP_SSID_PREFIX`
- `SETUP_PORTAL_ALWAYS_ON`
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
- `SETUP_AP_SSID_PREFIX = "Q-ESP32"`
- `SETUP_PORTAL_ALWAYS_ON = true`
- `BUZZER_ENABLED = false`
- `BUZZER_ACTIVE_HIGH = false`
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

Configuracao desejada do sensor no boot:

- barramento `I2C` a `100 kHz`
- leituras de registrador com STOP condition por padrao (`I2C_USE_REPEATED_START = false`)
- `WHO_AM_I` compativel com `0x68` (`MPU6050`) e fallback para `0x69` quando necessario
- acelerometro em faixa `+-8 g`
- giroscopio em faixa `+-500 dps`
- `DLPF` configurado para reduzir ruido de bancada

Depois de escrever os registradores, o firmware le `ACCEL_CONFIG` e `GYRO_CONFIG` de volta e usa a faixa efetiva para converter raw em unidade fisica. Se o acelerometro permanecer em `+-2 g`, o divisor usado sera `16384 LSB/g`; se `+-8 g` for realmente aplicado, sera `4096 LSB/g`. Isso evita repouso aparecendo como `4 g` por divisor incompatível.

O sensor e considerado pronto quando o firmware encontra um `WHO_AM_I` compativel e consegue fazer uma leitura raw basica. Falhas de readback de escala ou calibracao nao deixam mais `sensor_ready=0`: o firmware registra o motivo, usa divisor fallback coerente e continua publicando telemetria sem offsets.

### Estabilidade I2C do MPU6050

O erro serial `requestFrom(): i2cWriteReadNonStop returned Error -1` costuma aparecer quando o caminho repeated-start do `Wire` falha no barramento. Em bancada, a configuracao atual evita depender desse modo:

- `I2C_CLOCK_HZ = 100000`
- `I2C_USE_REPEATED_START = false`
- `I2C_READ_RETRY_COUNT = 3`
- `SENSOR_I2C_RECOVERY_FAILURE_THRESHOLD = 8`

Quando houver falhas consecutivas, o firmware registra um resumo throttled, reinicia o barramento I2C, reconfigura o MPU6050 e nao recalibra em loop. Se o recovery falhar, a ultima amostra valida fica preservada por uma janela curta. O status MQTT continua levando diagnostico do sensor; a telemetria periodica so e publicada quando houver amostra valida e fresca.

Checklist fisico antes de investigar software:

- confirme GND comum entre ESP32 e MPU6050
- confirme VCC do modulo conforme a placa usada
- confira SDA/SCL nos pinos definidos em `I2C_SDA_PIN` e `I2C_SCL_PIN`
- use fios curtos e firmes
- evite mau contato em protoboard
- teste outro modulo MPU6050 se o erro persistir
- mantenha alimentacao estavel e clock I2C em `100 kHz`

## Logs e diagnostico no firmware

O firmware agora usa um gating simples de logs em [include/app_config.h](../include/app_config.h):

- `FIRMWARE_LOG_LEVEL`
- `FIRMWARE_I2C_DEBUG_ENABLED`
- `FIRMWARE_CONNECTIVITY_DEBUG_ENABLED`
- `FIRMWARE_EVENT_BUFFER_DEBUG_ENABLED`
- `FIRMWARE_SENSOR_DIAGNOSTIC_ENABLED`
- `FIRMWARE_TELEMETRY_DIAGNOSTIC_ENABLED`
- `SERIAL_SENSOR_DEBUG_ENABLED`
- `MOTION_TEST_SERIAL_DEBUG_ENABLED`

Na pratica:

- falhas e mensagens importantes continuam aparecendo
- diagnosticos detalhados de I2C, buffer e conectividade podem ser ligados sem poluir o loop principal por padrao
- com `FIRMWARE_CONNECTIVITY_DEBUG_ENABLED = true`, o firmware registra host/porta/clientId MQTT efetivos, topicos de `status`, `telemetry` e `events`, e resultado de publish sem expor senha
- os logs de saude do sensor mostram faixa efetiva, `lsb_per_g`, raw AX/AY/AZ/GX/GY/GZ, conversao em `g`/`deg/s`, calibracao e magnitude publicada
- no boot, procure `ready=1 calibrated=0 reason=...` quando a calibracao for pulada; isso ainda e operacional e deve publicar telemetria
- no boot, procure `[boot] sensor_begin_ok ... sensorReady=1` ou `[boot] sensor_begin_failed ... sensorReady=0`
- falhas I2C repetidas aparecem como resumo, por exemplo `[sensor] i2c errors summary ...`, e recovery aparece como `[sensor] i2c recovery start`, `[sensor] i2c bus restarted` e `[sensor] recovery ok`
- quando a telemetria nao for publicada, procure `[telemetry] skipped reason=...`; os motivos esperados sao `mqtt_disconnected`, `sensor_not_ready`, `no_valid_sample`, `stale_sample` e `publish_failed`
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
- AP curto no padrao `Q-ESP32-xxxxxx`, usando os 6 ultimos hexadecimais do chip
- modo de manutencao com `SETUP_PORTAL_ALWAYS_ON = true`, mantendo o portal aberto sem bloquear Wi-Fi station, MQTT ou telemetria
- bloco de saude operacional com `Wi-Fi conectado`, `MQTT OK`, `Backend API` e `Pronto para operar`
- botoes `Testar backend` e `Testar MQTT`
- visualizacao do perfil resumido do paciente sincronizado

Fluxo oficial:

1. o ESP32 liga
2. tenta usar as redes e o MQTT salvos em `NVS`
3. se `SETUP_PORTAL_ALWAYS_ON = true`, sobe o AP de manutencao `Q-ESP32-*` em paralelo ao fluxo normal
4. se falhar ou estiver sem configuracao valida, entra em `SETUP_MODE`
5. no setup/fallback, o mesmo AP `Q-ESP32-*` continua oferecendo o portal
6. o usuario abre o portal
7. salva rede, broker e backend
8. opcionalmente pareia o device informando o codigo temporario gerado no dashboard
9. o ESP32 reinicia e tenta operar normalmente

### Portal de manutencao sempre ativo em bancada

Com `SETUP_PORTAL_ALWAYS_ON = true`, o ESP32 opera em `WIFI_AP_STA`: o AP local permanece visivel em `http://192.168.4.1`, enquanto a interface station segue conectando no Wi-Fi e o MQTT continua tentando publicar status, eventos e telemetria. Isso e diferente de `SETUP_MODE`, que e um modo de fallback/configuracao.

Para restaurar o comportamento antigo, defina `SETUP_PORTAL_ALWAYS_ON = false`. Nesse caso, o AP aparece apenas quando o firmware entra em setup/fallback.

### Como forcar SETUP_MODE em bancada

Se voce quiser testar o modo bloqueante de setup sem depender de falha real de conectividade:

1. abra [include/app_config.h](../include/app_config.h)
2. defina `FORCE_SETUP_MODE_ON_BOOT = true`
3. grave o firmware
4. reinicie o ESP32
5. procure a rede `Q-ESP32-*`

Depois do teste, volte `FORCE_SETUP_MODE_ON_BOOT = false` para restaurar o comportamento normal.

### Observacao importante sobre upload

Se a placa ainda exigir segurar `BOOT` durante o upload, isso indica que ela nao esta entrando automaticamente em modo de download. Nesta rodada, a serial e o log ficaram acessiveis, mas o auto-reset para upload ainda permaneceu dependente do hardware/driver da placa.

Estado validado nesta bancada:

- `COM4` voltou a aceitar upload depois que a porta foi liberada
- a gravacao da build nova funcionou quando `BOOT` foi mantido pressionado
- o problema restante nao e mais "porta ocupada", e sim auto-reset/entrada automatica em bootloader

## Captive portal e acesso pelo celular

Quando o ESP32 entra em setup ou quando o portal de manutencao esta sempre ativo:

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

Como o portal pode existir tanto em `SETUP_MODE` quanto em manutencao paralela, a leitura de saude precisa ser honesta:

- `Wi-Fi conectado` usa o estado station atual do ESP32
- `MQTT OK` pode vir de conexao atual ou do ultimo `Testar MQTT`
- `Backend API` mostra validade da URL e ultimo `Testar backend`
- em manutencao, `Pronto para operar` foca em Wi-Fi station + MQTT; em setup/fallback, tambem exige os testes esperados de configuracao

Isso evita prometer que o device ja esta operando normalmente quando ele ainda esta apenas em fase de ajuste/configuracao.

## Telemetria e snapshot tecnico

Nesta baseline, a telemetria continua sendo publicada em alta frequencia, mas agora tambem leva:

- `battery_level`
- `wifi_rssi`

Unidades esperadas no payload MQTT:

- `ax`, `ay`, `az`: aceleracao em `g`
- `gx`, `gy`, `gz`: giroscopio em `deg/s`
- `accel_magnitude`: aceleracao resultante em `g`
- `gyro_magnitude`: giro resultante em `deg/s`

Com isso, o backend consegue manter bateria, RSSI e `lastSeenAt` mais coerentes nas telas sem depender apenas do `status` periodico.

Para online/offline, o backend usa a hora em que recebeu MQTT como `lastSeenAt`. Se o ESP32 ainda nao sincronizou NTP e mandar `timestamp = millis()/1000`, ou se mandar um Unix time plausivel mas stale demais, o backend usa a hora de recebimento para telemetria/eventos. Isso evita telemetria recem-chegada com data antiga, evidencia de queda sem vinculo e status falsamente offline.

No dashboard, essa telemetria continua chegando no mesmo contrato MQTT. A visualizacao do grafico do device normaliza apenas a camada visual: `accel_magnitude` aparece como `Aceleracao resultante (g)`, o tooltip mostra giroscopio e eixos AX/AY/AZ com unidades, e outliers fora da escala visual sao escondidos sem apagar ou alterar os dados persistidos.

No firmware atual, a telemetria periodica continua rodando mesmo com o portal de manutencao ativo e mesmo se houver candidato/alerta de queda. O portal em modo manutencao nao inicia scan Wi-Fi automatico (`SETUP_PORTAL_SCAN_IN_MAINTENANCE_MODE = false`), porque scan em `WIFI_AP_STA` pode interferir no link station/MQTT em alguns ESP32. Em `SETUP_MODE` o scan continua disponivel para ajudar a cadastrar redes.

O payload real tambem carrega campos tecnicos extras ignorados por clientes antigos:

- `battery_percent` alem de `battery_level`
- `rssi` alem de `wifi_rssi`
- `sensor_ready`
- `sensor_valid`
- `sensor_read_ok`
- `sensor_sample_age_ms`
- `sensor_failures`
- `i2c_error_count`
- `i2c_recovery_count`
- `i2c_last_error`

Esses campos ajudam a diferenciar "ESP32 vivo publicando status" de "sensor sem leitura valida". Payloads diagnosticos sem eixos reais nao devem ser tratados como telemetria real pelo backend.

Para confirmar publicacao real em bancada, rode no notebook:

```powershell
npm run mqtt:watch --prefix backend
```

Para gerar telemetria valida sem ESP32 fisico:

```powershell
npm run mqtt:publish:test --prefix backend -- --device esp32_01 --count 10
```

### Procedimento de teste real de telemetria

1. Suba broker, backend e frontend com o fluxo local do projeto.
2. Abra um terminal fixo:

```powershell
npm run mqtt:watch --prefix backend
```

3. Abra o Serial Monitor do ESP32 em `115200`.
4. Reinicie o ESP32.
5. Confirme no Serial Monitor:
   - `[wifi]`/`Wi-Fi conectado` com IP station
   - `[mqtt] connected broker=... clientId=...`
   - `[mqtt] topic telemetry=queda/devices/esp32_01/telemetry`
   - `[sensor] mpu range accel=+-...g gyro=+-...dps`
   - `[sensor] accel scale lsb_per_g=...`
   - `[sensor] calibration ok ...` ou `calibration skipped reason=...`
   - `[sensor] ready=1 calibrated=...`
   - `[sensor] read ok ...`
   - `[telemetry] publish ok ...` repetindo a cada `TELEMETRY_REPORT_INTERVAL_MS` quando houver amostra fresca
6. Confirme que nao aparece repetidamente `[telemetry] skipped reason=sensor_not_ready`, `no_valid_sample` ou `stale_sample`.
7. Deixe o ESP32 parado sobre a mesa e confirme `[sensor] read ok ... magnitude=...` perto de `1.00 g`.
8. Confirme que o Serial nao fica inundado por erro I2C; falhas repetidas devem virar resumo e recovery.
9. Se ocorrer recovery, procure `[sensor] recovery ok`; se aparecer `recovery failed`, revise o checklist fisico.
10. Confirme no `mqtt:watch` linhas novas em `queda/devices/esp32_01/telemetry`.
11. Confirme no dashboard que AX/AY/AZ estao em `g`, `accel_magnitude` fica perto de `1 g` em repouso e o grafico estabiliza perto de `1 g`.
12. Mexa o sensor rapidamente e confirme que a aceleracao sobe temporariamente.
13. Deixe parado novamente e confirme retorno para perto de `1 g`.
14. Se aparecer `[telemetry] skipped reason=mqtt_disconnected`, o problema esta no link MQTT/reconnect.
15. Se aparecer `[telemetry] skipped reason=no_valid_sample` ou `stale_sample` com `sensor_ready=1`, o problema esta em leitura raw temporaria/I2C apos o boot.
16. Se aparecer `[telemetry] skipped reason=sensor_not_ready`, o firmware nao encontrou o MPU6050 ou nao conseguiu leitura raw basica no boot.
17. Se o Serial mostrar `publish ok` mas o `mqtt:watch` nao receber, verifique host/porta, broker efetivo, clientId e rede.

## Buzzer e motion test

O buzzer esta conservador para bancada:

- `BUZZER_ENABLED = false` por padrao
- polaridade explicita via `BUZZER_ACTIVE_HIGH`
- default `BUZZER_ACTIVE_HIGH = false`, adequado para modulos active-low comuns
- `MOTION_TEST_MODE_ENABLED = false` por padrao

Na pratica:

- boot, Wi-Fi connecting, MQTT connecting, setup mode e warning visual nao devem acionar buzzer
- o alarme real por queda/SOS continua disponivel quando `BUZZER_ENABLED = true`
- o teste de bancada deixa de ficar habilitado por padrao em uso normal
- se a placa usar buzzer ativo-low, a inversao agora pode ser tratada em `include/app_config.h` sem mexer na logica do alarme

## Multiplas redes Wi-Fi e saude de conectividade

O ESP32 salva ate `5` redes Wi-Fi.

Comportamento atual:

- tenta as redes em ordem
- a primeira e tratada como preferida
- salvar o mesmo `SSID` atualiza a rede existente
- se nenhuma conectar e `SETUP_PORTAL_ALWAYS_ON = false`, entra em `SETUP_MODE`
- se nenhuma conectar e `SETUP_PORTAL_ALWAYS_ON = true`, mantem o portal de manutencao ativo sem bloquear o loop principal

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

Com `SETUP_PORTAL_ALWAYS_ON = true`, falhas repetidas de MQTT deixam o portal ja disponivel para correcao, mas nao desconectam o MQTT nem interrompem sensor, status/eventos e tentativas normais. Com a flag em `false`, o fallback antigo para `SETUP_MODE` permanece.

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
2. habilite `BUZZER_ENABLED = true` apenas para esse teste controlado
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
| Buzzer ativo | `SIG` | `GPIO25` | opcional | hoje `BUZZER_ENABLED = false`; revise `BUZZER_ACTIVE_HIGH` antes de habilitar |
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
- o broker local de desenvolvimento deve escutar em `0.0.0.0:1883` ou outro bind acessivel pela LAN
- nunca use `localhost` no ESP32

No Windows, valide a porta do ponto de vista da LAN:

```powershell
Test-NetConnection IP_DO_NOTEBOOK -Port 1883
```

O esperado e `TcpTestSucceeded : True`. Se `localhost:1883` funcionar, mas o IP do notebook falhar, o broker provavelmente esta preso a loopback/IPv6 ou a rede/firewall ainda esta bloqueando o acesso.

Esse teste nao valida o handshake MQTT. Para confirmar que o broker respondeu com `CONNACK`:

```powershell
cd backend
npm run mqtt:test -- IP_DO_NOTEBOOK 1883
```

O esperado e `MQTT handshake OK`. Depois disso, o botao `Testar MQTT` do portal do ESP32 deve conseguir passar se host, porta, TLS e credenciais estiverem coerentes.

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
