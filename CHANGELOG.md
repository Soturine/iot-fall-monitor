# Changelog

## [Unreleased]
### Pendente / Faltando
- capturar GIF real de uma nova queda controlada percorrendo ESP32/evento -> MQTT -> backend -> dashboard
- ativar FFT como decisão real somente após calibração e validação com dados reais
- implementar sessões completas de calibração por SOS
- testar classificação de movimentos com múltiplas runs por classe
- ampliar a validação ponta a ponta com mais cenários, repetições e dataset real

## [v0.9.0] - 2026-06-09
### Adicionado
- modo de operação `Normal`/`Demo apresentação` persistido em NVS e configurável pelo portal ESP32
- perfil demo acadêmico com leitura interna a `25 ms`, telemetria MQTT a `500 ms` e FSM de queda mais amigável para bancada
- evidência de decisão com modo, etapas de impacto/orientação/imobilidade, thresholds e intervalos efetivos
- estimativa experimental de bateria por tempo, iniciada em `33.5 min/%`, com histórico e aprendizado suavizado por calibrações manuais
- migração idempotente `db:migrate:battery-estimation`, sem resetar banco ou histórico
- título e favicon próprios do Monitor de Quedas
- guias dedicados da demo e da estimativa experimental de bateria
- capturas reais com device online, 120 amostras, Modo Demo, portal ESP32 operacional, queda confirmada e bateria estimada
- tour visual real e lento da interface, capturado com o sensor em repouso e sem simular uma nova queda

### Alterado
- modo normal preserva leitura a `50 ms`, telemetria a `2000 ms` e thresholds conservadores
- configuração nova/factory inicia em `Demo apresentação`; configuração Normal ou Demo já salva em NVS continua respeitada
- portal identifica `Demo apresentação` como recomendado para a banca acadêmica e `Normal` como perfil conservador
- detalhe/lista de dispositivos passam a exibir modo do detector e contexto da bateria estimada
- detalhe em modo demo mantém até `120` amostras recentes para visualização mais fluida
- README reorganizado para descrever o sistema atual, mantendo histórico detalhado neste changelog

### Corrigido
- ingestão MQTT e `upsertDeviceStatus` normalizam `battery_calibration_count` ausente para `0`, evitando falha em payloads antigos ou sem bateria

### Documentação
- README e docs explicam o default acadêmico, a compatibilidade de payloads sem bateria e as evidências visuais reais da `v0.9.0`
- modelo relacional principal documentado em Mermaid sem alterar o schema
- assets distinguem o tour real da interface do futuro GIF realtime de uma queda controlada

### Segurança e limitações
- buzzer continua reservado a `fall_detected` confirmado e SOS; `movement_detected` e `fall_suspected` não acionam alarme local
- modo demo é experimental e não representa calibração clínica
- bateria continua sendo estimativa por tempo, não medição elétrica real; ADC/fuel gauge permanece evolução futura
- FFT/Fourier continua experimental e desligada como decisão principal
- o tour visual da interface não demonstra uma nova queda; o GIF realtime de queda permanece pendente

### Validação
- ESP32 real online com MQTT, Modo Demo, telemetria recente, gráfico de `120` amostras, bateria estimada e queda confirmada registrada
- checks e testes backend, lint e build frontend executados durante a rodada

## [v0.8.31] - 2026-06-09
### Adicionado
- migração idempotente `db:migrate:alert-actions`, aplicável em banco existente sem reset ou perda de histórico
- reset administrativo de claim para demonstração, sem excluir device, telemetria, eventos, alertas ou assignments antigos
- arquivamento lógico de paciente, bloqueado enquanto houver device vinculado
- estados visíveis de erro e tentativa novamente nas telas de alertas, pacientes, dispositivos e detalhe do device
- modo de telemetria demo opt-in no firmware, desligado por padrão

### Alterado
- detalhe do dispositivo passa a manter `60` amostras recentes e scroll interno para alertas/eventos
- `movement_detected` permanece evento informativo de baixa severidade, mas deixa de criar alerta ativo ou buzzer
- buzzer local fica reservado para queda confirmada e SOS; `fall_suspected` experimental continua auditável sem alarme sonoro
- ações administrativas de desvincular paciente e desparear para demo encerram vínculos sem apagar histórico
- versão alinhada para `0.8.31` em packages e locks existentes

### Corrigido
- bancos existentes sem `alert_actions` agora possuem caminho incremental claro e erro orientativo
- timeout global da API impede login e telas protegidas de ficarem carregando indefinidamente
- botão `Acknowledge` passa a ser exibido como `Confirmar atendimento`
- ações de acknowledge, resolução e cancelamento aceitam body ausente ou `note: null`
- modal de detalhes de alerta permanece centralizado e resiliente a campos opcionais ausentes
- `dev:smoke` encerra toda a árvore do mock publisher e deixa de acumular processos órfãos que saturavam MQTT e backend

### Documentação
- README, integração, hardware, checklist e roteiro de demonstração documentam migração segura, reset de claim, arquivamento, telemetria demo e política conservadora do buzzer

### Limitações conhecidas
- reset de claim é uma ação administrativa para demonstração; transferência cross-tenant continua exigindo novo claim autorizado
- modo demo de telemetria aumenta carga em MQTT, backend e banco e deve permanecer desligado fora da apresentação
- validação física de buzzer, SOS e pareamento após reset continua dependente do ESP32 real

## [v0.8.30] - 2026-06-08
### Adicionado
- campo opcional de bateria manual no portal ESP32, persistido em `NVS`, para copiar de forma explícita a porcentagem exibida por módulo externo de bateria
- `battery_percent_source` nos payloads MQTT do firmware, usando `manual` quando o valor foi configurado e `not_configured` quando não há medição confiável
- helpers no frontend para exibir bateria como `--%`/`não informado` quando o firmware não publicou valor real ou manual
- teste de ingestão MQTT cobrindo bateria manual e limpeza do placeholder antigo quando o device informa `battery_percent_source=not_configured`

### Alterado
- firmware deixa de publicar `battery_level=100` como placeholder fixo; `battery_level`/`battery_percent` só aparecem quando há valor manual configurado
- backend preserva compatibilidade com payloads antigos, mas limpa bateria stale quando o ESP32 declara que a bateria não está configurada
- lista e detalhe de dispositivos mostram a origem da bateria (`manual`, `automático`, `estimado` ou `não informado`) sem tratar valor manual como leitura real
- versão alinhada para `0.8.30` em packages da raiz, backend, frontend e locks existentes

### Documentação
- `README.md` passa a documentar `v0.8.30` como baseline atual
- docs técnicos explicam o diagnóstico do ESP32 novo em `COM5`, a estabilidade observada de IMU/I2C por cerca de `75 s` sem erros/recoveries e a diferença entre bateria manual, bateria não informada e leitura automática futura
- documentação registra que a saída `5V` de placa boost não é suficiente para estimar porcentagem real; leitura automática futura deve usar divisor resistivo no ADC ou fuel gauge como `MAX17048`/`MAX17043`

### Limitações conhecidas
- a bateria manual é apenas informativa e depende do valor copiado pelo operador no portal ESP32
- ainda não há medição automática de bateria no firmware; ADC calibrado ou fuel gauge dedicado ficam como evolução futura
- validação de buzzer, eventos e telemetria continua dependente de teste físico controlado em bancada, sem queda real de pessoa

## [v0.8.29] - 2026-06-03
### Alterado
- firmware centraliza campos comuns de payload (`device_uid`, `device_id`, bateria, rede, diagnóstico de sensor e leitura mais recente) sem mudar o contrato MQTT de `status`, `telemetry` ou `events`
- backend centraliza normalizadores compartilhados (`toIso`, `toNullableNumber`, `toNullableBoolean`) em `utils/formatters`, reduzindo duplicação em serviços de eventos, alertas, devices e ingestão MQTT
- frontend extrai helpers de diagnóstico/evidência do detalhe do dispositivo para `frontend/src/lib/deviceDiagnostics.ts`, preservando o visual premium e o fluxo realtime
- versão alinhada para `0.8.29` em packages da raiz, backend, frontend e locks existentes

### Documentação
- `README.md` passa a documentar `v0.8.29` como baseline atual de qualidade incremental
- auditoria de qualidade registra as refatorações aplicadas, a complexidade residual e os candidatos seguros para próximas versões

### Limitações conhecidas
- a lógica de alerta, telemetria e buzzer foi preservada; esta rodada não altera thresholds, contrato MQTT, API, Socket.IO ou schema
- a modularização completa de `src/main.cpp`, `setup_portal.cpp`, `deviceService.js` e páginas grandes do frontend continua pendente para rodadas futuras
- validação do botão físico/portal `Testar buzzer` depende do ESP32 real conectado e da configuração do buzzer no hardware

## [v0.8.28] - 2026-06-03
### Adicionado
- suporte explícito a IMU `MPU6050`, `MPU6500` e `MPU9250` conforme `WHO_AM_I`
- logs de magnitude `raw_magnitude_g`, `corrected_magnitude_g` e `filtered_magnitude_g` para validar repouso próximo de `1 g`
- logs de buzzer com `enabled`, `pin`, `active_high`, motivo do pulso, início/fim e skip por `disabled` ou `no_alert_event`
- botão `Testar buzzer` no portal ESP32 para pulso curto não bloqueante usando a configuração atual

### Alterado
- firmware passa a aceitar a faixa efetiva lida em `ACCEL_CONFIG`/`GYRO_CONFIG` quando o sensor permanece em `+-2g/+-250dps`, sem tentar reconfigurar indefinidamente em recoveries
- recovery I2C preserva a última escala efetiva conhecida quando o readback de `ACCEL_CONFIG`/`GYRO_CONFIG` falha, evitando magnitudes falsas por fallback temporário para `+-8g`
- documentação passa a considerar o ESP32 novo com CP210x em `COM5`, upload funcional sem segurar `BOOT` e PlatformIO pelo caminho completo no Windows
- versão alinhada para `0.8.28` em packages da raiz, backend, frontend e locks existentes

### Corrigido
- pacote raw totalmente zerado (`ax=ay=az=gx=gy=gz=0`) deixa de ser tratado como leitura válida
- falha de leitura I2C preserva `sensor_read_ok=false` e motivo atual do erro, evitando amostra falsa ou stale marcada como boa
- re-tentativa periódica de `sensor.begin()` recupera IMU que falhou no boot sem reiniciar o ESP32
- fluxo local do buzzer fica rastreável para `movement_detected`, `fall_suspected`, `fall_detected`, SOS, autoteste de boot e teste pelo portal

### Limitações conhecidas
- buzzer depende do tipo físico do módulo: buzzer ativo funciona com `digitalWrite`; buzzer passivo pode exigir PWM/LEDC ou driver externo
- alerta criado apenas no backend ainda não aciona hardware local sem um futuro tópico de comando para o ESP32
- validação clínica continua fora de escopo; testes devem ser feitos apenas com movimento controlado de bancada

## [v0.8.27] - 2026-06-02
### Adicionado
- seção de pré-calibração experimental no portal do ESP32 para sensibilidade, thresholds, janela, cooldown, publicação de eventos e buzzer
- eventos MQTT `fall_suspected` e `movement_detected` gerados pelo firmware a partir de telemetria real válida e fresca
- payloads de eventos com motivo da decisão, thresholds usados, diagnóstico do sensor, contadores I2C e `sample_seq`
- logs seriais de alerta e buzzer para `event_published`, `event_queued`, cooldown, publish e pulso não bloqueante
- recovery I2C por volume de falhas intermitentes desde o último recovery, além do gatilho por falhas consecutivas

### Alterado
- `fall_detected` continua sendo a queda confirmada pela FSM local com imobilidade, enquanto `fall_suspected`/`movement_detected` servem para validação operacional em bancada
- backend passa a criar alertas para `fall_suspected` e `movement_detected`, mantendo compatibilidade com `fall_detected`, SOS e `sensor_fault`
- deduplicação curta de alertas passa a considerar o mesmo device e o mesmo tipo crítico recente
- frontend de detalhe do dispositivo passa a exibir evidência, motivo e thresholds para eventos experimentais de alerta
- versão alinhada para `0.8.27` em packages da raiz, backend, frontend e locks existentes

### Corrigido
- fluxo real de telemetria intensa agora consegue chegar a evento MQTT, alerta backend, `alert:new` e buzzer quando habilitado no portal
- `i2c_recovery_count` deixa de ficar preso em zero quando as falhas do MPU6050 são intermitentes, mas numerosas

### Limitações conhecidas
- o modo `demo` é apenas para teste controlado de bancada e pode gerar falsos positivos
- não há validação clínica; não testar queda real em pessoa
- a decisão principal por FFT/Fourier continua experimental e desligada

## [v0.8.26] - 2026-05-20
### Adicionado
- screenshots reais da interface web em `docs/assets/screenshots`, capturados do frontend rodando localmente
- documentação visual real de login, dashboard, pacientes, dispositivos, alertas e organização
- estrutura de assets visuais preservada para futuros screenshots de detalhe do dispositivo, telemetria e portal ESP32

### Documentação
- README.md passa a exibir capturas reais da interface web `v0.8.26`
- docs técnicos passam a referenciar assets visuais reais quando disponíveis
- `docs/assets/README.md` passa a listar os screenshots `v0.8.26` já capturados e as capturas ainda pendentes

### Limitações conhecidas
- GIF real do fluxo ESP32/evento -> MQTT -> backend -> dashboard só deve ser incluído se for capturado de forma real
- captura de detalhe do dispositivo com telemetria depende de ambiente local com device visível para a organização ativa
- capturas dependem do ambiente local com backend, frontend e banco funcionando

## [v0.8.25] - 2026-05-20
### Adicionado
- confiabilidade de eventos críticos MQTT para diferenciar telemetria periódica de eventos que precisam de rastreabilidade
- `event_uuid`, `event_sequence` e `sample_seq` nos payloads críticos do firmware
- fila circular local em RAM para eventos críticos do canal `events`, com flush automático quando o MQTT reconecta
- logs de `event publish ok`, `event publish failed`, `event queued`, `event flushed` e descarte por limite do buffer
- deduplicação no backend por `event_uuid` quando o campo estiver disponível no `raw_payload_json`
- suporte backend para tratar `manual_sos` e `sensor_fault` como eventos críticos compatíveis
- documentação do fluxo de entrega, reenvio e deduplicação com diagrama Mermaid

### Alterado
- versão alinhada para `0.8.25` em `package.json`, `backend/package.json`, `frontend/package.json`, `backend/package-lock.json` e `frontend/package-lock.json`
- `status` e `telemetry` continuam leves; apenas eventos críticos entram na fila local de reenvio
- scripts MQTT de teste passam a publicar eventos críticos com `event_uuid` e QoS 1 quando o cliente/broker suportar
- README e docs técnicos explicam a política de confiabilidade por criticidade

### Corrigido
- reenvio do mesmo evento crítico com o mesmo `event_uuid` não cria novo evento, alerta ou `alert:new` duplicado

### Limitações conhecidas
- a garantia principal do firmware é a fila em RAM; o snapshot pequeno em `NVS` reduz perda em alguns reboots, mas não substitui persistência durável
- `PubSubClient` no firmware permanece publicando em QoS 0; QoS 1 fica documentado e usado nos scripts Node quando suportado
- persistência completa em `SPIFFS`/`LittleFS` continua como evolução futura

## [v0.8.24] - 2026-05-19
### Adicionado
- firmware passa a usar `FallFeatureExtractor` com janela circular de 64 amostras para extrair features no domínio do tempo
- `fall_detected` passa a carregar evidência estruturada da decisão local, incluindo versão do algoritmo, confiança heurística, picos, imobilidade, janela de análise e features
- placeholder documentado para FFT/Fourier experimental, ainda desativado como critério de decisão
- base técnica expandida para calibração futura por SOS, sessões, amostras, feature sets e perfis por paciente/dispositivo
- teste backend para `deviceBehaviorService`

### Alterado
- versão alinhada para `0.8.24` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- backend passa a preservar a decisão do firmware em `raw_payload_json` e `evidence_summary_json`
- `deviceBehaviorService` passa a centralizar estados experimentais mais claros, como sensor sem leitura válida, `telemetria_desatualizada`, `movimento_leve`, `movimento_intenso`, `sos_manual` e calibração pendente
- frontend de detalhe do dispositivo passa a exibir estado atual vindo do backend e evidências estruturadas da detecção
- documentação técnica foi atualizada para deixar claro que FFT/calibração estão preparadas, mas ainda não substituem a decisão atual

### Corrigido
- redução de duplicação curta de alertas de queda abertos ou em atendimento

## [v0.8.23] - 2026-05-19
### Adicionado
- nova identidade visual premium healthtech/IoT no frontend
- imagens institucionais em `frontend/public/images`
- cards, badges, botões, modais, estados vazios e loading states redesenhados
- layout com sidebar renovada e visual responsivo
- melhorias visuais nas telas de login, dashboard, pacientes, dispositivos, detalhe do dispositivo, alertas e organização
- migration idempotente `npm run db:migrate:sensor-diagnostics --prefix backend`
- campos de saúde/diagnóstico do sensor em `device_status`
- evidência estruturada inicial para payload `fall_detected`

### Alterado
- `DeviceDetailPage` passa a diferenciar device online por `status` de telemetria realmente ativa
- gráfico de telemetria recebeu polimento visual e integração melhor com o redesign
- tela de detalhe do dispositivo passa a mostrar diagnóstico de telemetria, tópicos esperados/observados, saúde do sensor e alerta de device online sem telemetria recente
- frontend mantém atualização por Socket.IO sem depender de reload manual quando chega `telemetry:new`
- backend melhora logs e diagnóstico entre `status`, `telemetry` e `events`

### Corrigido
- firmware passa a publicar `telemetry` periódica somente quando existe amostra válida e fresca do MPU6050
- backend passa a rejeitar payloads `telemetry` sem eixos reais ou com `sensor_valid=false`, evitando `telemetry_logs` inválidos
- diagnóstico de sensor no firmware/backend/frontend ficou mais claro quando o MPU6050 não entrega amostra válida recente
- sistema deixa de sugerir gráfico bugado quando, na verdade, o device está online mas sem telemetria recente

## [v0.8.22] - 2026-05-14
### Corrigido
- leitura I2C do MPU6050 ficou mais tolerante a falhas transitórias no ESP32 real, evitando que erros `i2cWriteReadNonStop returned Error -1` inundem o Serial Monitor ou interrompam telemetria MQTT
- telemetria periódica continua sendo publicada com `sensor_valid=false` quando a última amostra fica velha demais, sem inventar valores de sensor

### Alterado
- versão alinhada para `0.8.22` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- leituras de registradores do MPU6050 agora preferem STOP condition em bancada (`I2C_USE_REPEATED_START=false`) e mantém fallback com STOP se repeated-start for reativado
- driver do sensor usa retry curto, contadores de falha, resumo throttled de erros I2C e recovery controlado que reinicia o barramento e reconfigura o MPU6050 sem recalibrar em loop
- payloads de `status` e `telemetry` ganharam diagnósticos `i2c_error_count`, `i2c_recovery_count` e `i2c_last_error`; buffer MQTT do firmware subiu para `MQTT_PACKET_BUFFER_SIZE=1024`

### Documentado
- checklist físico para instabilidade I2C: GND comum, VCC, SDA/SCL, fios curtos, contato na protoboard, módulo MPU6050 e clock de `100 kHz`

## [v0.8.21] - 2026-05-14
### Corrigido
- regressao da `v0.8.20` em que falhas de configuração/readback/calibração do MPU6050 podiam deixar `sensor_ready=0` e bloquear telemetria real mesmo com Wi-Fi/MQTT online
- `sensor_ready` voltou a significar MPU encontrado, `WHO_AM_I` compatível e leitura raw básica funcionando; calibração não é mais requisito para publicar telemetria

### Alterado
- versão alinhada para `0.8.21` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- escrita de registradores do MPU6050 agora usa retry e logs por registrador (`PWR_MGMT_1`, `CONFIG`, `GYRO_CONFIG`, `ACCEL_CONFIG`, `ACCEL_CONFIG2`)
- readback de `ACCEL_CONFIG`/`GYRO_CONFIG` usa fallback de divisores esperados quando falha, sem impedir o boot do sensor
- calibração de acelerômetro passa a registrar `continuing_without_offsets` quando falha ou e pulada, mantendo `AX/AY/AZ` em `g` e telemetria ativa

### Documentado
- procedimento de bancada atualizado para validar `sensor_ready=1`, ausência de `sensor_no_valid_sample`, publish de telemetria e repouso perto de `1 g`

## [v0.8.20] - 2026-05-14
### Alterado
- versão alinhada para `0.8.20` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- driver do MPU6050 agora lê `ACCEL_CONFIG` e `GYRO_CONFIG` após configurar o sensor e deriva os divisores reais de conversão a partir da faixa efetiva
- AX/AY/AZ continuam sendo enviados em `g`, GX/GY/GZ em `deg/s`, `accel_magnitude` em `g` e `gyro_magnitude` em `deg/s`, sem mudar nomes de campos MQTT
- logs seriais do sensor passaram a mostrar faixa efetiva, `lsb_per_g`, raw do acelerômetro/giroscópio, valores convertidos em `g` e magnitudes publicadas

### Corrigido
- leituras em repouso perto de `4 g` quando o sensor permanecia na escala efetiva `+-2g` mas o firmware dividia como `+-8g`
- conversão deixou de depender de constantes fixas (`4096 LSB/g`, `65.5 LSB/dps`) quando o registrador real diverge do desejado

### Adicionado
- calibração leve de acelerômetro no boot, com 80 amostras, validação de estabilidade e offsets conservadores que preservam a direção da gravidade
- fallback de sanidade por magnitude raw em repouso para escolher o divisor físico mais próximo quando o readback ou clone do sensor ainda indicar escala incoerente
- procedimento documentado para validar repouso próximo de `1 g` com Serial Monitor, `mqtt:watch` e dashboard

### Pendente / Faltando
- validar na placa física se o Serial Monitor mostra `accel scale lsb_per_g=16384` quando o chip permanecer em `+-2g`, ou `4096` quando `+-8g` for realmente aplicado
- compilar com PlatformIO localmente na máquina com `pio` instalado; nesta sessão `pio` não estava no PATH

## [v0.8.19] - 2026-05-14
### Alterado
- versão alinhada para `0.8.19` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- gráfico de telemetria do detalhe do device passou a exibir como série principal apenas `Aceleração resultante (g)`, deixando giroscópio e eixos AX/AY/AZ no tooltip
- eixo Y do gráfico agora usa domínio calculado para aceleração, largura fixa e formatter com 2 casas decimais para evitar ticks crus pouco legíveis
- quando `accel_magnitude` vier ausente/fora da escala visual, o gráfico tenta derivar a magnitude a partir de AX/AY/AZ antes de descartar a amostra na visualização

### Corrigido
- valores de telemetria reais que chegavam corretamente ao frontend deixaram de aparecer como labels estranhos no eixo Y, como números longos sem unidade/contexto
- mistura visual entre aceleração e giroscópio no mesmo eixo deixou de distorcer a escala do gráfico principal

### Documentado
- a normalização visual do gráfico não altera MQTT, backend, schema nem dados persistidos
- outliers são filtrados apenas na visualização (`0-20 g` para aceleração e `0-2000 deg/s` para giroscópio no tooltip)

## [v0.8.18] - 2026-05-13
### Adicionado
- logs seriais de diagnóstico no firmware para MQTT, sensor, loop principal, publish/skip de telemetria, status e eventos
- campos técnicos no payload real do ESP32 (`sensor_ready`, `sensor_valid`, `sensor_read_ok`, `sensor_sample_age_ms`, `sensor_failures`, `battery_percent`, `rssi`) sem remover os campos antigos
- procedimento documentado para testar telemetria real com Serial Monitor + `npm run mqtt:watch --prefix backend`

### Alterado
- versão alinhada para `0.8.18` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- portal de manutenção deixou de iniciar scan Wi-Fi automático em `WIFI_AP_STA`, reduzindo risco de interferir no link station/MQTT enquanto o device opera
- payloads JSON do firmware ganharam mais folga de buffer e aviso serial se houver overflow antes de publicar
- telemetria periódica passou a registrar motivo de skip quando falta MQTT ou ainda não há amostra válida do sensor

### Corrigido
- o firmware ficou mais observável para distinguir ESP32 conectado sem publish contínuo de backend/frontend funcionando com telemetria simulada
- falhas pontuais de leitura do MPU6050 não impedem o loop MQTT; quando já existe última amostra válida, o firmware continua publicando com idade da amostra e contador de falhas

### Pendente / Faltando
- validar na placa física com `mqtt:watch` aberto por vários minutos após reinício do ESP32
- compilar com PlatformIO localmente na máquina com `pio` instalado; nesta sessão `pio`/`platformio` não estava no PATH

## [v0.8.17] - 2026-05-13
### Adicionado
- scripts `npm run mqtt:watch --prefix backend` e `npm run mqtt:publish:test --prefix backend` para observar mensagens reais no broker e publicar telemetria válida sem ESP32 físico
- migração idempotente `npm run db:migrate:evidence --prefix backend` para aplicar o schema de evidência sem resetar dados locais
- verificação de schema no startup do backend com recomendação clara quando colunas/tabela de evidência estiverem ausentes
- logs de diagnóstico mais claros no broker dev e na bridge MQTT, incluindo tópico, tamanho do payload, `clientId`, `correlationId`, canal, device resolvido e resultado do processamento

### Alterado
- versão alinhada para `0.8.17` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- `device_status.last_seen_at` passou a usar a hora de recebimento MQTT no backend, evitando falso offline quando o ESP32 publica com timestamp stale
- persistência de telemetria/eventos normaliza timestamps do device quando o clock/NTP esta ausente ou distante demais do recebimento
- documentação de diagnóstico MQTT passou a separar broker ativo, publish real do ESP32, ingestão do backend, persistência e emissão Socket.IO

### Corrigido
- dashboard e detalhe de device deixam de depender de timestamp antigo do payload para decidir se a telemetria MQTT recente esta viva
- bancos locais atualizados de versões anteriores agora podem receber a migração de evidência sem `db:init` destrutivo

### Pendente / Faltando
- validar por vários minutos com ESP32 físico se `mqtt:watch`, logs do backend e dashboard mostram fluxo contínuo de `telemetry` a cada intervalo esperado
- se houver multiplas instancias do backend no futuro, manter a recomendação de lock/fila distribuida por device

## [v0.8.16] - 2026-05-13
### Adicionado
- campos de evidência em `events` (`evidence_status`, `evidence_telemetry_id`, `evidence_sample_count`, `evidence_window_seconds`, `evidence_summary_json`)
- tabela relacional `event_telemetry_evidence` para vincular eventos de queda a amostras de `telemetry_logs`
- testes `node:test` para queda com evidência, queda sem evidência, telemetria stale/outro device e exposição de resumo de evidência no alerta
- scripts explícitos `test:smoke`, `test:integration`, `stress:dry` e `stress:real` no backend
- stress real com validação de backend `/health`, broker MQTT, MySQL local/dev e bloqueio de execução em produção
- relatórios de stress legíveis em `backend/logs/stress/report-<runId>.md` e falhas completas em `failures-<runId>.json`

### Alterado
- versão alinhada para `0.8.16` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- `fall_detected` agora busca telemetria do mesmo device na janela `event_time - 10s` até `event_time + 3s` antes de criar alerta automático
- `fall_detected` sem evidência recente passa a ser evento técnico com `evidenceStatus=none`, severidade `medium`, warning diagnóstico e sem alerta automático
- `sos_pressed` continua criando alerta sem depender de telemetria, por ser acionamento manual
- comportamento do device evita marcar `queda_confirmada` para queda recente sem evidência de telemetria
- gráfico de telemetria usa escala visual mínima quando timestamps chegam iguais ou muito próximos, mantendo o horário real no tooltip

### Corrigido
- o fluxo de queda deixou de tratar `fall_detected` como alerta crítico confiável sem amostras relacionadas do MPU6050 persistidas no backend
- o stress dry-run deixou de ser apresentado como stress real e passou a gerar resumo humano com MQTT, telemetria, quedas/alertas, falhas e recomendações

### Documentado
- diferença entre `stress:dry` e `stress:real`
- como interpretar JSONL, summary, failures e report Markdown de stress
- como a queda e amarrada a telemetria e o que acontece quando a evidência e insuficiente
- limitação atual de alerta interno sem SMS/WhatsApp/e-mail/push externo

### Pendente / Faltando
- validar com ESP32 físico se a frequência real de telemetria gera evidência `linked` antes/depois de quedas controladas
- calibrar thresholds do MPU6050 no protótipo físico antes de qualquer interpretação clínica
- avaliar uma chave futura de idempotência no payload MQTT para deduplicar eventos semanticamente iguais

### Limitações conhecidas
- `stress:real` depende de backend, broker e MySQL locais já rodando; sem esses pré-requisitos ele falha cedo e gera relatório de falha
- a janela de evidência e rastreabilidade técnica, não validação clínica

## [v0.8.15] - 2026-05-12
### Adicionado
- documentação técnica `docs/alerting-architecture.md` com fluxo real ESP32 -> MQTT -> backend -> banco -> Socket.IO -> frontend para quedas e SOS
- testes `node:test` para `eventService`, `alertService`, ingestão MQTT e emissão realtime escopada
- suite `npm run stress:alerts --prefix backend` em dry-run com cenários de rajada de telemetria, queda/SOS, payloads ruins e concorrência do mesmo device
- logger de stress em JSON Lines com resumo final em `backend/logs/stress/`
- scripts `test`, `test:alerts`, `test:mqtt`, `test:stress`, `stress:alerts` e `stress:cleanup` no backend

### Alterado
- versão alinhada para `0.8.15` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- ingestão MQTT passou a propagar `correlationId`, `durationMs`, tópico, escopo, device resolvido e motivo de descarte nos logs diagnósticos
- `npm run check --prefix backend` agora valida sintaxe de `src`, `scripts` e `tests`
- gráfico de telemetria do detalhe do device passou a usar eixo temporal numérico, ordenacao defensiva, filtro de amostras inválidas e separacao mínima para timestamps duplicados

### Corrigido
- fluxo MQTT de `fall_detected` voltou a passar o objeto completo do evento para `createAlertForEvent`, preservando criação de alerta interno e emissão `alert:new`
- gráfico de telemetria deixou de depender de `createdAt` como categoria textual, reduzindo aparência de travamento quando há poucas amostras ou timestamps no mesmo minuto

### Documentado
- diferença entre alerta interno e futura notificação externa
- contrato sugerido para futura camada `notificationService`
- como rodar testes normais, testes MQTT e stress local
- local e formato dos logs/relatórios de stress

### Pendente / Faltando
- validar com ESP32 físico se a telemetria real preenche o gráfico continuamente após vários minutos de bancada
- avaliar chave futura de idempotência de evento MQTT se o firmware passar a reenviar exatamente o mesmo evento com identificador próprio
- se o backend for escalado para multiplas instancias, migrar lock por device para fila particionada ou lock distribuido

### Limitações conhecidas
- `stress:alerts` e dry-run: ele mede o caminho de serviços com mocks controlados, não substitui teste de carga com MySQL e broker reais
- alerta interno ainda não envia SMS, WhatsApp, e-mail, push ou webhook externo

## [v0.8.14] - 2026-05-06
### Adicionado
- lock leve em memoria por `device_id` na ingestão MQTT para serializar mensagens simultaneas do mesmo ESP32 dentro de uma instancia Node
- rooms Socket.IO por escopo de acesso (`organization`, `patient` e plataforma global), reduzindo emissão realtime de varredura `O(sockets)` para entrega direta por room
- indices de apoio no schema para status stale online, telemetria recente por organização/device, eventos por organização/device/tipo e alertas por organização/status

### Alterado
- versão alinhada para `0.8.14` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- o caminho quente de telemetria MQTT deixou de montar snapshot completo repetido por amostra; agora reaproveita o status recem-gravado e calcula apenas a janela de comportamento necessaria
- `getOrCreateDeviceByIdentity` passou a retornar snapshot técnico/escopo mais leve para fluxos internos de MQTT, pairing e cadastro manual

### Corrigido
- criação de alerta por evento ficou idempotente sobre `alerts.event_id` com `ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, evitando falha em corrida de criação duplicada
- patches realtime de status enviados pela telemetria deixam de mandar `null` para RSSI/bateria/firmware quando o payload MQTT não trouxe esses campos, preservando o último valor válido no frontend

### Documentado
- limites do lock em memoria por device e necessidade de lock distribuido/fila particionada em backend horizontal
- uso de rooms Socket.IO por escopo e indices de performance no schema

### Pendente / Faltando
- aplicar os novos indices em bancos já existentes; `database/schema.sql` cobre resets/ambientes novos, mas instalacoes atuais precisam de migração/manual SQL equivalente
- validar em bancada com fluxo real de MQTT se a ordem status/telemetry/event permanece estável sob rajadas do ESP32

### Limitações conhecidas
- o lock MQTT e por processo Node; multiplas instancias do backend ainda podem processar o mesmo device em paralelo sem coordenacao externa
- a idempotência de alertas cobre duplicidade por `event_id`; duplicidade semantica de eventos MQTT iguais ainda depende de uma futura chave de deduplicacao de mensagem/evento

## [v0.8.13] - 2026-05-06
### Alterado
- versão alinhada para `0.8.13` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- o detalhe do device no frontend passou a combinar atualização incremental via `telemetry:new` com refresh HTTP leve a cada 10s, evitando gráfico stale quando um evento realtime se perde
- o gráfico de telemetria passou a mostrar segundos em janelas curtas e pontos nas séries, deixando amostras de bancada mais visiveis
- eventos realtime de telemetria agora incluem também o `deviceUid` resolvido pelo backend, sem remover campos existentes

### Corrigido
- corrigida a divergencia entre o device legado pareado `legacy:{device_id}` e o `device_uid` real publicado pelo ESP32, que podia fazer o backend gravar telemetria em um duplicado sem organização e deixar o dashboard da organização stale
- quando esse duplicado técnico sem tenant já existe, a ingestão MQTT move telemetrias, eventos e alertas para o device pareado, remove o duplicado e passa a usar o UID real no cadastro existente
- mensagens MQTT sem `device_uid` continuam compatíveis: depois da reconciliacao, o backend tenta resolver por `device_id` somente se houver exatamente um cadastro pareado com aquele identificador

### Documentado
- fluxo de identidade MQTT entre `device_id`, `device_uid` real e cadastros legados
- comportamento do detalhe `/devices/:id` com realtime incremental e fallback HTTP

### Pendente / Faltando
- validar em hardware real se o próximo pacote MQTT do ESP32 reconcilia o device exibido como `legacy:esp32_01` e atualiza o gráfico sem F5
- confirmar no banco se existe duplicado técnico antigo sem organização e se ele foi removido após a primeira telemetria recebida nesta versão

### Limitações conhecidas
- se existirem vários devices pareados com o mesmo `device_id`, mensagens sem `device_uid` continuam criando/atualizando o fallback legado para evitar associacao ambígua
- se o `device_uid` real já estiver claimed em outra organização, o backend não faz merge automático com o cadastro legado

## [v0.8.12] - 2026-05-06
### Adicionado
- `SETUP_PORTAL_ALWAYS_ON = true` no firmware para manter o AP/portal de manutenção ativo em paralelo ao fluxo normal de Wi-Fi station, MQTT, leitura do sensor e publicação de telemetria
- logs de diagnóstico MQTT no firmware, protegidos por `FIRMWARE_CONNECTIVITY_DEBUG_ENABLED`, com host/porta/clientId efetivos, tópicos e resultado de publish
- logs de ingestão no backend para `status` e `telemetry`, incluindo tópico recebido, device resolvido, escopo e motivo de descarte quando aplicavel

### Alterado
- versão alinhada para `0.8.12` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- SSID do portal do ESP32 encurtado para o padrão `Q-ESP32-xxxxxx`, sem incluir `deviceId` por padrão
- portal local passou a diferenciar AP de manutenção ativo de `SETUP_MODE`, exibindo que o ESP32 pode continuar publicando MQTT enquanto o portal esta aberto
- buzzer ficou desabilitado por padrão em bancada com `BUZZER_ENABLED = false` e polaridade default conservadora `BUZZER_ACTIVE_HIGH = false`
- o Socket.IO do frontend agora e criado apenas depois da hidratacao mínima da sessão, evitando conexão com token/organização em estado intermediario após F5

### Corrigido
- o AP do ESP32 deixava de aparecer quando o firmware saia do `SETUP_MODE`; agora, em desenvolvimento, o portal de manutenção permanece disponível sem desconectar MQTT nem bloquear telemetria
- timestamps MQTT implausiveis vindos do fallback `millis()/1000` do ESP32 passam a ser substituidos pela hora de recebimento no backend, evitando `lastSeenAt` antigo e falso offline
- refresh/F5 com organização salva inválida deixa de derrubar a sessão inteira: o frontend remove apenas a organização local inválida, tenta `/me` novamente e escolhe uma membership válida
- estados normais de boot, Wi-Fi connecting, MQTT connecting, setup e warning visual deixam de expor o buzzer a acionamento sonoro por padrão

### Documentado
- diferença entre AP de setup/fallback e AP de manutenção sempre ativo
- novo SSID curto `Q-ESP32-*`
- validação de MQTT por TCP, handshake `CONNACK`, logs de ingestão e sinais esperados no dashboard
- teste de refresh/F5 do frontend e comportamento esperado da hidratacao de sessão
- estado atual conservador do buzzer em bancada

### Pendente / Faltando
- validar em hardware real se o AP `Q-ESP32-*` permanece visivel enquanto MQTT conecta e publica telemetria no broker local
- confirmar no dashboard real se `telemetry:new` atualiza `lastSeenAt`, RSSI, bateria e heurística sem F5
- confirmar na placa física se `BUZZER_ACTIVE_HIGH = false` corresponde ao módulo usado; inverter em `app_config.h` se o lote for active-high

### Limitações conhecidas
- firewall local, rede institucional ou backend apontado para broker diferente ainda podem impedir ingestão mesmo com o firmware operacional
- o portal local continua sem autenticação própria e deve ser tratado como ferramenta de bancada/manutenção
- a rodada estabiliza observabilidade e estado de bancada, mas ainda depende de teste real no ESP32 para fechar a validação física

## [v0.8.11] - 2026-04-29
### Adicionado
- script `backend/scripts/testMqttConnection.js` e comando `npm run mqtt:test -- HOST PORT` para validar handshake MQTT com recebimento de `CONNACK`

### Alterado
- versão alinhada para `0.8.11` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- broker MQTT local de desenvolvimento passou a inicializar o `Aedes` com `Aedes.createBroker()`, conforme a API da versão instalada `aedes@1.0.2`
- logs do broker dev passaram a diferenciar conexão TCP, envio de `CONNACK`, cliente MQTT conectado/desconectado e erros de cliente/conexão/protocolo
- configuração local recomendada do backend passou a usar `MQTT_BROKER_URL=mqtt://127.0.0.1:1883`, mantendo o ESP32 apontado para o IPv4 real do notebook

### Corrigido
- corrigido o timeout de handshake MQTT do broker local de desenvolvimento causado por socket TCP aberto antes de o broker `Aedes` estar realmente em estado de escuta MQTT
- preservado o bind em `MQTT_BIND_HOST=0.0.0.0` e a porta `MQTT_PORT=1883`, sem alterar contratos MQTT, payloads do ESP32, API REST, Socket.IO ou pairing

### Documentado
- diferença entre `Test-NetConnection IP_DO_NOTEBOOK -Port 1883`, que valida apenas TCP, e teste MQTT real com cliente recebendo `CONNACK`
- fluxo de validação com `npm run mqtt:test -- 127.0.0.1 1883` e `npm run mqtt:test -- IP_DO_NOTEBOOK 1883`

### Pendente / Faltando
- validar em hardware real o botão `Testar MQTT` do portal do ESP32 após reiniciar o broker com esta versão

### Limitações conhecidas
- firewall local, perfil de rede do Windows, isolamento de clientes em redes institucionais, TLS ou credenciais incorretas ainda podem impedir o ESP32 mesmo com TCP e handshake local funcionando

## [v0.8.10] - 2026-04-29
### Alterado
- versão alinhada para `0.8.10` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- broker MQTT local de desenvolvimento passou a usar `MQTT_BIND_HOST=0.0.0.0` e `MQTT_PORT=1883` por padrão
- `scripts/start-all.ps1` passou a iniciar o broker dev com bind explícito em `0.0.0.0`, sem forcar `localhost` como interface de escuta

### Corrigido
- corrigido o bind do broker MQTT local de desenvolvimento, permitindo conexão TCP pelo IPv4 da LAN do notebook para uso do ESP32
- preservada compatibilidade com `DEV_BROKER_HOST`, `DEV_BROKER_PORT` e porta via argumento para fluxos locais existentes
- ajuste no teste TCP dos scripts Windows para tentar fallback manual quando `Test-NetConnection localhost` falhar por preferencia de IPv6

### Documentado
- diagnóstico Windows para identificar processo na porta `1883` com `netstat` e `Get-CimInstance`
- validação manual esperada com `Test-NetConnection IP_DO_NOTEBOOK -Port 1883`
- diferença entre `localhost`/loopback e IPv4 real do notebook para o ESP32

### Pendente / Faltando
- validar em hardware real se `Test-NetConnection IP_DO_NOTEBOOK -Port 1883` retorna `TcpTestSucceeded : True` no notebook alvo e se o botão `Testar MQTT` do portal do ESP32 passa

### Limitações conhecidas
- firewall local, perfil de rede do Windows ou isolamento entre clientes em redes institucionais ainda podem bloquear o ESP32 mesmo com o broker escutando em `0.0.0.0:1883`
- a rodada não altera contratos MQTT, payloads, API REST, Socket.IO ou logica de deteccao de queda

## [v0.8.9] - 2026-04-25
### Adicionado
- arquivo `LICENSE` com licença MIT para o projeto
- seção de licença no `README.md`, apontando para o arquivo `LICENSE`

### Alterado
- versão alinhada para `0.8.9` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- `README.md` revisado e reestruturado como entrada principal institucional do repositório
- documentação principal alinhada à arquitetura atual com firmware ESP32, MQTT, backend Node.js/Express, MySQL, Socket.IO, frontend React/Vite e dashboard multi-tenant
- limitações conhecidas documentadas com mais clareza, incluindo ausência de GPS, caráter não clínico do status heurístico, dependência de validação em hardware real e restrições de rede local
- metadados de licença dos pacotes locais alinhados para `MIT`
- descrição e tópicos do repositório no GitHub atualizados via `gh repo edit`

### Corrigido
- inconsistência em que o `README.md` ainda apontava baseline antiga em relação ao changelog
- problemas de português, acentuação e tom informal no `README.md`
- trechos do `README.md` que misturavam detalhes históricos com a visão atual do projeto sem separação clara entre funcionalidade pronta e limitação conhecida

### Pendente / Faltando
- revisar futuramente a acentuação completa dos documentos complementares em `docs/`, `backend/README.md` e `frontend/README.md`
- definir uma estratégia futura de migrações incrementais para substituir o reset completo via `database/schema.sql`

### Limitações conhecidas
- esta rodada foi documental e não incluiu teste em hardware real
- nenhuma validação de firmware com `PlatformIO` foi necessária para o escopo alterado
- o status heurístico continua experimental, pré-calibração e sem valor de diagnóstico clínico

### Divida técnica / Pontos fracos
- ainda existem documentos complementares com histórico operacional acumulado que podem ser condensados em uma rodada futura
- o repositório ainda não possui automação dedicada para validação de links Markdown

### Proximos passos sugeridos
- revisar os documentos complementares com o mesmo padrão linguístico aplicado ao `README.md`
- considerar uma tag `v0.8.9` se esta baseline documental for usada como marco antes da próxima rodada funcional

## [v0.8.8] - 2026-04-23
### Adicionado
- bloco de saúde operacional no portal do ESP32 com leitura separada de `Wi-Fi conectado`, `MQTT OK`, `Backend API` e `Pronto para operar`, alem de botoes `Testar backend` e `Testar MQTT`
- diagnóstico de realtime no frontend com fase da conexão do painel, motivo técnico discreto e separacao explicita entre socket do navegador e status MQTT/device

### Alterado
- versão alinhada para `0.8.8` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- `telemetry:new` passou a carregar `deviceStatusPatch`, permitindo atualizar bateria, RSSI, `lastSeenAt` e heurística sem depender de refetch pesado nas telas
- o detalhe do device passou a aplicar patch incremental da telemetria recente em vez de recarregar toda a tela a cada amostra
- o `MOTION_TEST_MODE_ENABLED` do firmware ficou desabilitado por padrão e o buzzer ganhou configuração explicita de polaridade com `BUZZER_ACTIVE_HIGH`

### Corrigido
- o painel deixou de sugerir que o device caiu quando quem falha e apenas o socket do navegador, deixando mais claro quando o problema esta no realtime do frontend
- o portal do ESP32 agora mostra confirmação visual mais honesta de conectividade/configuração, incluindo último teste MQTT e alcance do backend
- a telemetria passou a manter RSSI, bateria e snapshot técnico-clínico mais coerentes em tempo real com o que o firmware já conhece
- o buzzer deixou de ficar exposto ao `motion test` de bancada por padrão, reduzindo falsos disparos fora do cenário esperado

### Pendente / Faltando
- validar em hardware real o novo bloco de saúde do portal e o ajuste conservador do buzzer com a placa física usada em campo
- confirmar em bancada se a polaridade padrão `BUZZER_ACTIVE_HIGH = true` corresponde ao lote de hardware principal ou se sera preciso inverter em placas especificas

### Limitações conhecidas
- sem `PlatformIO` disponível neste ambiente, a rodada não conseguiu compilar o firmware localmente
- o portal continua existindo principalmente em `SETUP_MODE`, então `MQTT OK` depende de teste manual ou do último contexto conhecido enquanto o ESP32 ainda esta no modo de configuração

### Divida técnica / Pontos fracos
- o portal do ESP32 ainda concentra HTML inline em `src/setup_portal.cpp`, o que deixa iteracoes finas de UX mais trabalhosas
- o dashboard ainda usa refetch completo para alguns eventos de alerta/status, embora a telemetria já tenha ficado mais incremental

### Proximos passos sugeridos
- validar em hardware real se os novos testes do portal ajudam a fechar setup sem adivinhacao e se o buzzer ficou previsivel no lote principal de ESP32
- numa rodada futura, considerar um snapshot realtime mais rico também para alertas e status sem aumentar demais o custo do frontend

## [v0.8.7] - 2026-04-21
### Adicionado
- status comportamental/postural experimental derivado da telemetria atual com `state`, `confidence`, `reason` e espaco preparado para estados futuros como `andando`, `correndo` e `caido`

### Alterado
- versão alinhada para `0.8.7` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `frontend/package.json` e `frontend/package-lock.json`
- o dashboard, a listagem de devices e a página de detalhe passaram a exibir o estado heuristico atual do dispositivo com linguagem mais honesta e discreta

### Corrigido
- o backend agora enriquece snapshots de device com um status interpretado baseado em janela recente de telemetria e em eventos de queda recentes, sem alterar o contrato MQTT
- o frontend passou a reagir a `telemetry:new` para atualizar o estado heuristico em tempo real sem depender apenas de recarga manual

### Pendente / Faltando
- validar os limiares em hardware real com mais cenários de uso, especialmente para diferenciar melhor `deitado`, `sentado` e repouso geral
- decidir numa rodada futura se a calibração individual do uso corporal do sensor vai migrar para um fluxo dedicado

### Limitações conhecidas
- esta classificacao e experimental, pre-calibração e não representa diagnóstico clínico
- sem calibração por paciente/dispositivo, posturas especificas ainda podem cair em estados mais genericos como `em_reposo` ou `desconhecido`
- a validação desta rodada não incluiu hardware real

### Divida técnica / Pontos fracos
- a heurística ainda depende de poucos sinais (`accel_magnitude`, `gyro_magnitude`, `pitch_deg`, `roll_deg` e eventos recentes), sem janela historica longa nem modelo adaptativo
- pages como `Devices` e `Dashboard` ainda fazem refresh completo para alguns eventos, embora a telemetria já atualize o estado localmente

### Proximos passos sugeridos
- coletar amostras reais por postura para revisar thresholds antes de tentar estados mais ambiciosos como `andando` e `correndo`
- considerar uma calibração leve por device/paciente para reduzir falsos `desconhecido` e melhorar a confiança das posturas

## [v0.8.6] - 2026-04-16
### Adicionado
- evento realtime `device:claimed` para o dashboard detectar a conclusao do claim associado ao código de pairing atual

### Alterado
- versão alinhada para `0.8.6` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `frontend/package.json` e `frontend/package-lock.json`
- o modal de pairing agora troca para um estado final de sucesso, deixa de tratar o código como ativo e fecha automaticamente alguns segundos após o claim

### Corrigido
- o firmware passou a filtrar a resposta JSON do claim e da sincronização de perfil, lendo apenas `deviceSyncToken` e `patientProfile` sem depender do payload completo do backend
- o portal do ESP32 deixa de mostrar o aviso de JSON não interpretado quando o claim já foi aceito e a resposta traz o snapshot completo do backend
- o dashboard agora reage ao sucesso do pairing em tempo real, atualiza o device correspondente e orienta o fechamento do modal sem depender de acao manual

### Pendente / Faltando
- repetir o pairing ponta a ponta em hardware real para confirmar a persistência de `deviceSyncToken` e `patientProfile` no ESP32 após reboot

### Limitações conhecidas
- a validação desta rodada não compilou o firmware localmente porque `pio`/`platformio` não estavam disponíveis no ambiente

### Divida técnica / Pontos fracos
- o portal ainda depende de parsing embarcado em `src/patient_profile_client.cpp`, que continua sensivel a futuras mudanças no shape do backend fora dos campos filtrados
- o feedback visual de sucesso no dashboard ainda depende da conexão realtime ativa com o backend

### Proximos passos sugeridos
- validar em bancada se o ESP32 reaparece com `deviceSyncToken` e perfil resumido preservados em NVS depois do claim
- se necessário, adicionar um pequeno indicador de reconexao realtime no modal para cobrir o caso raro em que o claim conclui mas o socket do navegador cai no meio do fluxo

## [v0.8.5] - 2026-04-16
### Adicionado
- `details.stage` e códigos diagnósticos no backend para facilitar a identificação objetiva da etapa que falhou em `POST /api/pairing/claim`

### Alterado
- versão alinhada para `0.8.5` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `frontend/package.json` e `frontend/package-lock.json`
- o portal do ESP32 passou a diferenciar melhor falhas internas de pairing, schema desatualizado e inconsistências de dados vindas do backend

### Corrigido
- heurística de `network-info` passou a priorizar com mais consistência a interface realmente ativa na rede atual, reduzindo casos em que IP host-only ou virtual aparecia como URL principal recomendada
- o fluxo de claim do ESP32 no backend agora devolve diagnóstico mais claro quando a falha acontece em etapa interna do pairing, em vez de cair apenas em erro genérico
- as mensagens do portal do ESP32 ficaram mais objetivas para diferenciar erro interno, schema de banco desatualizado e inconsistências de dados

### Pendente / Faltando
- repetir o teste ponta a ponta do pairing em hardware real para confirmar a etapa reportada pelo backend no ambiente de uso
- alinhar o banco real com `database/schema.sql` caso o backend ainda devolva `PAIRING_SCHEMA_MISMATCH`

### Limitações conhecidas
- a heurística da URL principal continua sendo `best effort` e pode exigir fallback manual em redes Windows muito fora do padrão
- o claim do ESP32 continua dependente de o schema real do banco estar alinhado com a versão atual do backend

### Divida técnica / Pontos fracos
- o fluxo transacional de pairing ainda concentra varias etapas em `backend/src/services/pairingService.js`, o que aumenta o acoplamento com o schema real do banco
- o portal do ESP32 ainda depende de HTML inline em `src/setup_portal.cpp`, tornando iteracoes finas de UX mais trabalhosas

### Proximos passos sugeridos
- validar em campo a nova selecao da URL principal com notebooks que tenham adaptadores virtuais instalados
- se o claim ainda falhar, usar `details.stage` e `code` para fechar a causa raiz no banco antes de abrir nova rodada de UX

## [v0.8.4] - 2026-04-15
### Adicionado
- `primaryBackendApiBaseUrl` e `fallbackBackendApiBaseUrls` em `GET /api/system/network-info` para a UI tratar uma URL principal e fallbacks de rede sem quebrar compatibilidade com `suggestedBackendApiBaseUrl`

### Alterado
- versão alinhada para `0.8.4` em `CHANGELOG.md`, `package.json` da raiz, `backend/package.json` e `frontend/package.json`
- modal de pairing do dashboard passou a destacar uma URL principal recomendada, mostrar expiração do código e esconder URLs secundarias em `Outras opcoes de rede`
- portal local do ESP32 foi simplificado para o fluxo manual confiável de `BACKEND_API_BASE_URL` + código temporário + `Parear agora`
- `README.md`, `frontend/README.md`, `docs/integration.md`, `docs/firmware-hardware.md` e `docs/quickstart-windows.md` foram alinhados ao fluxo simplificado
- o frontend deixou de depender de `qrcode.react`, removendo uma dependencia que já não fazia parte da UX real

### Corrigido
- heurística de `network-info` agora prioriza interfaces LAN reais e desprioriza adaptadores virtuais, host-only e VPN ao sugerir a URL principal
- o backend passou a classificar erros de pairing com códigos mais claros para inválido, expirado, já usado e device já pareado em outra organização
- o portal do ESP32 agora traduz falhas de pairing em mensagens mais objetivas para backend inacessivel, URL inválida e códigos rejeitados

### Pendente / Faltando
- validar o fluxo completo em hardware real com celular e notebook na mesma rede para confirmar a heurística da URL principal em cenários reais

### Limitações conhecidas
- o pairing ainda depende de o notebook/backend estar acessivel pelo ESP32 na mesma rede ou em uma rota permitida
- `battery_level` do firmware real ainda e placeholder fixo em `100`

### Divida técnica / Pontos fracos
- `src/setup_portal.cpp` ainda concentra HTML inline e mensagens de UX embarcada
- a heurística de escolha da URL principal continua sendo best effort e pode exigir fallback em redes muito incomuns

### Proximos passos sugeridos
- validar em bancada com Android e iPhone se a URL principal sugerida reduz tentativas manuais na maioria dos cenários
- considerar uma telemetria administrativa simples para registrar falhas de pairing por tipo de erro no backend
## [v0.8.3] - 2026-04-11
### Adicionado
- governanca mínima do repositorio com `AGENTS.md`, `docs/commit-guidelines.md` e `docs/release-rules.md`
- template de PR em `.github/pull_request_template.md` com checklist de segurança e validação

### Alterado
- versão alinhada para `0.8.3` em `CHANGELOG.md`, `package.json` da raiz, `backend/package.json` e `frontend/package.json`
- normalização do `backendApiBaseUrl` no firmware para tolerar esquema HTTP/HTTPS com capitalizacao variada e remover barra final

### Corrigido
- o portal do ESP32 passa a aceitar URLs locais válidas mesmo quando o esquema vem capitalizado via celular ou QR

### Pendente / Faltando
- nenhuma pendencia nova registrada nesta rodada

### Limitações conhecidas
- o scanner de QR do portal depende de suporte de camera/navegador e pode não funcionar em captive portal HTTP
- `battery_level` do firmware real ainda e placeholder fixo em `100`

### Divida técnica / Pontos fracos
- o portal do ESP32 ainda concentra HTML inline em `setup_portal.cpp`

### Proximos passos sugeridos
- validar o pairing em rede real com celulares que autocapitalizam URLs e registrar o fluxo no manual de testes

## [v0.8.2] - 2026-04-10
### Adicionado
- gating simples de logs no firmware via `FIRMWARE_LOG_LEVEL` e flags de debug em `include/app_config.h`
- snapshot leve de eventos criticos pendentes em `NVS`, limitado e restaurado após reboot quando fizer sentido
- preparação opt-in para `MQTT/TLS` no firmware e no backend, mantendo `mqtt://` como padrão funcional
- `frontend/src/config/runtime.ts` para normalizar URLs de API e `Socket.IO`

### Alterado
- versão do projeto alinhada para `0.8.2` em `CHANGELOG.md`, `package.json` da raiz, `backend/package.json` e `frontend/package.json`
- `.gitignore` da raiz foi fortalecido para PlatformIO, Node, builds, caches, logs, `.env` e arquivos temporários
- `backend/.env.example` passou a documentar `LOG_LEVEL` e opcoes opcionais de MQTT/TLS
- `scripts/check-env.ps1` e `scripts/setup-dev.ps1` agora avisam sobre a faixa recomendada de `Node.js 20+`
- `src/setup_portal.cpp` foi modularizado em helpers menores sem mudar rotas nem o comportamento do portal
- a bridge MQTT do backend agora usa opcoes configuraveis de reconnect, keepalive, timeout e TLS

### Corrigido
- o backend deixou de emitir logs tao verbosos para cada conexão/desconexao `Socket.IO` fora de `debug`
- o firmware reduziu ruído serial em diagnósticos de I2C, conectividade e buffer sem perder mensagens criticas
- o frontend passou a normalizar `VITE_API_URL` e `VITE_SOCKET_URL`, evitando pequenas inconsistências por barra final

### Pendente / Faltando
- evoluir a persistência do buffer do firmware alem do snapshot pequeno, caso um caso real de campo justifique
- decidir se a configuração de TLS do firmware deve ganhar UI própria no portal local ou permanecer apenas por defaults/NVS
- continuar reduzindo o peso de `src/setup_portal.cpp` se a UX embarcada crescer mais

### Limitações conhecidas
- o snapshot em `NVS` cobre apenas um conjunto pequeno de eventos criticos e não substitui persistência completa
- `telemetry` continua fora do `EventBuffer`
- o fluxo padrão do projeto continua em `MQTT` sem `TLS`; a base de `mqtts://` ficou apenas preparada, não ativada por padrão
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- a placa atual ainda pode exigir `BOOT` manual durante o upload, por limitação de auto-reset/bootloader

### Divida técnica / Pontos fracos
- o portal do ESP32 ainda concentra HTML inline, apesar da modularizacao desta rodada
- a persistência de eventos no firmware ainda depende de snapshot pequeno, não de fila duravel completa
- a configuração de TLS do firmware ainda não e exposta no portal, apenas preservada para evolução segura futura

### Proximos passos sugeridos
- validar em bancada se o snapshot do buffer reduz perda perceptivel em reboot rapido sem aumentar desgaste de flash
- considerar uma forma mais ergonomica de gerenciar TLS no firmware quando houver broker seguro real de homologacao
- seguir refinando o setup do frontend e do backend para reduzir variacoes de ambiente entre maquinas Windows

## [v0.8.1] - 2026-04-10
### Adicionado
- nenhuma funcionalidade nova; esta versão registra o refinamento visual do modal de pairing

### Alterado
- o modal de pairing em `frontend/src/pages/DevicesPage.tsx` deixou de exibir o bloco visual com o JSON cru do QR
- a UX do modal foi simplificada para destacar apenas código temporário, URL sugerida, IPs candidatos, QR code e botoes de copia relevantes
- `README.md`, `frontend/README.md`, `docs/quickstart-windows.md`, `docs/firmware-hardware.md` e `docs/integration.md` foram alinhados ao novo texto menos técnico

### Corrigido
- a interface do dashboard deixou de expor o payload JSON do QR, reduzindo ruído visual para o usuário final
- o texto do pairing passou a orientar o fluxo principal por QR ou preenchimento manual, sem depender de detalhes internos do payload

### Pendente / Faltando
- avaliar se vale adicionar uma dica visual mais forte para o caso em que o navegador do celular não consiga abrir a camera no portal do ESP32
- continuar refinando a UX do pairing para reduzir passos manuais em ambientes com IP local variavel

### Limitações conhecidas
- o QR continua codificando `backendApiBaseUrl` e `pairingCode`, mas o conteudo cru não e mais mostrado no dashboard
- o portal do ESP32 ainda preserva a importacao dos dados do QR como fallback técnico, embora esse não seja mais o caminho principal documentado na UI do site
- o scanner de QR do portal segue dependente de suporte real de camera/navegador
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware não persiste após reboot do ESP32
- o projeto continua usando MQTT sem `TLS`

### Divida técnica / Pontos fracos
- o portal do ESP32 ainda precisa manter suporte a importacao textual dos dados do QR, o que continua sendo um detalhe técnico pouco elegante
- a experiencia de pairing ainda depende de o operador informar uma URL local de backend acessivel na rede do dispositivo

### Proximos passos sugeridos
- experimentar uma UX de pairing com dicas contextuais por tipo de rede, como notebook local, hotspot ou broker externo
- avaliar se o frontend deve mostrar um resumo ainda mais direto do passo a passo logo abaixo do QR

## [v0.8.0] - 2026-04-10
### Adicionado
- `GET /api/system/network-info` para o frontend sugerir a melhor `backendApiBaseUrl` local para o pairing do ESP32
- QR code no modal de pairing em `Devices`, com copia de URL, código e payload JSON
- importacao do payload do QR no portal local do ESP32, preenchendo `BACKEND_API_BASE_URL` e `pairing_code`
- scanner opcional de QR por camera no portal do ESP32 como progressive enhancement
- campos `weight_kg` e `height_cm` no cadastro de pacientes
- sincronização resumida do perfil do paciente para o ESP32 via `deviceSyncToken` e `POST /api/pairing/device-profile-sync`
- novo módulo embarcado `patient_profile_client` para claim + sync do perfil resumido em `NVS`

### Alterado
- `database/schema.sql` passou a incluir `weight_kg` e `height_cm` em `patients`, alem de `device_sync_token_hash` em `devices`
- `database/seed.sql` passou a popular peso e altura do `Paciente Demo`
- a UI de pairing do frontend agora consulta `GET /api/system/network-info` e mostra QR/payload sem remover o fluxo manual
- o portal do ESP32 continua focado em setup, mas agora mostra o perfil resumido do paciente sincronizado
- `README.md`, `backend/README.md`, `frontend/README.md`, `docs/integration.md`, `docs/firmware-hardware.md` e `docs/quickstart-windows.md` foram sincronizados com o novo fluxo
- o frontend voltou a declarar corretamente as dependencias de build do `Tailwind CSS`, deixando o ambiente reproduzivel depois da instalacao do `qrcode.react`

### Corrigido
- pairing deixou de depender apenas de copiar URL e código manualmente do dashboard
- o ESP32 agora consegue persistir `deviceSyncToken` e resincronizar o perfil resumido do paciente sem editar dados clinicos no portal
- a página de pacientes passou a editar e exibir `peso` e `altura` junto do nome
- o ambiente do frontend deixou de depender de dependencia transiente de `tailwindcss` fora do `package.json`

### Pendente / Faltando
- usar `fallSensitivityPreset` real no backend e no firmware; por enquanto ele segue `null`
- criar uma tela dedicada de detalhes do paciente com histórico, analytics e futuros presets
- decidir se o dashboard deve mostrar mais KPIs clinicos derivados de `peso` e `altura`
- avaliar um gatilho mais imediato de sync do perfil para o device logo após reassignment, alem do polling periódico

### Limitações conhecidas
- o scanner de QR do portal depende de suporte de camera/navegador e pode não funcionar em captive portal HTTP
- o fallback obrigatorio continua sendo colar o payload do QR ou preencher URL + código manualmente
- `deviceSyncToken` melhora o sync do perfil, mas ainda não adiciona uma camada completa de autenticação forte para o device
- `fallSensitivityPreset` ainda não tem regra aplicada no backend nem no firmware
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware não persiste após reboot do ESP32
- o projeto continua usando MQTT sem `TLS`

### Divida técnica / Pontos fracos
- o `BACKEND_API_BASE_URL` ainda fica agrupado na configuração de conectividade do device, não em um bloco próprio de pairing/backend
- o sync resumido de paciente ainda depende de polling HTTP periódico enquanto o device esta online
- o portal do ESP32 concentra bastante HTML inline em `setup_portal.cpp`, o que deixa evolucoes de UX mais trabalhosas
- ainda não existe um token de longa duracao com rotacao/expiração formal para o device alem do hash salvo em `devices`

### Proximos passos sugeridos
- adicionar detalhe de paciente no frontend com IMC e contexto clínico basico
- avaliar envio de `patientProfileVersion` ou hash para reduzir sincronizações desnecessarias no ESP32
- considerar uma acao administrativa de forcar resincronizacao do perfil do device pelo dashboard
- seguir endurecendo o caminho dispositivo -> backend com autenticação mais forte e, futuramente, `TLS`

## [v0.7.9] - 2026-04-09
### Adicionado
- nenhuma funcionalidade nova; esta versão registra o refinamento do helper de liberacao da `COM`

### Alterado
- [scripts/free-serial-port.ps1](scripts/free-serial-port.ps1) deixou de mirar qualquer processo `platformio` genericamente e passou a focar em monitores seriais e `esptool`

### Corrigido
- a limpeza automática da `COM` não tenta mais encerrar o próprio processo de upload do `PlatformIO`

### Pendente / Faltando
- validar novamente o hook pre-upload com a limpeza refinada
- continuar separando conflito de porta presa de limitação física de auto-boot da placa

### Limitações conhecidas
- mesmo com a limpeza mais segura, a placa atual ainda pode continuar exigindo `BOOT` se o problema for realmente do circuito de auto-reset

### Divida técnica / Pontos fracos
- a automação de serial no Windows ainda depende de heurística por linha de comando de processo

### Proximos passos sugeridos
- repetir um upload sem `BOOT` para confirmar que o hook funciona e que o erro restante continua sendo `Wrong boot mode detected (0x13)`

## [v0.7.8] - 2026-04-09
### Adicionado
- nenhuma funcionalidade nova; esta versão registra a correção da automação pre-upload recém-integrada ao `PlatformIO`

### Alterado
- [scripts/pio-pre-upload.py](scripts/pio-pre-upload.py) foi ajustado para usar a assinatura correta do hook `before_upload` do `PlatformIO`

### Corrigido
- erro `TypeError: before_upload() got an unexpected keyword argument 'env'` durante o upload com a nova automação de limpeza da `COM`

### Pendente / Faltando
- validar novamente o upload com o hook pre-upload funcionando
- seguir diferenciando conflito de serial presa versus limitação física de auto-boot da placa

### Limitações conhecidas
- mesmo com a limpeza automática correta, ainda esperamos que a placa atual continue exigindo `BOOT` enquanto o auto-reset dela não for resolvido

### Divida técnica / Pontos fracos
- o fluxo de upload ainda mistura mitigacoes de software com uma limitação física da placa atual

### Proximos passos sugeridos
- validar o hook pre-upload em uma tentativa sem `BOOT`
- manter o foco do diagnóstico no auto-boot da placa caso a `COM` continue livre e o erro siga sendo `Wrong boot mode detected (0x13)`

## [v0.7.7] - 2026-04-09
### Adicionado
- automação pre-upload em [scripts/pio-pre-upload.py](scripts/pio-pre-upload.py) para chamar a limpeza da porta serial antes da gravação no Windows

### Alterado
- [platformio.ini](platformio.ini) agora usa `extra_scripts = pre:scripts/pio-pre-upload.py`
- `README.md`, `docs/firmware-hardware.md`, `docs/quickstart-windows.md` e `docs/motion-test-bench-report.md` foram atualizados com o fluxo de limpeza automática da `COM`

### Corrigido
- o projeto deixou de depender apenas de limpeza manual da `COM` antes de cada upload no Windows
- conflitos de monitor serial preso agora recebem uma mitigacao automática no fluxo do `PlatformIO`

### Pendente / Faltando
- eliminar a necessidade de segurar `BOOT` durante o upload nesta placa especifica
- confirmar se o comportamento se repete com a placa totalmente sem perifericos externos
- validar se outra placa ESP32 com auto-reset funcional faz upload automático com a mesma configuração

### Limitações conhecidas
- a limpeza automática da `COM` ajuda apenas no problema de porta ocupada
- o erro principal sem `BOOT` continua sendo `Wrong boot mode detected (0x13)`
- isso ainda aponta para problema de auto-boot/auto-reset da placa, não para configuração principal do `PlatformIO`

### Divida técnica / Pontos fracos
- o fluxo de upload ainda depende de comportamento físico da placa `CH9102`
- o projeto não controla por software a qualidade do circuito de auto-reset da placa USB-serial

### Proximos passos sugeridos
- testar upload com a placa totalmente desacoplada dos perifericos
- comparar com outra ESP32 para diferenciar configuração do projeto de limitação da placa atual
- se a placa continuar exigindo `BOOT`, registrar esse procedimento como limitação física definitiva

## [v0.7.6] - 2026-04-07
### Adicionado
- confirmação operacional em bancada de que a nova build realmente subiu no ESP32 depois da gravação manual com `BOOT`

### Alterado
- [docs/motion-test-bench-report.md](docs/motion-test-bench-report.md) foi atualizado com o boot normal observado, a entrada em `SETUP_MODE` e o AP `Queda-Setup-*` anunciado na serial

### Corrigido
- a rodada de validação deixou de estar apenas em nível de compilação/upload: agora houve confirmação de boot normal da nova build no hardware
- o crash loop anterior deixou de aparecer depois da nova gravação e do boot limpo

### Pendente / Faltando
- conectar de fato ao AP `Queda-Setup-*` pelo celular ou notebook
- configurar Wi-Fi/MQTT no portal e validar a conectividade fim a fim
- testar um gesto realmente brusco no case para confirmar o comportamento atualizado do `MOTION TEST`

### Limitações conhecidas
- o upload ainda depende de segurar `BOOT` na placa atual
- a validação desta rodada confirmou o AP pela serial, mas ainda não realizou a configuração completa pelo portal
- o `MOTION TEST` foi observado sem falso disparo em repouso, mas ainda falta o teste completo de gesto brusco no case

### Divida técnica / Pontos fracos
- o auto-reset para upload continua sem solucao definitiva
- a validação do portal AP ainda depende de interação manual fora da serial
- a placa continua exigindo procedimento operacional cuidadoso entre upload, reset e monitor

### Proximos passos sugeridos
- conectar ao AP `Queda-Setup-*` e preencher Wi-Fi/MQTT
- validar o portal no celular e no notebook
- repetir o teste do `MOTION TEST` com movimento brusco real no case

## [v0.7.5] - 2026-04-07
### Adicionado
- registro incremental do procedimento operacional atual de upload para a placa `CH9102`, incluindo uso de `BOOT` manual durante `Connecting...`

### Alterado
- `README.md`, `docs/firmware-hardware.md`, `docs/integration.md`, `docs/quickstart-windows.md` e `docs/motion-test-bench-report.md` foram atualizados para refletir que a nova build entrou na placa, mas o auto-reset ainda não ficou confiável

### Corrigido
- a nova build do firmware foi finalmente gravada com sucesso na `COM4` quando o `BOOT` foi mantido pressionado durante o upload
- a investigacao deixou claro que o problema restante não e mais a serial ocupada, e sim a entrada automática em download mode

### Pendente / Faltando
- confirmar o boot normal da aplicação após a nova gravação sem deixar a placa presa em `DOWNLOAD_BOOT`
- validar fisicamente o portal AP e o `MOTION TEST` já com a build nova executando
- investigar se existe ajuste adicional de reset/driver que elimine a necessidade de segurar `BOOT`

### Limitações conhecidas
- o upload manual funciona, mas o auto-reset da placa ainda não e confiável
- durante a depuração serial desta rodada, uma tentativa de reset automatizado deixou a placa em `DOWNLOAD_BOOT`, exigindo novo boot limpo para validar a aplicação
- o helper de porta resolve a `COM` ocupada, mas não resolve sozinho a entrada em bootloader

### Divida técnica / Pontos fracos
- ainda falta um fluxo 100% reproduzivel de upload sem intervencao manual nessa placa
- o comportamento das linhas `DTR/RTS` com a ponte `CH9102` ainda não esta estabilizado no projeto
- a validação de bancada continua dependente de operação manual cuidadosa entre upload, reset e monitor

### Proximos passos sugeridos
- fazer um boot limpo da placa e capturar o log normal da nova build
- validar `FORCE_SETUP_MODE_ON_BOOT` e o AP `Queda-Setup-*` agora que a build nova já foi gravada
- repetir o teste do `MOTION TEST` em repouso seguido de gesto brusco para verificar se os falsos apitos diminuiram

## [v0.7.4] - 2026-04-07
### Adicionado
- helper [scripts/free-serial-port.ps1](scripts/free-serial-port.ps1) para desalojar processos `PlatformIO` / `esptool` que prendem a `COM` no Windows
- novo registro no relatório de bancada com o log real da `COM4`, incluindo o crash loop do firmware antigo e o estado atual do upload

### Alterado
- `platformio.ini` passou a usar `monitor_dtr = 0` e `monitor_rts = 0` para reduzir efeitos indesejados do monitor serial sobre o ESP32
- `README.md`, `docs/firmware-hardware.md`, `docs/integration.md`, `backend/README.md`, `frontend/README.md`, `docs/quickstart-windows.md` e `docs/motion-test-bench-report.md` foram atualizados com o fluxo real da `COM4`

### Corrigido
- a porta `COM4` deixou de ficar bloqueada por monitor `PlatformIO` orfao sem caminho claro de recuperacao
- foi corrigida no firmware local a falha de inicializacao em que `ConnectivityManager::enterSetupMode()` chamava `disconnect()` antes de o cliente MQTT estar corretamente associado ao `WiFiClient`
- o carregamento inicial de `Preferences` deixou de gerar o caminho mais ruidoso no primeiro boot ao abrir a configuração persistente

### Pendente / Faltando
- gravar a build corrigida no hardware real
- confirmar se o crash loop desaparece na placa depois da nova gravação
- eliminar a necessidade de segurar `BOOT` para upload, se isso for viavel via software ou confirmar de vez que a limitação e do hardware/driver

### Limitações conhecidas
- o upload automático ainda falha com `Wrong boot mode detected (0x13)` mesmo com a `COM4` livre
- isso indica que a placa continua entrando em boot normal em vez de download mode durante o upload
- o ESP32 conectado em `COM4` ainda esta rodando uma build anterior, porque a nova compilação não foi gravada nesta sessão
- o `MOTION TEST` ajustado e o `FORCE_SETUP_MODE_ON_BOOT` ainda dependem de nova gravação para serem validados fisicamente

### Divida técnica / Pontos fracos
- o projeto ainda não tem um fluxo totalmente automático e confiável de upload para esta placa/ponte `CH9102`
- a causa exata da necessidade de segurar `BOOT` ainda não foi eliminada por software nesta rodada
- faltam testes automatizados de bancada para serial, bootloader e portal AP

### Proximos passos sugeridos
- testar a gravação logo após liberar a `COM4`, evitando qualquer monitor serial concorrente
- validar se a nova build remove o crash loop e libera o AP `Queda-Setup-*`
- se o upload automático continuar exigindo `BOOT`, tratar isso como limitação do auto-reset da placa e registrar um procedimento operacional padrão

## [v0.7.3] - 2026-04-07
### Adicionado
- flag `FORCE_SETUP_MODE_ON_BOOT` no firmware para forcar o portal/AP `Queda-Setup-*` durante testes de bancada
- relatório de bancada em [docs/motion-test-bench-report.md](docs/motion-test-bench-report.md) com achados sobre `MOTION TEST`, AP local e limitações da sessão na `COM4`
- novos parâmetros do `MOTION TEST` para armar o teste apenas após curto periodo de repouso relativo

### Alterado
- o `MOTION TEST` passou a usar defaults mais conservadores para bancada, com cooldown maior e estratégia padrão exigindo `accel + gyro`
- `README.md`, `docs/firmware-hardware.md`, `docs/integration.md`, `backend/README.md`, `frontend/README.md` e `docs/quickstart-windows.md` foram atualizados para refletir o teste de AP e o novo comportamento do motion test

### Corrigido
- dificuldade de testar o portal local quando o ESP32 ainda tinha configuração válida salva e não entrava espontaneamente em `SETUP_MODE`
- tendencia do `MOTION TEST` a apitar por movimento parcial, vibracao ou giro isolado em vez de privilegiar um gesto mais brusco

### Pendente / Faltando
- repetir a validação física com upload real na `COM4` após liberar a porta serial
- capturar log de boot do ESP32 já com a nova build para confirmar visualmente o `SETUP_MODE` e o AP em bancada
- avaliar se vale expor o `FORCE_SETUP_MODE_ON_BOOT` ou um trigger temporário pelo próprio portal no futuro

### Limitações conhecidas
- a `COM4` estava ocupada nesta sessão, então não foi possível concluir upload e captura de serial do hardware real depois da nova build
- o AP `Queda-Setup-*` continua aparecendo apenas em `SETUP_MODE` ou quando `FORCE_SETUP_MODE_ON_BOOT = true`
- o `MOTION TEST` continua sendo um diagnóstico local simples e não substitui o `fall_detector`
- o firmware continua sem `TLS` para MQTT, com `battery_level` placeholder e `EventBuffer` volatil

### Divida técnica / Pontos fracos
- ainda não existe um trigger de setup mode temporário sem recompilar para bancada, alem do fallback automático ou da flag em `app_config`
- o comportamento real do buzzer ainda depende da montagem mecanica, alimentacao e do módulo de buzzer usado no case
- faltou uma captura de serial e validação física final nesta rodada por indisponibilidade da porta

### Proximos passos sugeridos
- liberar a `COM4`, gravar a build nova e confirmar em bancada o AP de setup
- testar o `MOTION TEST` com o dispositivo parado por ~1 segundo antes do gesto brusco
- se ainda houver apitos indevidos, subir gradualmente `MOTION_TEST_GYRO_THRESHOLD_DPS` e `MOTION_TEST_ARM_AFTER_STILLNESS_MS`

## [v0.7.2] - 2026-04-07
### Adicionado
- `AppErrorBoundary` no frontend para evitar tela branca total e oferecer recuperacao rapida da sessão local
- reidratacao da sessão do frontend com `GET /api/me` no boot, alinhando o usuário salvo no navegador ao contrato multi-tenant atual
- documentação operacional para o caso de erro no `AuthProvider` por sessão antiga no `localStorage`

### Alterado
- `AuthProvider` passou a normalizar `memberships`, organização ativa e usuário salvo antes de renderizar rotas protegidas
- `README.md`, `backend/README.md`, `frontend/README.md`, `docs/integration.md`, `docs/firmware-hardware.md` e `docs/quickstart-windows.md` foram sincronizados com a correcao de sessão e tela branca

### Corrigido
- tela branca total em `/login`, `/dashboard` e outras rotas quando havia sessão antiga incompatível salva no navegador
- erro `Cannot read properties of undefined (reading 'find')` no `AuthProvider` quando `user.memberships` não existia no shape legado
- recuperacao da sessão do frontend deixou de depender cegamente do objeto antigo salvo no `localStorage`

### Pendente / Faltando
- validar esse fluxo também em navegadores diferentes com storage legado real de versões anteriores
- adicionar testes automatizados de boot com sessão antiga e sem `memberships`
- ampliar a cobertura de fallback visual para erros assíncronos fora da fase de render

### Limitações conhecidas
- o `DeviceDetailPage` continua sendo o chunk mais pesado do frontend
- se o backend estiver apontando para um banco antigo, o login ainda falhara até que `.\scripts\init-db.ps1` seja executado
- o firmware continua sem mudança nesta rodada e mantém as limitações anteriores, como MQTT sem `TLS`, `battery_level` placeholder e `EventBuffer` volatil
- ainda não existe fluxo completo de unpair cross-tenant pela UI

### Divida técnica / Pontos fracos
- a sessão ainda depende de `localStorage` simples, sem refresh token
- o error boundary cobre renderizacao, mas não substitui instrumentacao mais rica de erros em runtime
- faltam testes automatizados de compatibilidade entre contratos antigos de frontend e novas respostas do backend

### Proximos passos sugeridos
- adicionar teste automatizado para storage legado e reidratacao via `/api/me`
- considerar observabilidade mais clara de erros de boot no frontend
- continuar quebrando a tela de detalhe do device em partes menores para reduzir o maior chunk atual

## [v0.7.1] - 2026-04-07
### Adicionado
- validação multi-tenant mais completa no `smoke-test.ps1`, agora usando `activeOrganizationId` do login para enviar `X-Organization-Id`
- verificação explicita de `GET /api/organization` e `GET /api/patients` no smoke test para cobrir melhor o modelo por tenant
- carregamento sob demanda das rotas principais do frontend para reduzir o peso inicial da aplicação

### Alterado
- `RealtimeContext` do frontend foi simplificado para recriar e desconectar o `Socket.IO` de forma previsivel quando token ou organização ativa mudam
- o modal de edição de device passou a reinicializar estado por dispositivo, evitando reaproveitamento indevido de dados de um item anterior
- `README.md`, `backend/README.md`, `frontend/README.md`, `docs/integration.md`, `docs/firmware-hardware.md` e `docs/quickstart-windows.md` foram sincronizados com a rodada de estabilizacao

### Corrigido
- `GET /api/dashboard/summary` voltou a entregar `recentEvents` com contexto de paciente compatível com o frontend
- erros de lint e problemas de ciclo de vida no frontend após a migração multi-tenant foram eliminados
- o frontend deixou de depender de um bundle inicial tao pesado quanto antes, reduzindo a carga principal com divisao por rota
- a automação local deixou de validar apenas endpoints legados e passou a refletir melhor o comportamento esperado no modelo por organização
- o smoke test agora explica explicitamente o caso em que o login responde `500` por banco ainda preso ao schema anterior ao modelo multi-tenant

### Pendente / Faltando
- executar novamente o smoke test completo com backend, frontend, banco e broker todos ativos no mesmo ciclo de verificação
- ampliar a cobertura automática para fluxos de pairing, assign de paciente e acoes concorrentes de alerta
- criar página dedicada de detalhe de paciente

### Limitações conhecidas
- o `DeviceDetailPage` ainda concentra um chunk relativamente maior do que as demais telas
- o smoke test continua focado no fluxo principal HTTP e só faz verificação auxiliar do mock publisher
- o firmware continua sem nova mudança nesta rodada, mantendo as limitações anteriores de MQTT sem `TLS`, `battery_level` placeholder e `EventBuffer` volatil
- ainda não existe fluxo completo de unpair cross-tenant pela UI

### Divida técnica / Pontos fracos
- a estratégia atual de lazy loading melhora a carga inicial, mas ainda não separa partes mais pesadas internas da tela de detalhe do device
- a restricao por caregiver assignment continua dependendo da existencia de assignments explícitos para estreitar o escopo alem da organização ativa
- o projeto segue sem uma bateria automatizada fim a fim para validar UI + API + MQTT em um unico passo

### Proximos passos sugeridos
- quebrar a tela de detalhe do device em mais partes carregadas sob demanda
- adicionar smoke tests de role/path para `organization_admin`, `caregiver` e `viewer`
- incluir no smoke test uma verificação opcional do fluxo de pairing e do claim quando houver ESP32 ou ambiente controlado disponível

## [v0.7.0] - 2026-04-07
### Adicionado
- modelo multi-tenant com `organizations`, `organization_members`, `patients`, `caregiver_assignments`, `device_pairing_sessions` e `device_assignment_history`
- pairing seguro por código temporário e de uso unico, com endpoint publico `POST /api/pairing/claim` para o ESP32
- claim status em `devices` com estados `unclaimed`, `claimed` e `disabled`
- histórico de assignment para preservar rastreabilidade de troca de paciente sem reescrever o passado
- novas telas no frontend para `Patients` e `Organization`, alem do fluxo de pairing e vinculacao de paciente na tela de devices
- suporte no firmware para `device_uid`, `BACKEND_API_BASE_URL` e envio de claim ao backend a partir do portal local do ESP32

### Alterado
- backend deixou de ser global e passou a aplicar escopo por organização nas rotas de dashboard, devices, eventos, alertas, pacientes e membros
- cadastro via `POST /api/auth/register` agora cria uma nova organização e o `organization_admin` inicial, em vez de promover o primeiro usuário global do sistema
- dashboard do frontend agora mostra apenas o tenant ativo e, quando houver caregiver assignments, o subconjunto permitido para aquele membro
- fluxo MQTT foi preservado, mas a identidade técnica do device agora prefere `device_uid` e faz fallback para `legacy:{device_id}`
- ingestão de `device_status`, `telemetry_logs`, `events` e `alerts` passou a gravar também `organization_id`, `patient_id` e `device_assignment_history_id`
- `database/schema.sql` foi migrado para o novo modelo e nesta versão recria as tabelas do ambiente
- `README.md`, `backend/README.md`, `frontend/README.md`, `docs/integration.md`, `docs/firmware-hardware.md` e `docs/quickstart-windows.md` foram atualizados para o fluxo multi-tenant atual

### Corrigido
- usuários autenticados comuns deixaram de depender apenas de filtros do frontend e passaram a ter filtro real de escopo no backend
- auto-provisionamento de devices ficou mais seguro: discovery técnico não implica ownership definitivo
- concorrência nas acoes de alerta passou a responder conflito coerente quando o estado já mudou
- concorrência no claim de device passou a ser tratada de forma transacional, evitando dupla reivindicacao e reuse de código
- mock publisher foi alinhado para publicar `device_uid = legacy:{deviceId}` e encaixar melhor no modelo novo

### Pendente / Faltando
- fluxo explícito de unpair ou transferencia de device entre organizações pela interface
- UI dedicada para `platform_admin`
- detalhe de paciente em página própria, alem da listagem e edição atual
- controle mais fino de quais operadores sem caregiver assignment devem ver toda a organização ou nenhum paciente
- migração incremental de bases antigas sem depender de reset total do schema

### Limitações conhecidas
- a versão atual de `database/schema.sql` recria o schema inteiro; `init-db` funciona como reset do ambiente nesta migração
- o claim do device depende de o backend estar acessivel ao ESP32 pela rede e por HTTP
- o firmware ainda usa MQTT sem `TLS`
- o broker MQTT embutido continua sendo apenas para desenvolvimento e demonstração local
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware não persiste após reboot do ESP32
- o mock publisher ainda difere do firmware real em alguns campos auxiliares
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite

### Divida técnica / Pontos fracos
- o fluxo de pairing ainda não implementa comprovacao criptografica forte alem de `device_uid + pairing_code`
- o portal do ESP32 salva `BACKEND_API_BASE_URL`, mas não possui autenticação local própria
- ainda não existe workflow administrativo para revogar claim ou reatribuir device entre tenants sem operação manual de banco ou código futuro
- a restricao por caregiver assignment hoje só estreita o escopo quando existem assignments explícitos; sem eles, o membro continua vendo a organização ativa inteira
- o projeto ainda não tem migrações versionadas separadas de `schema.sql`

### Proximos passos sugeridos
- criar fluxo de unpair e transferencia cross-tenant com auditoria
- adicionar UI e rotas para revogacao ou desativacao administrativa de devices
- avaliar `TLS` ou outra camada mais forte para pairing e comunicação dispositivo -> backend
- separar migrações incrementais do reset completo do schema
- adicionar testes automatizados de autorizacao por tenant e concorrência de alertas/claim

## [v0.6.1] - 2026-04-07
### Adicionado
- modo opcional de teste de bancada `MPU6050 + buzzer` no firmware para validar leitura do sensor, resposta local a movimento brusco e funcionamento do buzzer
- novos parâmetros em `include/app_config.h`: `MOTION_TEST_MODE_ENABLED`, `MOTION_TEST_SERIAL_DEBUG_ENABLED`, `MOTION_TEST_ACCEL_THRESHOLD_G`, `MOTION_TEST_GYRO_THRESHOLD_DPS`, `MOTION_TEST_BUZZER_DURATION_MS` e `MOTION_TEST_COOLDOWN_MS`
- documentação operacional e embarcada com passo a passo de bancada, sensibilidade e observações sobre o que esse teste não cobre

### Alterado
- `src/main.cpp` passou a observar `accel_magnitude` e `gyro_magnitude` já calculados pelo firmware para disparar um beep curto em modo de teste, sem alterar o contrato MQTT
- `include/buzzer_led.h` e `src/buzzer_led.cpp` ganharam suporte a pulso curto não bloqueante para o buzzer, reaproveitando o módulo existente
- `README.md`, `docs/firmware-hardware.md`, `docs/integration.md`, `backend/README.md`, `frontend/README.md` e `docs/quickstart-windows.md` foram alinhados ao novo modo de teste de bancada

### Corrigido
- faltava um caminho simples para validar rapidamente `MPU6050 + buzzer` sem depender de uma queda completa ou do fluxo fim a fim com backend e dashboard
- o firmware agora consegue dar feedback local imediato em bancada quando ocorre movimento brusco acima do limiar configurado

### Pendente / Faltando
- expor esse modo de teste também pelo portal local do ESP32 em iteracao futura, para evitar recompilar até mesmo para bancada
- criar presets documentados de sensibilidade para montagem muito rigida, montagem solta e simulacao manual
- avaliar se vale adicionar um padrão visual no LED de status especificamente para o modo de teste

### Limitações conhecidas
- o modo de teste detecta apenas movimento brusco por limiar e não classifica queda real
- ele não substitui a logica final do `fall_detector`
- como o modo convive com a logica principal, um movimento muito forte ainda pode satisfazer o detector real e gerar evento normal do sistema
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware não persiste após reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstração local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida técnica / Pontos fracos
- o modo de teste ainda depende de alteracao em `include/app_config.h` e recompilacao do firmware
- o firmware ainda usa MQTT sem `TLS`
- o portal não implementa autenticação local nem reset de fabrica protegido
- a leitura de bateria real via `ADC` ainda não existe
- o smoke test do projeto continua focado no backend/frontend e não valida o modo de teste embarcado

### Proximos passos sugeridos
- permitir habilitar temporariamente o modo de teste pelo portal local do ESP32
- registrar presets de sensibilidade para diferentes cenários de bancada
- adicionar um pequeno autoteste guiado de hardware no portal para buzzer e conectividade
- estudar um caminho de reset de fabrica seguro sem depender de nova gravação do firmware

## [v0.6.0] - 2026-04-07
### Adicionado
- portal local de configuração no firmware com `AP`, `WebServer`, `DNSServer` catch-all e captive portal basico
- persistência em `Preferences` / `NVS` para redes Wi-Fi, broker MQTT, porta, usuário, senha, `DEVICE_ID` e `MQTT_CLIENT_ID`
- suporte a multiplas redes Wi-Fi com ordem de prioridade e atualização por `SSID`
- novos modulos de firmware `device_config`, `config_store`, `setup_portal` e `connectivity_manager`
- fallback automático para `SETUP_MODE` quando nenhuma rede conhecida conecta
- fallback automático para `SETUP_MODE` quando o Wi-Fi conecta, mas o MQTT falha por tempo ou tentativas suficientes

### Alterado
- `include/app_config.h` passou a ser fonte de defaults de fabrica e constantes do portal, em vez de configuração unica fixa do dispositivo
- `wifi_manager` agora tenta multiplas redes em sequência e trata timeout por perfil
- `mqtt_client` passou a usar configuração dinamica e contagem de falhas de reconexao
- `main.cpp` passou a montar `device_id` e tópicos MQTT em runtime, preservando o contrato `queda/devices/{deviceId}/{canal}`
- `README.md`, `docs/firmware-hardware.md`, `docs/integration.md`, `backend/README.md`, `frontend/README.md` e `docs/quickstart-windows.md` foram atualizados para o novo fluxo oficial do ESP32

### Corrigido
- necessidade de recompilar o firmware a cada troca simples de Wi-Fi ou broker MQTT
- situacao em que o ESP32 conectava ao Wi-Fi, mas ficava preso com MQTT quebrado sem abrir caminho claro para reconfiguração
- configuração de tópicos MQTT ficou consistente com `deviceId` persistido sem depender de strings fixas em `app_config`

### Pendente / Faltando
- fluxo de reset de fabrica pelo próprio portal ou por rota física/logica dedicada
- protecao opcional por senha no AP de setup para ambientes mais sensiveis
- validação mais rica de DNS e reachability do broker antes do restart
- possibilidade de editar prioridade fina das redes sem depender apenas da ordem da lista

### Limitações conhecidas
- o captive portal tende a funcionar melhor em Android e Windows; no iOS pode ser necessário abrir manualmente `http://setup.queda` ou `http://192.168.4.1`
- o portal de setup e simples e não substitui o dashboard principal do projeto
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware não persiste após reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstração local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida técnica / Pontos fracos
- o firmware ainda usa MQTT sem `TLS`
- o portal não implementa autenticação local nem reset de fabrica protegido
- a lista de redes Wi-Fi e persistida em `NVS`, mas ainda sem criptografia adicional alem do que o ESP32 oferece no armazenamento padrão
- a leitura de bateria real via `ADC` ainda não existe
- o smoke test do projeto continua focado no backend/frontend e não valida o portal do ESP32
- ainda não existe UI de monitoramento da saúde de configuração do firmware dentro do dashboard

### Proximos passos sugeridos
- adicionar reset de fabrica seguro pelo portal e opcionalmente por acionamento físico futuro
- considerar `mDNS` ou identificador amigavel adicional para acesso ao portal em redes `STA`
- incluir teste guiado de configuração do ESP32 na documentação de demonstração
- estudar `TLS` e autenticação mais forte para cenários externos

## [v0.5.3] - 2026-04-07
### Adicionado
- botão visivel `Sair` no card de sessão da sidebar do frontend
- atalho `Trocar usuário` na sidebar e suporte a `/login?force=1` para voltar ao formulario de autenticação mesmo com sessão ativa

### Alterado
- fluxo de autenticação do frontend atualizado para redirecionar explicitamente ao `/login` depois do logout
- documentação principal, quickstart e README do frontend alinhados ao novo fluxo de sessão

### Corrigido
- UX de sessão em que o usuário ficava preso autenticado sem caminho claro para sair
- logout agora limpa token e usuário do `localStorage`, derruba a sessão em tempo real e permite entrar com outra conta sem gambiarra manual

### Pendente / Faltando
- avaliar se vale adicionar expiração visivel de sessão ou refresh token em futuras iteracoes
- considerar um indicador mais explícito de qual perfil esta ativo quando houver vários operadores testando no mesmo navegador

### Limitações conhecidas
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware não persiste após reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstração local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida técnica / Pontos fracos
- o firmware ainda usa MQTT sem `TLS`
- `MQTT_TOPIC_*` no firmware continuam fixos em `include/app_config.h`, exigindo alinhamento manual quando `DEVICE_ID` muda
- a leitura de bateria real via `ADC` ainda não existe
- o smoke test valida o fluxo principal, mas ainda depende de observabilidade indireta para confirmar a ingestão MQTT do mock
- o broker dev não valida autenticação nem persiste mensagens

### Proximos passos sugeridos
- adicionar um aviso visual de sessão expirada quando o backend passar a rejeitar tokens inválidos em tempo real
- considerar um menu de conta com detalhes de perfil e auditoria de login para demonstracoes mais completas

## [v0.5.2] - 2026-04-07
### Adicionado
- observação explicita na documentação de backend e quickstart sobre o ambiente local atual usar `MYSQL_PASSWORD=` vazio

### Alterado
- links documentais que ainda apontavam para caminhos absolutos do Windows foram convertidos para links relativos
- `backend/.env.example` foi alinhado ao ambiente local atual para evitar divergir da configuração documentada

### Corrigido
- exemplos de configuração do MySQL em `backend/README.md` e `docs/quickstart-windows.md` deixaram de indicar `MYSQL_PASSWORD=root`
- referências cruzadas entre `README.md`, `backend/README.md` e `frontend/README.md` agora funcionam sem depender do caminho `C:/Queda/...`

### Pendente / Faltando
- revisar se existem copias antigas de documentação fora da estrutura principal do projeto que ainda merecam limpeza manual
- manter essa checagem de consistência sempre que houver nova reorganização de arquivos

### Limitações conhecidas
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware não persiste após reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstração local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida técnica / Pontos fracos
- o firmware ainda usa MQTT sem `TLS`
- `MQTT_TOPIC_*` no firmware continuam fixos em `include/app_config.h`, exigindo alinhamento manual quando `DEVICE_ID` muda
- a leitura de bateria real via `ADC` ainda não existe
- o smoke test valida o fluxo principal, mas ainda depende de observabilidade indireta para confirmar a ingestão MQTT do mock
- o broker dev não valida autenticação nem persiste mensagens

### Proximos passos sugeridos
- revisar de forma periódica se `README`, `.env.example` e scripts continuam descrevendo exatamente o ambiente padrão
- considerar um checklist automatizado para detectar links absolutos e exemplos de `.env` divergentes

## [v0.5.1] - 2026-04-07
### Adicionado
- estratégia de logs temporários por execução no `smoke-test.ps1`, usando subpastas únicas em `scripts/.runtime`

### Alterado
- ambiente local padronizado em `localhost` para backend, frontend e broker MQTT de desenvolvimento
- `backend/.env`, `backend/.env.example`, defaults do backend e documentação operacional alinhados ao host local oficial
- `README.md`, `backend/README.md`, `docs/integration.md` e `docs/quickstart-windows.md` atualizados para refletir o fluxo local real

### Corrigido
- `smoke-test.ps1` agora valida o frontend no host correto e deixa de falhar por causa de `127.0.0.1` versus `localhost`
- limpeza e leitura de logs temporários do mock publisher ficaram tolerantes a arquivo bloqueado no Windows
- a validação do mock publisher passou a ser auxiliar, sem mascarar o fato de que backend, login e dashboard já estão saudáveis
- checagens TCP dos scripts passaram a tratar corretamente `localhost` no Windows, inclusive quando o listener sobe em `::1`

### Pendente / Faltando
- confirmar o fluxo completo com MySQL ativo no ambiente final sempre que houver nova mudança em scripts
- ampliar o smoke test para cobrir também transições de alerta em tempo real sem perder a execução rapida
- revisar se vale expor o host local padrão também em telas de ajuda dentro do frontend

### Limitações conhecidas
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware não persiste após reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstração local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida técnica / Pontos fracos
- o firmware ainda usa MQTT sem `TLS`
- `MQTT_TOPIC_*` no firmware continuam fixos em `include/app_config.h`, exigindo alinhamento manual quando `DEVICE_ID` muda
- a leitura de bateria real via `ADC` ainda não existe
- o smoke test valida o fluxo principal, mas ainda depende de observabilidade indireta para confirmar a ingestão MQTT do mock
- o broker dev não valida autenticação nem persiste mensagens

### Proximos passos sugeridos
- adicionar um endpoint ou utilitario leve para confirmar ingestão MQTT de teste sem depender de busca textual em `/api/devices`
- incluir uma verificação opcional de `Socket.IO` no smoke test
- reduzir o tamanho do bundle do frontend
- considerar persistência local para eventos do firmware em `NVS` ou `SPIFFS`

## [v0.5.0] - 2026-04-06
### Adicionado
- pasta `scripts/` com automacoes PowerShell para `check-env`, `setup-dev`, `init-db`, `start-all`, `start-backend`, `start-frontend`, `start-mock`, `open-site`, `stop-all` e `smoke-test`
- helper compartilhado em `scripts/_common.ps1` para leitura de `.env`, teste de portas, rastreamento de processos e mensagens amigaveis
- broker MQTT local leve em `backend/scripts/devBroker.js`, baseado em `Aedes`, para desenvolvimento e demonstração local
- inicializacao automática do banco em `backend/scripts/initDb.js`, reaproveitando `mysql2` do backend
- `package.json` na raiz com atalhos `dev:check`, `dev:setup`, `dev:init-db`, `dev:start`, `dev:stop` e `dev:smoke`
- guia operacional em PT-BR em `docs/quickstart-windows.md`
- `CHANGELOG.md` na raiz para registrar evolução, limitações e próximos passos

### Alterado
- `README.md` reorganizado para servir como entrada principal, com links claros para `docs/quickstart-windows.md`, `docs/firmware-hardware.md` e `docs/integration.md`
- `backend/README.md` atualizado para refletir scripts reais, broker dev, seed demo e fluxo operacional atual
- `frontend/README.md` atualizado com fluxo de login/cadastro e referencia ao quickstart Windows
- `docs/integration.md` ampliado com broker local de desenvolvimento e observações do fluxo operacional real
- `docs/firmware-hardware.md` reforcado como referencia do ponto principal de configuração do ESP32
- `include/app_config.h` reorganizado com comentarios mais didaticos para Wi-Fi, MQTT, `DEVICE_ID`, intervalos e flags
- tela de login do frontend ajustada para explicar quando usar seed demo e quando usar cadastro

### Corrigido
- `database/seed.sql` agora cria um hash compatível com a senha demo documentada `Admin@123`
- alinhamento entre seed, frontend, quickstart e smoke test para o fluxo real de login
- `.gitignore` atualizado para ignorar `scripts/.runtime`

### Pendente / Faltando
- testes automatizados de API mais completos alem do smoke test atual
- setup realmente zero-config para MySQL em todos os ambientes Windows, sem depender de servidor externo já instalado
- estratégia de deploy ou empacotamento para apresentacao fora do ambiente de desenvolvimento
- validação automática de credenciais do firmware a partir do estado do backend

### Limitações conhecidas
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware não persiste após reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstração local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida técnica / Pontos fracos
- o firmware ainda usa MQTT sem `TLS`
- `MQTT_TOPIC_*` no firmware continuam fixos em `include/app_config.h`, exigindo alinhamento manual quando `DEVICE_ID` muda
- a leitura de bateria real via `ADC` ainda não existe
- o smoke test valida o fluxo principal, mas não cobre todas as transições operacionais de alertas
- o broker dev não valida autenticação nem persiste mensagens

### Proximos passos sugeridos
- adicionar testes HTTP automatizados para rotas de autenticação, dispositivos e alertas
- criar opção de seed resetavel para facilitar demonstracoes repetidas
- adicionar leitura real de bateria no firmware
- evoluir o frontend para reduzir o tamanho do bundle
- considerar persistência local para eventos do firmware em `NVS` ou `SPIFFS`
