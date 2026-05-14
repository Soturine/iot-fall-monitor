# Changelog

## [v0.8.22] - 2026-05-14
### Corrigido
- leitura I2C do MPU6050 ficou mais tolerante a falhas transitórias no ESP32 real, evitando que erros `i2cWriteReadNonStop returned Error -1` inundem o Serial Monitor ou interrompam telemetria MQTT
- telemetria periodica continua sendo publicada com `sensor_valid=false` quando a ultima amostra fica velha demais, sem inventar valores de sensor

### Alterado
- versao alinhada para `0.8.22` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- leituras de registradores do MPU6050 agora preferem STOP condition em bancada (`I2C_USE_REPEATED_START=false`) e mantem fallback com STOP se repeated-start for reativado
- driver do sensor usa retry curto, contadores de falha, resumo throttled de erros I2C e recovery controlado que reinicia o barramento e reconfigura o MPU6050 sem recalibrar em loop
- payloads de `status` e `telemetry` ganharam diagnosticos `i2c_error_count`, `i2c_recovery_count` e `i2c_last_error`; buffer MQTT do firmware subiu para `MQTT_PACKET_BUFFER_SIZE=1024`

### Documentado
- checklist fisico para instabilidade I2C: GND comum, VCC, SDA/SCL, fios curtos, contato na protoboard, modulo MPU6050 e clock de `100 kHz`

## [v0.8.21] - 2026-05-14
### Corrigido
- regressao da `v0.8.20` em que falhas de configuracao/readback/calibracao do MPU6050 podiam deixar `sensor_ready=0` e bloquear telemetria real mesmo com Wi-Fi/MQTT online
- `sensor_ready` voltou a significar MPU encontrado, `WHO_AM_I` compativel e leitura raw basica funcionando; calibracao nao e mais requisito para publicar telemetria

### Alterado
- versao alinhada para `0.8.21` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- escrita de registradores do MPU6050 agora usa retry e logs por registrador (`PWR_MGMT_1`, `CONFIG`, `GYRO_CONFIG`, `ACCEL_CONFIG`, `ACCEL_CONFIG2`)
- readback de `ACCEL_CONFIG`/`GYRO_CONFIG` usa fallback de divisores esperados quando falha, sem impedir o boot do sensor
- calibracao de acelerometro passa a registrar `continuing_without_offsets` quando falha ou e pulada, mantendo `AX/AY/AZ` em `g` e telemetria ativa

### Documentado
- procedimento de bancada atualizado para validar `sensor_ready=1`, ausencia de `sensor_no_valid_sample`, publish de telemetria e repouso perto de `1 g`

## [v0.8.20] - 2026-05-14
### Alterado
- versao alinhada para `0.8.20` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- driver do MPU6050 agora le `ACCEL_CONFIG` e `GYRO_CONFIG` apos configurar o sensor e deriva os divisores reais de conversao a partir da faixa efetiva
- AX/AY/AZ continuam sendo enviados em `g`, GX/GY/GZ em `deg/s`, `accel_magnitude` em `g` e `gyro_magnitude` em `deg/s`, sem mudar nomes de campos MQTT
- logs seriais do sensor passaram a mostrar faixa efetiva, `lsb_per_g`, raw do acelerometro/giroscopio, valores convertidos em `g` e magnitudes publicadas

### Corrigido
- leituras em repouso perto de `4 g` quando o sensor permanecia na escala efetiva `+-2g` mas o firmware dividia como `+-8g`
- conversao deixou de depender de constantes fixas (`4096 LSB/g`, `65.5 LSB/dps`) quando o registrador real diverge do desejado

### Adicionado
- calibracao leve de acelerometro no boot, com 80 amostras, validacao de estabilidade e offsets conservadores que preservam a direcao da gravidade
- fallback de sanidade por magnitude raw em repouso para escolher o divisor fisico mais proximo quando o readback ou clone do sensor ainda indicar escala incoerente
- procedimento documentado para validar repouso proximo de `1 g` com Serial Monitor, `mqtt:watch` e dashboard

### Pendente / Faltando
- validar na placa fisica se o Serial Monitor mostra `accel scale lsb_per_g=16384` quando o chip permanecer em `+-2g`, ou `4096` quando `+-8g` for realmente aplicado
- compilar com PlatformIO localmente na maquina com `pio` instalado; nesta sessao `pio` nao estava no PATH

## [v0.8.19] - 2026-05-14
### Alterado
- versao alinhada para `0.8.19` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- grafico de telemetria do detalhe do device passou a exibir como serie principal apenas `Aceleracao resultante (g)`, deixando giroscopio e eixos AX/AY/AZ no tooltip
- eixo Y do grafico agora usa dominio calculado para aceleracao, largura fixa e formatter com 2 casas decimais para evitar ticks crus pouco legiveis
- quando `accel_magnitude` vier ausente/fora da escala visual, o grafico tenta derivar a magnitude a partir de AX/AY/AZ antes de descartar a amostra na visualizacao

### Corrigido
- valores de telemetria reais que chegavam corretamente ao frontend deixaram de aparecer como labels estranhos no eixo Y, como numeros longos sem unidade/contexto
- mistura visual entre aceleracao e giroscopio no mesmo eixo deixou de distorcer a escala do grafico principal

### Documentado
- a normalizacao visual do grafico nao altera MQTT, backend, schema nem dados persistidos
- outliers sao filtrados apenas na visualizacao (`0-20 g` para aceleracao e `0-2000 deg/s` para giroscopio no tooltip)

## [v0.8.18] - 2026-05-13
### Adicionado
- logs seriais de diagnostico no firmware para MQTT, sensor, loop principal, publish/skip de telemetria, status e eventos
- campos tecnicos no payload real do ESP32 (`sensor_ready`, `sensor_valid`, `sensor_read_ok`, `sensor_sample_age_ms`, `sensor_failures`, `battery_percent`, `rssi`) sem remover os campos antigos
- procedimento documentado para testar telemetria real com Serial Monitor + `npm run mqtt:watch --prefix backend`

### Alterado
- versao alinhada para `0.8.18` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- portal de manutencao deixou de iniciar scan Wi-Fi automatico em `WIFI_AP_STA`, reduzindo risco de interferir no link station/MQTT enquanto o device opera
- payloads JSON do firmware ganharam mais folga de buffer e aviso serial se houver overflow antes de publicar
- telemetria periodica passou a registrar motivo de skip quando falta MQTT ou ainda nao ha amostra valida do sensor

### Corrigido
- o firmware ficou mais observavel para distinguir ESP32 conectado sem publish continuo de backend/frontend funcionando com telemetria simulada
- falhas pontuais de leitura do MPU6050 nao impedem o loop MQTT; quando ja existe ultima amostra valida, o firmware continua publicando com idade da amostra e contador de falhas

### Pendente / Faltando
- validar na placa fisica com `mqtt:watch` aberto por varios minutos apos reinicio do ESP32
- compilar com PlatformIO localmente na maquina com `pio` instalado; nesta sessao `pio`/`platformio` nao estava no PATH

## [v0.8.17] - 2026-05-13
### Adicionado
- scripts `npm run mqtt:watch --prefix backend` e `npm run mqtt:publish:test --prefix backend` para observar mensagens reais no broker e publicar telemetria valida sem ESP32 fisico
- migracao idempotente `npm run db:migrate:evidence --prefix backend` para aplicar o schema de evidencia sem resetar dados locais
- verificacao de schema no startup do backend com recomendacao clara quando colunas/tabela de evidencia estiverem ausentes
- logs de diagnostico mais claros no broker dev e na bridge MQTT, incluindo topico, tamanho do payload, `clientId`, `correlationId`, canal, device resolvido e resultado do processamento

### Alterado
- versao alinhada para `0.8.17` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- `device_status.last_seen_at` passou a usar a hora de recebimento MQTT no backend, evitando falso offline quando o ESP32 publica com timestamp stale
- persistencia de telemetria/eventos normaliza timestamps do device quando o clock/NTP esta ausente ou distante demais do recebimento
- documentacao de diagnostico MQTT passou a separar broker ativo, publish real do ESP32, ingestao do backend, persistencia e emissao Socket.IO

### Corrigido
- dashboard e detalhe de device deixam de depender de timestamp antigo do payload para decidir se a telemetria MQTT recente esta viva
- bancos locais atualizados de versoes anteriores agora podem receber a migracao de evidencia sem `db:init` destrutivo

### Pendente / Faltando
- validar por varios minutos com ESP32 fisico se `mqtt:watch`, logs do backend e dashboard mostram fluxo continuo de `telemetry` a cada intervalo esperado
- se houver multiplas instancias do backend no futuro, manter a recomendacao de lock/fila distribuida por device

## [v0.8.16] - 2026-05-13
### Adicionado
- campos de evidencia em `events` (`evidence_status`, `evidence_telemetry_id`, `evidence_sample_count`, `evidence_window_seconds`, `evidence_summary_json`)
- tabela relacional `event_telemetry_evidence` para vincular eventos de queda a amostras de `telemetry_logs`
- testes `node:test` para queda com evidencia, queda sem evidencia, telemetria stale/outro device e exposicao de resumo de evidencia no alerta
- scripts explicitos `test:smoke`, `test:integration`, `stress:dry` e `stress:real` no backend
- stress real com validacao de backend `/health`, broker MQTT, MySQL local/dev e bloqueio de execucao em producao
- relatorios de stress legiveis em `backend/logs/stress/report-<runId>.md` e falhas completas em `failures-<runId>.json`

### Alterado
- versao alinhada para `0.8.16` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- `fall_detected` agora busca telemetria do mesmo device na janela `event_time - 10s` ate `event_time + 3s` antes de criar alerta automatico
- `fall_detected` sem evidencia recente passa a ser evento tecnico com `evidenceStatus=none`, severidade `medium`, warning diagnostico e sem alerta automatico
- `sos_pressed` continua criando alerta sem depender de telemetria, por ser acionamento manual
- comportamento do device evita marcar `queda_confirmada` para queda recente sem evidencia de telemetria
- grafico de telemetria usa escala visual minima quando timestamps chegam iguais ou muito proximos, mantendo o horario real no tooltip

### Corrigido
- o fluxo de queda deixou de tratar `fall_detected` como alerta critico confiavel sem amostras relacionadas do MPU6050 persistidas no backend
- o stress dry-run deixou de ser apresentado como stress real e passou a gerar resumo humano com MQTT, telemetria, quedas/alertas, falhas e recomendacoes

### Documentado
- diferenca entre `stress:dry` e `stress:real`
- como interpretar JSONL, summary, failures e report Markdown de stress
- como a queda e amarrada a telemetria e o que acontece quando a evidencia e insuficiente
- limitacao atual de alerta interno sem SMS/WhatsApp/e-mail/push externo

### Pendente / Faltando
- validar com ESP32 fisico se a frequencia real de telemetria gera evidencia `linked` antes/depois de quedas controladas
- calibrar thresholds do MPU6050 no prototipo fisico antes de qualquer interpretacao clinica
- avaliar uma chave futura de idempotencia no payload MQTT para deduplicar eventos semanticamente iguais

### Limitacoes conhecidas
- `stress:real` depende de backend, broker e MySQL locais ja rodando; sem esses prerequisitos ele falha cedo e gera relatorio de falha
- a janela de evidencia e rastreabilidade tecnica, nao validacao clinica

## [v0.8.15] - 2026-05-12
### Adicionado
- documentacao tecnica `docs/alerting-architecture.md` com fluxo real ESP32 -> MQTT -> backend -> banco -> Socket.IO -> frontend para quedas e SOS
- testes `node:test` para `eventService`, `alertService`, ingestao MQTT e emissao realtime escopada
- suite `npm run stress:alerts --prefix backend` em dry-run com cenarios de rajada de telemetria, queda/SOS, payloads ruins e concorrencia do mesmo device
- logger de stress em JSON Lines com resumo final em `backend/logs/stress/`
- scripts `test`, `test:alerts`, `test:mqtt`, `test:stress`, `stress:alerts` e `stress:cleanup` no backend

### Alterado
- versao alinhada para `0.8.15` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- ingestao MQTT passou a propagar `correlationId`, `durationMs`, topico, escopo, device resolvido e motivo de descarte nos logs diagnosticos
- `npm run check --prefix backend` agora valida sintaxe de `src`, `scripts` e `tests`
- grafico de telemetria do detalhe do device passou a usar eixo temporal numerico, ordenacao defensiva, filtro de amostras invalidas e separacao minima para timestamps duplicados

### Corrigido
- fluxo MQTT de `fall_detected` voltou a passar o objeto completo do evento para `createAlertForEvent`, preservando criacao de alerta interno e emissao `alert:new`
- grafico de telemetria deixou de depender de `createdAt` como categoria textual, reduzindo aparencia de travamento quando ha poucas amostras ou timestamps no mesmo minuto

### Documentado
- diferenca entre alerta interno e futura notificacao externa
- contrato sugerido para futura camada `notificationService`
- como rodar testes normais, testes MQTT e stress local
- local e formato dos logs/relatorios de stress

### Pendente / Faltando
- validar com ESP32 fisico se a telemetria real preenche o grafico continuamente apos varios minutos de bancada
- avaliar chave futura de idempotencia de evento MQTT se o firmware passar a reenviar exatamente o mesmo evento com identificador proprio
- se o backend for escalado para multiplas instancias, migrar lock por device para fila particionada ou lock distribuido

### Limitacoes conhecidas
- `stress:alerts` e dry-run: ele mede o caminho de servicos com mocks controlados, nao substitui teste de carga com MySQL e broker reais
- alerta interno ainda nao envia SMS, WhatsApp, e-mail, push ou webhook externo

## [v0.8.14] - 2026-05-06
### Adicionado
- lock leve em memoria por `device_id` na ingestao MQTT para serializar mensagens simultaneas do mesmo ESP32 dentro de uma instancia Node
- rooms Socket.IO por escopo de acesso (`organization`, `patient` e plataforma global), reduzindo emissao realtime de varredura `O(sockets)` para entrega direta por room
- indices de apoio no schema para status stale online, telemetria recente por organizacao/device, eventos por organizacao/device/tipo e alertas por organizacao/status

### Alterado
- versao alinhada para `0.8.14` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- o caminho quente de telemetria MQTT deixou de montar snapshot completo repetido por amostra; agora reaproveita o status recem-gravado e calcula apenas a janela de comportamento necessaria
- `getOrCreateDeviceByIdentity` passou a retornar snapshot tecnico/escopo mais leve para fluxos internos de MQTT, pairing e cadastro manual

### Corrigido
- criacao de alerta por evento ficou idempotente sobre `alerts.event_id` com `ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, evitando falha em corrida de criacao duplicada
- patches realtime de status enviados pela telemetria deixam de mandar `null` para RSSI/bateria/firmware quando o payload MQTT nao trouxe esses campos, preservando o ultimo valor valido no frontend

### Documentado
- limites do lock em memoria por device e necessidade de lock distribuido/fila particionada em backend horizontal
- uso de rooms Socket.IO por escopo e indices de performance no schema

### Pendente / Faltando
- aplicar os novos indices em bancos ja existentes; `database/schema.sql` cobre resets/ambientes novos, mas instalacoes atuais precisam de migracao/manual SQL equivalente
- validar em bancada com fluxo real de MQTT se a ordem status/telemetry/event permanece estavel sob rajadas do ESP32

### Limitacoes conhecidas
- o lock MQTT e por processo Node; multiplas instancias do backend ainda podem processar o mesmo device em paralelo sem coordenacao externa
- a idempotencia de alertas cobre duplicidade por `event_id`; duplicidade semantica de eventos MQTT iguais ainda depende de uma futura chave de deduplicacao de mensagem/evento

## [v0.8.13] - 2026-05-06
### Alterado
- versao alinhada para `0.8.13` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- o detalhe do device no frontend passou a combinar atualizacao incremental via `telemetry:new` com refresh HTTP leve a cada 10s, evitando grafico stale quando um evento realtime se perde
- o grafico de telemetria passou a mostrar segundos em janelas curtas e pontos nas series, deixando amostras de bancada mais visiveis
- eventos realtime de telemetria agora incluem tambem o `deviceUid` resolvido pelo backend, sem remover campos existentes

### Corrigido
- corrigida a divergencia entre o device legado pareado `legacy:{device_id}` e o `device_uid` real publicado pelo ESP32, que podia fazer o backend gravar telemetria em um duplicado sem organizacao e deixar o dashboard da organizacao stale
- quando esse duplicado tecnico sem tenant ja existe, a ingestao MQTT move telemetrias, eventos e alertas para o device pareado, remove o duplicado e passa a usar o UID real no cadastro existente
- mensagens MQTT sem `device_uid` continuam compatíveis: depois da reconciliacao, o backend tenta resolver por `device_id` somente se houver exatamente um cadastro pareado com aquele identificador

### Documentado
- fluxo de identidade MQTT entre `device_id`, `device_uid` real e cadastros legados
- comportamento do detalhe `/devices/:id` com realtime incremental e fallback HTTP

### Pendente / Faltando
- validar em hardware real se o proximo pacote MQTT do ESP32 reconcilia o device exibido como `legacy:esp32_01` e atualiza o grafico sem F5
- confirmar no banco se existe duplicado tecnico antigo sem organizacao e se ele foi removido apos a primeira telemetria recebida nesta versao

### Limitacoes conhecidas
- se existirem varios devices pareados com o mesmo `device_id`, mensagens sem `device_uid` continuam criando/atualizando o fallback legado para evitar associacao ambigua
- se o `device_uid` real ja estiver claimed em outra organizacao, o backend nao faz merge automatico com o cadastro legado

## [v0.8.12] - 2026-05-06
### Adicionado
- `SETUP_PORTAL_ALWAYS_ON = true` no firmware para manter o AP/portal de manutencao ativo em paralelo ao fluxo normal de Wi-Fi station, MQTT, leitura do sensor e publicacao de telemetria
- logs de diagnostico MQTT no firmware, protegidos por `FIRMWARE_CONNECTIVITY_DEBUG_ENABLED`, com host/porta/clientId efetivos, topicos e resultado de publish
- logs de ingestao no backend para `status` e `telemetry`, incluindo topico recebido, device resolvido, escopo e motivo de descarte quando aplicavel

### Alterado
- versao alinhada para `0.8.12` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- SSID do portal do ESP32 encurtado para o padrao `Q-ESP32-xxxxxx`, sem incluir `deviceId` por padrao
- portal local passou a diferenciar AP de manutencao ativo de `SETUP_MODE`, exibindo que o ESP32 pode continuar publicando MQTT enquanto o portal esta aberto
- buzzer ficou desabilitado por padrao em bancada com `BUZZER_ENABLED = false` e polaridade default conservadora `BUZZER_ACTIVE_HIGH = false`
- o Socket.IO do frontend agora e criado apenas depois da hidratacao minima da sessao, evitando conexao com token/organizacao em estado intermediario apos F5

### Corrigido
- o AP do ESP32 deixava de aparecer quando o firmware saia do `SETUP_MODE`; agora, em desenvolvimento, o portal de manutencao permanece disponivel sem desconectar MQTT nem bloquear telemetria
- timestamps MQTT implausiveis vindos do fallback `millis()/1000` do ESP32 passam a ser substituidos pela hora de recebimento no backend, evitando `lastSeenAt` antigo e falso offline
- refresh/F5 com organizacao salva invalida deixa de derrubar a sessao inteira: o frontend remove apenas a organizacao local invalida, tenta `/me` novamente e escolhe uma membership valida
- estados normais de boot, Wi-Fi connecting, MQTT connecting, setup e warning visual deixam de expor o buzzer a acionamento sonoro por padrao

### Documentado
- diferenca entre AP de setup/fallback e AP de manutencao sempre ativo
- novo SSID curto `Q-ESP32-*`
- validacao de MQTT por TCP, handshake `CONNACK`, logs de ingestao e sinais esperados no dashboard
- teste de refresh/F5 do frontend e comportamento esperado da hidratacao de sessao
- estado atual conservador do buzzer em bancada

### Pendente / Faltando
- validar em hardware real se o AP `Q-ESP32-*` permanece visivel enquanto MQTT conecta e publica telemetria no broker local
- confirmar no dashboard real se `telemetry:new` atualiza `lastSeenAt`, RSSI, bateria e heuristica sem F5
- confirmar na placa fisica se `BUZZER_ACTIVE_HIGH = false` corresponde ao modulo usado; inverter em `app_config.h` se o lote for active-high

### Limitacoes conhecidas
- firewall local, rede institucional ou backend apontado para broker diferente ainda podem impedir ingestao mesmo com o firmware operacional
- o portal local continua sem autenticacao propria e deve ser tratado como ferramenta de bancada/manutencao
- a rodada estabiliza observabilidade e estado de bancada, mas ainda depende de teste real no ESP32 para fechar a validacao fisica

## [v0.8.11] - 2026-04-29
### Adicionado
- script `backend/scripts/testMqttConnection.js` e comando `npm run mqtt:test -- HOST PORT` para validar handshake MQTT com recebimento de `CONNACK`

### Alterado
- versao alinhada para `0.8.11` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- broker MQTT local de desenvolvimento passou a inicializar o `Aedes` com `Aedes.createBroker()`, conforme a API da versao instalada `aedes@1.0.2`
- logs do broker dev passaram a diferenciar conexao TCP, envio de `CONNACK`, cliente MQTT conectado/desconectado e erros de cliente/conexao/protocolo
- configuracao local recomendada do backend passou a usar `MQTT_BROKER_URL=mqtt://127.0.0.1:1883`, mantendo o ESP32 apontado para o IPv4 real do notebook

### Corrigido
- corrigido o timeout de handshake MQTT do broker local de desenvolvimento causado por socket TCP aberto antes de o broker `Aedes` estar realmente em estado de escuta MQTT
- preservado o bind em `MQTT_BIND_HOST=0.0.0.0` e a porta `MQTT_PORT=1883`, sem alterar contratos MQTT, payloads do ESP32, API REST, Socket.IO ou pairing

### Documentado
- diferenca entre `Test-NetConnection IP_DO_NOTEBOOK -Port 1883`, que valida apenas TCP, e teste MQTT real com cliente recebendo `CONNACK`
- fluxo de validacao com `npm run mqtt:test -- 127.0.0.1 1883` e `npm run mqtt:test -- IP_DO_NOTEBOOK 1883`

### Pendente / Faltando
- validar em hardware real o botao `Testar MQTT` do portal do ESP32 apos reiniciar o broker com esta versao

### Limitacoes conhecidas
- firewall local, perfil de rede do Windows, isolamento de clientes em redes institucionais, TLS ou credenciais incorretas ainda podem impedir o ESP32 mesmo com TCP e handshake local funcionando

## [v0.8.10] - 2026-04-29
### Alterado
- versao alinhada para `0.8.10` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- broker MQTT local de desenvolvimento passou a usar `MQTT_BIND_HOST=0.0.0.0` e `MQTT_PORT=1883` por padrao
- `scripts/start-all.ps1` passou a iniciar o broker dev com bind explicito em `0.0.0.0`, sem forcar `localhost` como interface de escuta

### Corrigido
- corrigido o bind do broker MQTT local de desenvolvimento, permitindo conexao TCP pelo IPv4 da LAN do notebook para uso do ESP32
- preservada compatibilidade com `DEV_BROKER_HOST`, `DEV_BROKER_PORT` e porta via argumento para fluxos locais existentes
- ajuste no teste TCP dos scripts Windows para tentar fallback manual quando `Test-NetConnection localhost` falhar por preferencia de IPv6

### Documentado
- diagnostico Windows para identificar processo na porta `1883` com `netstat` e `Get-CimInstance`
- validacao manual esperada com `Test-NetConnection IP_DO_NOTEBOOK -Port 1883`
- diferenca entre `localhost`/loopback e IPv4 real do notebook para o ESP32

### Pendente / Faltando
- validar em hardware real se `Test-NetConnection IP_DO_NOTEBOOK -Port 1883` retorna `TcpTestSucceeded : True` no notebook alvo e se o botao `Testar MQTT` do portal do ESP32 passa

### Limitacoes conhecidas
- firewall local, perfil de rede do Windows ou isolamento entre clientes em redes institucionais ainda podem bloquear o ESP32 mesmo com o broker escutando em `0.0.0.0:1883`
- a rodada nao altera contratos MQTT, payloads, API REST, Socket.IO ou logica de deteccao de queda

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

### Limitacoes conhecidas
- esta rodada foi documental e não incluiu teste em hardware real
- nenhuma validação de firmware com `PlatformIO` foi necessária para o escopo alterado
- o status heurístico continua experimental, pré-calibração e sem valor de diagnóstico clínico

### Divida tecnica / Pontos fracos
- ainda existem documentos complementares com histórico operacional acumulado que podem ser condensados em uma rodada futura
- o repositório ainda não possui automação dedicada para validação de links Markdown

### Proximos passos sugeridos
- revisar os documentos complementares com o mesmo padrão linguístico aplicado ao `README.md`
- considerar uma tag `v0.8.9` se esta baseline documental for usada como marco antes da próxima rodada funcional

## [v0.8.8] - 2026-04-23
### Adicionado
- bloco de saude operacional no portal do ESP32 com leitura separada de `Wi-Fi conectado`, `MQTT OK`, `Backend API` e `Pronto para operar`, alem de botoes `Testar backend` e `Testar MQTT`
- diagnostico de realtime no frontend com fase da conexao do painel, motivo tecnico discreto e separacao explicita entre socket do navegador e status MQTT/device

### Alterado
- versao alinhada para `0.8.8` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `backend/package-lock.json`, `frontend/package.json` e `frontend/package-lock.json`
- `telemetry:new` passou a carregar `deviceStatusPatch`, permitindo atualizar bateria, RSSI, `lastSeenAt` e heuristica sem depender de refetch pesado nas telas
- o detalhe do device passou a aplicar patch incremental da telemetria recente em vez de recarregar toda a tela a cada amostra
- o `MOTION_TEST_MODE_ENABLED` do firmware ficou desabilitado por padrao e o buzzer ganhou configuracao explicita de polaridade com `BUZZER_ACTIVE_HIGH`

### Corrigido
- o painel deixou de sugerir que o device caiu quando quem falha e apenas o socket do navegador, deixando mais claro quando o problema esta no realtime do frontend
- o portal do ESP32 agora mostra confirmacao visual mais honesta de conectividade/configuracao, incluindo ultimo teste MQTT e alcance do backend
- a telemetria passou a manter RSSI, bateria e snapshot tecnico-clinico mais coerentes em tempo real com o que o firmware ja conhece
- o buzzer deixou de ficar exposto ao `motion test` de bancada por padrao, reduzindo falsos disparos fora do cenario esperado

### Pendente / Faltando
- validar em hardware real o novo bloco de saude do portal e o ajuste conservador do buzzer com a placa fisica usada em campo
- confirmar em bancada se a polaridade padrao `BUZZER_ACTIVE_HIGH = true` corresponde ao lote de hardware principal ou se sera preciso inverter em placas especificas

### Limitacoes conhecidas
- sem `PlatformIO` disponivel neste ambiente, a rodada nao conseguiu compilar o firmware localmente
- o portal continua existindo principalmente em `SETUP_MODE`, entao `MQTT OK` depende de teste manual ou do ultimo contexto conhecido enquanto o ESP32 ainda esta no modo de configuracao

### Divida tecnica / Pontos fracos
- o portal do ESP32 ainda concentra HTML inline em `src/setup_portal.cpp`, o que deixa iteracoes finas de UX mais trabalhosas
- o dashboard ainda usa refetch completo para alguns eventos de alerta/status, embora a telemetria ja tenha ficado mais incremental

### Proximos passos sugeridos
- validar em hardware real se os novos testes do portal ajudam a fechar setup sem adivinhacao e se o buzzer ficou previsivel no lote principal de ESP32
- numa rodada futura, considerar um snapshot realtime mais rico tambem para alertas e status sem aumentar demais o custo do frontend

## [v0.8.7] - 2026-04-21
### Adicionado
- status comportamental/postural experimental derivado da telemetria atual com `state`, `confidence`, `reason` e espaco preparado para estados futuros como `andando`, `correndo` e `caido`

### Alterado
- versao alinhada para `0.8.7` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `frontend/package.json` e `frontend/package-lock.json`
- o dashboard, a listagem de devices e a pagina de detalhe passaram a exibir o estado heuristico atual do dispositivo com linguagem mais honesta e discreta

### Corrigido
- o backend agora enriquece snapshots de device com um status interpretado baseado em janela recente de telemetria e em eventos de queda recentes, sem alterar o contrato MQTT
- o frontend passou a reagir a `telemetry:new` para atualizar o estado heuristico em tempo real sem depender apenas de recarga manual

### Pendente / Faltando
- validar os limiares em hardware real com mais cenarios de uso, especialmente para diferenciar melhor `deitado`, `sentado` e repouso geral
- decidir numa rodada futura se a calibracao individual do uso corporal do sensor vai migrar para um fluxo dedicado

### Limitacoes conhecidas
- esta classificacao e experimental, pre-calibracao e nao representa diagnostico clinico
- sem calibracao por paciente/dispositivo, posturas especificas ainda podem cair em estados mais genericos como `em_reposo` ou `desconhecido`
- a validacao desta rodada nao incluiu hardware real

### Divida tecnica / Pontos fracos
- a heuristica ainda depende de poucos sinais (`accel_magnitude`, `gyro_magnitude`, `pitch_deg`, `roll_deg` e eventos recentes), sem janela historica longa nem modelo adaptativo
- pages como `Devices` e `Dashboard` ainda fazem refresh completo para alguns eventos, embora a telemetria ja atualize o estado localmente

### Proximos passos sugeridos
- coletar amostras reais por postura para revisar thresholds antes de tentar estados mais ambiciosos como `andando` e `correndo`
- considerar uma calibracao leve por device/paciente para reduzir falsos `desconhecido` e melhorar a confianca das posturas

## [v0.8.6] - 2026-04-16
### Adicionado
- evento realtime `device:claimed` para o dashboard detectar a conclusao do claim associado ao codigo de pairing atual

### Alterado
- versao alinhada para `0.8.6` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `frontend/package.json` e `frontend/package-lock.json`
- o modal de pairing agora troca para um estado final de sucesso, deixa de tratar o codigo como ativo e fecha automaticamente alguns segundos apos o claim

### Corrigido
- o firmware passou a filtrar a resposta JSON do claim e da sincronizacao de perfil, lendo apenas `deviceSyncToken` e `patientProfile` sem depender do payload completo do backend
- o portal do ESP32 deixa de mostrar o aviso de JSON nao interpretado quando o claim ja foi aceito e a resposta traz o snapshot completo do backend
- o dashboard agora reage ao sucesso do pairing em tempo real, atualiza o device correspondente e orienta o fechamento do modal sem depender de acao manual

### Pendente / Faltando
- repetir o pairing ponta a ponta em hardware real para confirmar a persistencia de `deviceSyncToken` e `patientProfile` no ESP32 apos reboot

### Limitacoes conhecidas
- a validacao desta rodada nao compilou o firmware localmente porque `pio`/`platformio` nao estavam disponiveis no ambiente

### Divida tecnica / Pontos fracos
- o portal ainda depende de parsing embarcado em `src/patient_profile_client.cpp`, que continua sensivel a futuras mudancas no shape do backend fora dos campos filtrados
- o feedback visual de sucesso no dashboard ainda depende da conexao realtime ativa com o backend

### Proximos passos sugeridos
- validar em bancada se o ESP32 reaparece com `deviceSyncToken` e perfil resumido preservados em NVS depois do claim
- se necessario, adicionar um pequeno indicador de reconexao realtime no modal para cobrir o caso raro em que o claim conclui mas o socket do navegador cai no meio do fluxo

## [v0.8.5] - 2026-04-16
### Adicionado
- `details.stage` e codigos diagnosticos no backend para facilitar a identificacao objetiva da etapa que falhou em `POST /api/pairing/claim`

### Alterado
- versao alinhada para `0.8.5` em `CHANGELOG.md`, `README.md`, `package.json` da raiz, `backend/package.json`, `frontend/package.json` e `frontend/package-lock.json`
- o portal do ESP32 passou a diferenciar melhor falhas internas de pairing, schema desatualizado e inconsistencias de dados vindas do backend

### Corrigido
- heuristica de `network-info` passou a priorizar com mais consistencia a interface realmente ativa na rede atual, reduzindo casos em que IP host-only ou virtual aparecia como URL principal recomendada
- o fluxo de claim do ESP32 no backend agora devolve diagnostico mais claro quando a falha acontece em etapa interna do pairing, em vez de cair apenas em erro generico
- as mensagens do portal do ESP32 ficaram mais objetivas para diferenciar erro interno, schema de banco desatualizado e inconsistencias de dados

### Pendente / Faltando
- repetir o teste ponta a ponta do pairing em hardware real para confirmar a etapa reportada pelo backend no ambiente de uso
- alinhar o banco real com `database/schema.sql` caso o backend ainda devolva `PAIRING_SCHEMA_MISMATCH`

### Limitacoes conhecidas
- a heuristica da URL principal continua sendo `best effort` e pode exigir fallback manual em redes Windows muito fora do padrao
- o claim do ESP32 continua dependente de o schema real do banco estar alinhado com a versao atual do backend

### Divida tecnica / Pontos fracos
- o fluxo transacional de pairing ainda concentra varias etapas em `backend/src/services/pairingService.js`, o que aumenta o acoplamento com o schema real do banco
- o portal do ESP32 ainda depende de HTML inline em `src/setup_portal.cpp`, tornando iteracoes finas de UX mais trabalhosas

### Proximos passos sugeridos
- validar em campo a nova selecao da URL principal com notebooks que tenham adaptadores virtuais instalados
- se o claim ainda falhar, usar `details.stage` e `code` para fechar a causa raiz no banco antes de abrir nova rodada de UX

## [v0.8.4] - 2026-04-15
### Adicionado
- `primaryBackendApiBaseUrl` e `fallbackBackendApiBaseUrls` em `GET /api/system/network-info` para a UI tratar uma URL principal e fallbacks de rede sem quebrar compatibilidade com `suggestedBackendApiBaseUrl`

### Alterado
- versao alinhada para `0.8.4` em `CHANGELOG.md`, `package.json` da raiz, `backend/package.json` e `frontend/package.json`
- modal de pairing do dashboard passou a destacar uma URL principal recomendada, mostrar expiracao do codigo e esconder URLs secundarias em `Outras opcoes de rede`
- portal local do ESP32 foi simplificado para o fluxo manual confiavel de `BACKEND_API_BASE_URL` + codigo temporario + `Parear agora`
- `README.md`, `frontend/README.md`, `docs/integration.md`, `docs/firmware-hardware.md` e `docs/quickstart-windows.md` foram alinhados ao fluxo simplificado
- o frontend deixou de depender de `qrcode.react`, removendo uma dependencia que ja nao fazia parte da UX real

### Corrigido
- heuristica de `network-info` agora prioriza interfaces LAN reais e desprioriza adaptadores virtuais, host-only e VPN ao sugerir a URL principal
- o backend passou a classificar erros de pairing com codigos mais claros para invalido, expirado, ja usado e device ja pareado em outra organizacao
- o portal do ESP32 agora traduz falhas de pairing em mensagens mais objetivas para backend inacessivel, URL invalida e codigos rejeitados

### Pendente / Faltando
- validar o fluxo completo em hardware real com celular e notebook na mesma rede para confirmar a heuristica da URL principal em cenarios reais

### Limitacoes conhecidas
- o pairing ainda depende de o notebook/backend estar acessivel pelo ESP32 na mesma rede ou em uma rota permitida
- `battery_level` do firmware real ainda e placeholder fixo em `100`

### Divida tecnica / Pontos fracos
- `src/setup_portal.cpp` ainda concentra HTML inline e mensagens de UX embarcada
- a heuristica de escolha da URL principal continua sendo best effort e pode exigir fallback em redes muito incomuns

### Proximos passos sugeridos
- validar em bancada com Android e iPhone se a URL principal sugerida reduz tentativas manuais na maioria dos cenarios
- considerar uma telemetria administrativa simples para registrar falhas de pairing por tipo de erro no backend
## [v0.8.3] - 2026-04-11
### Adicionado
- governanca minima do repositorio com `AGENTS.md`, `docs/commit-guidelines.md` e `docs/release-rules.md`
- template de PR em `.github/pull_request_template.md` com checklist de seguranca e validacao

### Alterado
- versao alinhada para `0.8.3` em `CHANGELOG.md`, `package.json` da raiz, `backend/package.json` e `frontend/package.json`
- normalizacao do `backendApiBaseUrl` no firmware para tolerar esquema HTTP/HTTPS com capitalizacao variada e remover barra final

### Corrigido
- o portal do ESP32 passa a aceitar URLs locais validas mesmo quando o esquema vem capitalizado via celular ou QR

### Pendente / Faltando
- nenhuma pendencia nova registrada nesta rodada

### Limitacoes conhecidas
- o scanner de QR do portal depende de suporte de camera/navegador e pode nao funcionar em captive portal HTTP
- `battery_level` do firmware real ainda e placeholder fixo em `100`

### Divida tecnica / Pontos fracos
- o portal do ESP32 ainda concentra HTML inline em `setup_portal.cpp`

### Proximos passos sugeridos
- validar o pairing em rede real com celulares que autocapitalizam URLs e registrar o fluxo no manual de testes

## [v0.8.2] - 2026-04-10
### Adicionado
- gating simples de logs no firmware via `FIRMWARE_LOG_LEVEL` e flags de debug em `include/app_config.h`
- snapshot leve de eventos criticos pendentes em `NVS`, limitado e restaurado apos reboot quando fizer sentido
- preparacao opt-in para `MQTT/TLS` no firmware e no backend, mantendo `mqtt://` como padrao funcional
- `frontend/src/config/runtime.ts` para normalizar URLs de API e `Socket.IO`

### Alterado
- versao do projeto alinhada para `0.8.2` em `CHANGELOG.md`, `package.json` da raiz, `backend/package.json` e `frontend/package.json`
- `.gitignore` da raiz foi fortalecido para PlatformIO, Node, builds, caches, logs, `.env` e arquivos temporarios
- `backend/.env.example` passou a documentar `LOG_LEVEL` e opcoes opcionais de MQTT/TLS
- `scripts/check-env.ps1` e `scripts/setup-dev.ps1` agora avisam sobre a faixa recomendada de `Node.js 20+`
- `src/setup_portal.cpp` foi modularizado em helpers menores sem mudar rotas nem o comportamento do portal
- a bridge MQTT do backend agora usa opcoes configuraveis de reconnect, keepalive, timeout e TLS

### Corrigido
- o backend deixou de emitir logs tao verbosos para cada conexao/desconexao `Socket.IO` fora de `debug`
- o firmware reduziu ruido serial em diagnosticos de I2C, conectividade e buffer sem perder mensagens criticas
- o frontend passou a normalizar `VITE_API_URL` e `VITE_SOCKET_URL`, evitando pequenas inconsistencias por barra final

### Pendente / Faltando
- evoluir a persistencia do buffer do firmware alem do snapshot pequeno, caso um caso real de campo justifique
- decidir se a configuracao de TLS do firmware deve ganhar UI propria no portal local ou permanecer apenas por defaults/NVS
- continuar reduzindo o peso de `src/setup_portal.cpp` se a UX embarcada crescer mais

### Limitacoes conhecidas
- o snapshot em `NVS` cobre apenas um conjunto pequeno de eventos criticos e nao substitui persistencia completa
- `telemetry` continua fora do `EventBuffer`
- o fluxo padrao do projeto continua em `MQTT` sem `TLS`; a base de `mqtts://` ficou apenas preparada, nao ativada por padrao
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- a placa atual ainda pode exigir `BOOT` manual durante o upload, por limitacao de auto-reset/bootloader

### Divida tecnica / Pontos fracos
- o portal do ESP32 ainda concentra HTML inline, apesar da modularizacao desta rodada
- a persistencia de eventos no firmware ainda depende de snapshot pequeno, nao de fila duravel completa
- a configuracao de TLS do firmware ainda nao e exposta no portal, apenas preservada para evolucao segura futura

### Proximos passos sugeridos
- validar em bancada se o snapshot do buffer reduz perda perceptivel em reboot rapido sem aumentar desgaste de flash
- considerar uma forma mais ergonomica de gerenciar TLS no firmware quando houver broker seguro real de homologacao
- seguir refinando o setup do frontend e do backend para reduzir variacoes de ambiente entre maquinas Windows

## [v0.8.1] - 2026-04-10
### Adicionado
- nenhuma funcionalidade nova; esta versao registra o refinamento visual do modal de pairing

### Alterado
- o modal de pairing em `frontend/src/pages/DevicesPage.tsx` deixou de exibir o bloco visual com o JSON cru do QR
- a UX do modal foi simplificada para destacar apenas codigo temporario, URL sugerida, IPs candidatos, QR code e botoes de copia relevantes
- `README.md`, `frontend/README.md`, `docs/quickstart-windows.md`, `docs/firmware-hardware.md` e `docs/integration.md` foram alinhados ao novo texto menos tecnico

### Corrigido
- a interface do dashboard deixou de expor o payload JSON do QR, reduzindo ruido visual para o usuario final
- o texto do pairing passou a orientar o fluxo principal por QR ou preenchimento manual, sem depender de detalhes internos do payload

### Pendente / Faltando
- avaliar se vale adicionar uma dica visual mais forte para o caso em que o navegador do celular nao consiga abrir a camera no portal do ESP32
- continuar refinando a UX do pairing para reduzir passos manuais em ambientes com IP local variavel

### Limitacoes conhecidas
- o QR continua codificando `backendApiBaseUrl` e `pairingCode`, mas o conteudo cru nao e mais mostrado no dashboard
- o portal do ESP32 ainda preserva a importacao dos dados do QR como fallback tecnico, embora esse nao seja mais o caminho principal documentado na UI do site
- o scanner de QR do portal segue dependente de suporte real de camera/navegador
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware nao persiste apos reboot do ESP32
- o projeto continua usando MQTT sem `TLS`

### Divida tecnica / Pontos fracos
- o portal do ESP32 ainda precisa manter suporte a importacao textual dos dados do QR, o que continua sendo um detalhe tecnico pouco elegante
- a experiencia de pairing ainda depende de o operador informar uma URL local de backend acessivel na rede do dispositivo

### Proximos passos sugeridos
- experimentar uma UX de pairing com dicas contextuais por tipo de rede, como notebook local, hotspot ou broker externo
- avaliar se o frontend deve mostrar um resumo ainda mais direto do passo a passo logo abaixo do QR

## [v0.8.0] - 2026-04-10
### Adicionado
- `GET /api/system/network-info` para o frontend sugerir a melhor `backendApiBaseUrl` local para o pairing do ESP32
- QR code no modal de pairing em `Devices`, com copia de URL, codigo e payload JSON
- importacao do payload do QR no portal local do ESP32, preenchendo `BACKEND_API_BASE_URL` e `pairing_code`
- scanner opcional de QR por camera no portal do ESP32 como progressive enhancement
- campos `weight_kg` e `height_cm` no cadastro de pacientes
- sincronizacao resumida do perfil do paciente para o ESP32 via `deviceSyncToken` e `POST /api/pairing/device-profile-sync`
- novo modulo embarcado `patient_profile_client` para claim + sync do perfil resumido em `NVS`

### Alterado
- `database/schema.sql` passou a incluir `weight_kg` e `height_cm` em `patients`, alem de `device_sync_token_hash` em `devices`
- `database/seed.sql` passou a popular peso e altura do `Paciente Demo`
- a UI de pairing do frontend agora consulta `GET /api/system/network-info` e mostra QR/payload sem remover o fluxo manual
- o portal do ESP32 continua focado em setup, mas agora mostra o perfil resumido do paciente sincronizado
- `README.md`, `backend/README.md`, `frontend/README.md`, `docs/integration.md`, `docs/firmware-hardware.md` e `docs/quickstart-windows.md` foram sincronizados com o novo fluxo
- o frontend voltou a declarar corretamente as dependencias de build do `Tailwind CSS`, deixando o ambiente reproduzivel depois da instalacao do `qrcode.react`

### Corrigido
- pairing deixou de depender apenas de copiar URL e codigo manualmente do dashboard
- o ESP32 agora consegue persistir `deviceSyncToken` e resincronizar o perfil resumido do paciente sem editar dados clinicos no portal
- a pagina de pacientes passou a editar e exibir `peso` e `altura` junto do nome
- o ambiente do frontend deixou de depender de dependencia transiente de `tailwindcss` fora do `package.json`

### Pendente / Faltando
- usar `fallSensitivityPreset` real no backend e no firmware; por enquanto ele segue `null`
- criar uma tela dedicada de detalhes do paciente com historico, analytics e futuros presets
- decidir se o dashboard deve mostrar mais KPIs clinicos derivados de `peso` e `altura`
- avaliar um gatilho mais imediato de sync do perfil para o device logo apos reassignment, alem do polling periodico

### Limitacoes conhecidas
- o scanner de QR do portal depende de suporte de camera/navegador e pode nao funcionar em captive portal HTTP
- o fallback obrigatorio continua sendo colar o payload do QR ou preencher URL + codigo manualmente
- `deviceSyncToken` melhora o sync do perfil, mas ainda nao adiciona uma camada completa de autenticacao forte para o device
- `fallSensitivityPreset` ainda nao tem regra aplicada no backend nem no firmware
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware nao persiste apos reboot do ESP32
- o projeto continua usando MQTT sem `TLS`

### Divida tecnica / Pontos fracos
- o `BACKEND_API_BASE_URL` ainda fica agrupado na configuracao de conectividade do device, nao em um bloco proprio de pairing/backend
- o sync resumido de paciente ainda depende de polling HTTP periodico enquanto o device esta online
- o portal do ESP32 concentra bastante HTML inline em `setup_portal.cpp`, o que deixa evolucoes de UX mais trabalhosas
- ainda nao existe um token de longa duracao com rotacao/expiracao formal para o device alem do hash salvo em `devices`

### Proximos passos sugeridos
- adicionar detalhe de paciente no frontend com IMC e contexto clinico basico
- avaliar envio de `patientProfileVersion` ou hash para reduzir sincronizacoes desnecessarias no ESP32
- considerar uma acao administrativa de forcar resincronizacao do perfil do device pelo dashboard
- seguir endurecendo o caminho dispositivo -> backend com autenticacao mais forte e, futuramente, `TLS`

## [v0.7.9] - 2026-04-09
### Adicionado
- nenhuma funcionalidade nova; esta versao registra o refinamento do helper de liberacao da `COM`

### Alterado
- [scripts/free-serial-port.ps1](scripts/free-serial-port.ps1) deixou de mirar qualquer processo `platformio` genericamente e passou a focar em monitores seriais e `esptool`

### Corrigido
- a limpeza automatica da `COM` nao tenta mais encerrar o proprio processo de upload do `PlatformIO`

### Pendente / Faltando
- validar novamente o hook pre-upload com a limpeza refinada
- continuar separando conflito de porta presa de limitacao fisica de auto-boot da placa

### Limitacoes conhecidas
- mesmo com a limpeza mais segura, a placa atual ainda pode continuar exigindo `BOOT` se o problema for realmente do circuito de auto-reset

### Divida tecnica / Pontos fracos
- a automacao de serial no Windows ainda depende de heuristica por linha de comando de processo

### Proximos passos sugeridos
- repetir um upload sem `BOOT` para confirmar que o hook funciona e que o erro restante continua sendo `Wrong boot mode detected (0x13)`

## [v0.7.8] - 2026-04-09
### Adicionado
- nenhuma funcionalidade nova; esta versao registra a correção da automacao pre-upload recém-integrada ao `PlatformIO`

### Alterado
- [scripts/pio-pre-upload.py](scripts/pio-pre-upload.py) foi ajustado para usar a assinatura correta do hook `before_upload` do `PlatformIO`

### Corrigido
- erro `TypeError: before_upload() got an unexpected keyword argument 'env'` durante o upload com a nova automacao de limpeza da `COM`

### Pendente / Faltando
- validar novamente o upload com o hook pre-upload funcionando
- seguir diferenciando conflito de serial presa versus limitacao fisica de auto-boot da placa

### Limitacoes conhecidas
- mesmo com a limpeza automatica correta, ainda esperamos que a placa atual continue exigindo `BOOT` enquanto o auto-reset dela nao for resolvido

### Divida tecnica / Pontos fracos
- o fluxo de upload ainda mistura mitigacoes de software com uma limitacao fisica da placa atual

### Proximos passos sugeridos
- validar o hook pre-upload em uma tentativa sem `BOOT`
- manter o foco do diagnostico no auto-boot da placa caso a `COM` continue livre e o erro siga sendo `Wrong boot mode detected (0x13)`

## [v0.7.7] - 2026-04-09
### Adicionado
- automacao pre-upload em [scripts/pio-pre-upload.py](scripts/pio-pre-upload.py) para chamar a limpeza da porta serial antes da gravacao no Windows

### Alterado
- [platformio.ini](platformio.ini) agora usa `extra_scripts = pre:scripts/pio-pre-upload.py`
- `README.md`, `docs/firmware-hardware.md`, `docs/quickstart-windows.md` e `docs/motion-test-bench-report.md` foram atualizados com o fluxo de limpeza automatica da `COM`

### Corrigido
- o projeto deixou de depender apenas de limpeza manual da `COM` antes de cada upload no Windows
- conflitos de monitor serial preso agora recebem uma mitigacao automatica no fluxo do `PlatformIO`

### Pendente / Faltando
- eliminar a necessidade de segurar `BOOT` durante o upload nesta placa especifica
- confirmar se o comportamento se repete com a placa totalmente sem perifericos externos
- validar se outra placa ESP32 com auto-reset funcional faz upload automatico com a mesma configuracao

### Limitacoes conhecidas
- a limpeza automatica da `COM` ajuda apenas no problema de porta ocupada
- o erro principal sem `BOOT` continua sendo `Wrong boot mode detected (0x13)`
- isso ainda aponta para problema de auto-boot/auto-reset da placa, nao para configuracao principal do `PlatformIO`

### Divida tecnica / Pontos fracos
- o fluxo de upload ainda depende de comportamento fisico da placa `CH9102`
- o projeto nao controla por software a qualidade do circuito de auto-reset da placa USB-serial

### Proximos passos sugeridos
- testar upload com a placa totalmente desacoplada dos perifericos
- comparar com outra ESP32 para diferenciar configuracao do projeto de limitacao da placa atual
- se a placa continuar exigindo `BOOT`, registrar esse procedimento como limitacao fisica definitiva

## [v0.7.6] - 2026-04-07
### Adicionado
- confirmacao operacional em bancada de que a nova build realmente subiu no ESP32 depois da gravacao manual com `BOOT`

### Alterado
- [docs/motion-test-bench-report.md](docs/motion-test-bench-report.md) foi atualizado com o boot normal observado, a entrada em `SETUP_MODE` e o AP `Queda-Setup-*` anunciado na serial

### Corrigido
- a rodada de validacao deixou de estar apenas em nivel de compilacao/upload: agora houve confirmacao de boot normal da nova build no hardware
- o crash loop anterior deixou de aparecer depois da nova gravacao e do boot limpo

### Pendente / Faltando
- conectar de fato ao AP `Queda-Setup-*` pelo celular ou notebook
- configurar Wi-Fi/MQTT no portal e validar a conectividade fim a fim
- testar um gesto realmente brusco no case para confirmar o comportamento atualizado do `MOTION TEST`

### Limitacoes conhecidas
- o upload ainda depende de segurar `BOOT` na placa atual
- a validacao desta rodada confirmou o AP pela serial, mas ainda nao realizou a configuracao completa pelo portal
- o `MOTION TEST` foi observado sem falso disparo em repouso, mas ainda falta o teste completo de gesto brusco no case

### Divida tecnica / Pontos fracos
- o auto-reset para upload continua sem solucao definitiva
- a validacao do portal AP ainda depende de interacao manual fora da serial
- a placa continua exigindo procedimento operacional cuidadoso entre upload, reset e monitor

### Proximos passos sugeridos
- conectar ao AP `Queda-Setup-*` e preencher Wi-Fi/MQTT
- validar o portal no celular e no notebook
- repetir o teste do `MOTION TEST` com movimento brusco real no case

## [v0.7.5] - 2026-04-07
### Adicionado
- registro incremental do procedimento operacional atual de upload para a placa `CH9102`, incluindo uso de `BOOT` manual durante `Connecting...`

### Alterado
- `README.md`, `docs/firmware-hardware.md`, `docs/integration.md`, `docs/quickstart-windows.md` e `docs/motion-test-bench-report.md` foram atualizados para refletir que a nova build entrou na placa, mas o auto-reset ainda nao ficou confiavel

### Corrigido
- a nova build do firmware foi finalmente gravada com sucesso na `COM4` quando o `BOOT` foi mantido pressionado durante o upload
- a investigacao deixou claro que o problema restante nao e mais a serial ocupada, e sim a entrada automatica em download mode

### Pendente / Faltando
- confirmar o boot normal da aplicacao apos a nova gravacao sem deixar a placa presa em `DOWNLOAD_BOOT`
- validar fisicamente o portal AP e o `MOTION TEST` ja com a build nova executando
- investigar se existe ajuste adicional de reset/driver que elimine a necessidade de segurar `BOOT`

### Limitacoes conhecidas
- o upload manual funciona, mas o auto-reset da placa ainda nao e confiavel
- durante a depuracao serial desta rodada, uma tentativa de reset automatizado deixou a placa em `DOWNLOAD_BOOT`, exigindo novo boot limpo para validar a aplicacao
- o helper de porta resolve a `COM` ocupada, mas nao resolve sozinho a entrada em bootloader

### Divida tecnica / Pontos fracos
- ainda falta um fluxo 100% reproduzivel de upload sem intervencao manual nessa placa
- o comportamento das linhas `DTR/RTS` com a ponte `CH9102` ainda nao esta estabilizado no projeto
- a validacao de bancada continua dependente de operacao manual cuidadosa entre upload, reset e monitor

### Proximos passos sugeridos
- fazer um boot limpo da placa e capturar o log normal da nova build
- validar `FORCE_SETUP_MODE_ON_BOOT` e o AP `Queda-Setup-*` agora que a build nova ja foi gravada
- repetir o teste do `MOTION TEST` em repouso seguido de gesto brusco para verificar se os falsos apitos diminuiram

## [v0.7.4] - 2026-04-07
### Adicionado
- helper [scripts/free-serial-port.ps1](scripts/free-serial-port.ps1) para desalojar processos `PlatformIO` / `esptool` que prendem a `COM` no Windows
- novo registro no relatorio de bancada com o log real da `COM4`, incluindo o crash loop do firmware antigo e o estado atual do upload

### Alterado
- `platformio.ini` passou a usar `monitor_dtr = 0` e `monitor_rts = 0` para reduzir efeitos indesejados do monitor serial sobre o ESP32
- `README.md`, `docs/firmware-hardware.md`, `docs/integration.md`, `backend/README.md`, `frontend/README.md`, `docs/quickstart-windows.md` e `docs/motion-test-bench-report.md` foram atualizados com o fluxo real da `COM4`

### Corrigido
- a porta `COM4` deixou de ficar bloqueada por monitor `PlatformIO` orfao sem caminho claro de recuperacao
- foi corrigida no firmware local a falha de inicializacao em que `ConnectivityManager::enterSetupMode()` chamava `disconnect()` antes de o cliente MQTT estar corretamente associado ao `WiFiClient`
- o carregamento inicial de `Preferences` deixou de gerar o caminho mais ruidoso no primeiro boot ao abrir a configuracao persistente

### Pendente / Faltando
- gravar a build corrigida no hardware real
- confirmar se o crash loop desaparece na placa depois da nova gravacao
- eliminar a necessidade de segurar `BOOT` para upload, se isso for viavel via software ou confirmar de vez que a limitacao e do hardware/driver

### Limitacoes conhecidas
- o upload automatico ainda falha com `Wrong boot mode detected (0x13)` mesmo com a `COM4` livre
- isso indica que a placa continua entrando em boot normal em vez de download mode durante o upload
- o ESP32 conectado em `COM4` ainda esta rodando uma build anterior, porque a nova compilacao nao foi gravada nesta sessao
- o `MOTION TEST` ajustado e o `FORCE_SETUP_MODE_ON_BOOT` ainda dependem de nova gravacao para serem validados fisicamente

### Divida tecnica / Pontos fracos
- o projeto ainda nao tem um fluxo totalmente automatico e confiavel de upload para esta placa/ponte `CH9102`
- a causa exata da necessidade de segurar `BOOT` ainda nao foi eliminada por software nesta rodada
- faltam testes automatizados de bancada para serial, bootloader e portal AP

### Proximos passos sugeridos
- testar a gravacao logo apos liberar a `COM4`, evitando qualquer monitor serial concorrente
- validar se a nova build remove o crash loop e libera o AP `Queda-Setup-*`
- se o upload automatico continuar exigindo `BOOT`, tratar isso como limitacao do auto-reset da placa e registrar um procedimento operacional padrao

## [v0.7.3] - 2026-04-07
### Adicionado
- flag `FORCE_SETUP_MODE_ON_BOOT` no firmware para forcar o portal/AP `Queda-Setup-*` durante testes de bancada
- relatorio de bancada em [docs/motion-test-bench-report.md](docs/motion-test-bench-report.md) com achados sobre `MOTION TEST`, AP local e limitacoes da sessao na `COM4`
- novos parametros do `MOTION TEST` para armar o teste apenas apos curto periodo de repouso relativo

### Alterado
- o `MOTION TEST` passou a usar defaults mais conservadores para bancada, com cooldown maior e estrategia padrao exigindo `accel + gyro`
- `README.md`, `docs/firmware-hardware.md`, `docs/integration.md`, `backend/README.md`, `frontend/README.md` e `docs/quickstart-windows.md` foram atualizados para refletir o teste de AP e o novo comportamento do motion test

### Corrigido
- dificuldade de testar o portal local quando o ESP32 ainda tinha configuracao valida salva e nao entrava espontaneamente em `SETUP_MODE`
- tendencia do `MOTION TEST` a apitar por movimento parcial, vibracao ou giro isolado em vez de privilegiar um gesto mais brusco

### Pendente / Faltando
- repetir a validacao fisica com upload real na `COM4` apos liberar a porta serial
- capturar log de boot do ESP32 ja com a nova build para confirmar visualmente o `SETUP_MODE` e o AP em bancada
- avaliar se vale expor o `FORCE_SETUP_MODE_ON_BOOT` ou um trigger temporario pelo proprio portal no futuro

### Limitacoes conhecidas
- a `COM4` estava ocupada nesta sessao, entao nao foi possivel concluir upload e captura de serial do hardware real depois da nova build
- o AP `Queda-Setup-*` continua aparecendo apenas em `SETUP_MODE` ou quando `FORCE_SETUP_MODE_ON_BOOT = true`
- o `MOTION TEST` continua sendo um diagnostico local simples e nao substitui o `fall_detector`
- o firmware continua sem `TLS` para MQTT, com `battery_level` placeholder e `EventBuffer` volatil

### Divida tecnica / Pontos fracos
- ainda nao existe um trigger de setup mode temporario sem recompilar para bancada, alem do fallback automatico ou da flag em `app_config`
- o comportamento real do buzzer ainda depende da montagem mecanica, alimentacao e do modulo de buzzer usado no case
- faltou uma captura de serial e validacao fisica final nesta rodada por indisponibilidade da porta

### Proximos passos sugeridos
- liberar a `COM4`, gravar a build nova e confirmar em bancada o AP de setup
- testar o `MOTION TEST` com o dispositivo parado por ~1 segundo antes do gesto brusco
- se ainda houver apitos indevidos, subir gradualmente `MOTION_TEST_GYRO_THRESHOLD_DPS` e `MOTION_TEST_ARM_AFTER_STILLNESS_MS`

## [v0.7.2] - 2026-04-07
### Adicionado
- `AppErrorBoundary` no frontend para evitar tela branca total e oferecer recuperacao rapida da sessao local
- reidratacao da sessao do frontend com `GET /api/me` no boot, alinhando o usuario salvo no navegador ao contrato multi-tenant atual
- documentacao operacional para o caso de erro no `AuthProvider` por sessao antiga no `localStorage`

### Alterado
- `AuthProvider` passou a normalizar `memberships`, organizacao ativa e usuario salvo antes de renderizar rotas protegidas
- `README.md`, `backend/README.md`, `frontend/README.md`, `docs/integration.md`, `docs/firmware-hardware.md` e `docs/quickstart-windows.md` foram sincronizados com a correcao de sessao e tela branca

### Corrigido
- tela branca total em `/login`, `/dashboard` e outras rotas quando havia sessao antiga incompatível salva no navegador
- erro `Cannot read properties of undefined (reading 'find')` no `AuthProvider` quando `user.memberships` nao existia no shape legado
- recuperacao da sessao do frontend deixou de depender cegamente do objeto antigo salvo no `localStorage`

### Pendente / Faltando
- validar esse fluxo tambem em navegadores diferentes com storage legado real de versoes anteriores
- adicionar testes automatizados de boot com sessao antiga e sem `memberships`
- ampliar a cobertura de fallback visual para erros assíncronos fora da fase de render

### Limitacoes conhecidas
- o `DeviceDetailPage` continua sendo o chunk mais pesado do frontend
- se o backend estiver apontando para um banco antigo, o login ainda falhara ate que `.\scripts\init-db.ps1` seja executado
- o firmware continua sem mudanca nesta rodada e mantem as limitacoes anteriores, como MQTT sem `TLS`, `battery_level` placeholder e `EventBuffer` volatil
- ainda nao existe fluxo completo de unpair cross-tenant pela UI

### Divida tecnica / Pontos fracos
- a sessao ainda depende de `localStorage` simples, sem refresh token
- o error boundary cobre renderizacao, mas nao substitui instrumentacao mais rica de erros em runtime
- faltam testes automatizados de compatibilidade entre contratos antigos de frontend e novas respostas do backend

### Proximos passos sugeridos
- adicionar teste automatizado para storage legado e reidratacao via `/api/me`
- considerar observabilidade mais clara de erros de boot no frontend
- continuar quebrando a tela de detalhe do device em partes menores para reduzir o maior chunk atual

## [v0.7.1] - 2026-04-07
### Adicionado
- validacao multi-tenant mais completa no `smoke-test.ps1`, agora usando `activeOrganizationId` do login para enviar `X-Organization-Id`
- verificacao explicita de `GET /api/organization` e `GET /api/patients` no smoke test para cobrir melhor o modelo por tenant
- carregamento sob demanda das rotas principais do frontend para reduzir o peso inicial da aplicacao

### Alterado
- `RealtimeContext` do frontend foi simplificado para recriar e desconectar o `Socket.IO` de forma previsivel quando token ou organizacao ativa mudam
- o modal de edicao de device passou a reinicializar estado por dispositivo, evitando reaproveitamento indevido de dados de um item anterior
- `README.md`, `backend/README.md`, `frontend/README.md`, `docs/integration.md`, `docs/firmware-hardware.md` e `docs/quickstart-windows.md` foram sincronizados com a rodada de estabilizacao

### Corrigido
- `GET /api/dashboard/summary` voltou a entregar `recentEvents` com contexto de paciente compativel com o frontend
- erros de lint e problemas de ciclo de vida no frontend apos a migracao multi-tenant foram eliminados
- o frontend deixou de depender de um bundle inicial tao pesado quanto antes, reduzindo a carga principal com divisao por rota
- a automacao local deixou de validar apenas endpoints legados e passou a refletir melhor o comportamento esperado no modelo por organizacao
- o smoke test agora explica explicitamente o caso em que o login responde `500` por banco ainda preso ao schema anterior ao modelo multi-tenant

### Pendente / Faltando
- executar novamente o smoke test completo com backend, frontend, banco e broker todos ativos no mesmo ciclo de verificacao
- ampliar a cobertura automatica para fluxos de pairing, assign de paciente e acoes concorrentes de alerta
- criar pagina dedicada de detalhe de paciente

### Limitacoes conhecidas
- o `DeviceDetailPage` ainda concentra um chunk relativamente maior do que as demais telas
- o smoke test continua focado no fluxo principal HTTP e so faz verificacao auxiliar do mock publisher
- o firmware continua sem nova mudanca nesta rodada, mantendo as limitacoes anteriores de MQTT sem `TLS`, `battery_level` placeholder e `EventBuffer` volatil
- ainda nao existe fluxo completo de unpair cross-tenant pela UI

### Divida tecnica / Pontos fracos
- a estrategia atual de lazy loading melhora a carga inicial, mas ainda nao separa partes mais pesadas internas da tela de detalhe do device
- a restricao por caregiver assignment continua dependendo da existencia de assignments explicitos para estreitar o escopo alem da organizacao ativa
- o projeto segue sem uma bateria automatizada fim a fim para validar UI + API + MQTT em um unico passo

### Proximos passos sugeridos
- quebrar a tela de detalhe do device em mais partes carregadas sob demanda
- adicionar smoke tests de role/path para `organization_admin`, `caregiver` e `viewer`
- incluir no smoke test uma verificacao opcional do fluxo de pairing e do claim quando houver ESP32 ou ambiente controlado disponivel

## [v0.7.0] - 2026-04-07
### Adicionado
- modelo multi-tenant com `organizations`, `organization_members`, `patients`, `caregiver_assignments`, `device_pairing_sessions` e `device_assignment_history`
- pairing seguro por codigo temporario e de uso unico, com endpoint publico `POST /api/pairing/claim` para o ESP32
- claim status em `devices` com estados `unclaimed`, `claimed` e `disabled`
- historico de assignment para preservar rastreabilidade de troca de paciente sem reescrever o passado
- novas telas no frontend para `Patients` e `Organization`, alem do fluxo de pairing e vinculacao de paciente na tela de devices
- suporte no firmware para `device_uid`, `BACKEND_API_BASE_URL` e envio de claim ao backend a partir do portal local do ESP32

### Alterado
- backend deixou de ser global e passou a aplicar escopo por organizacao nas rotas de dashboard, devices, eventos, alertas, pacientes e membros
- cadastro via `POST /api/auth/register` agora cria uma nova organizacao e o `organization_admin` inicial, em vez de promover o primeiro usuario global do sistema
- dashboard do frontend agora mostra apenas o tenant ativo e, quando houver caregiver assignments, o subconjunto permitido para aquele membro
- fluxo MQTT foi preservado, mas a identidade tecnica do device agora prefere `device_uid` e faz fallback para `legacy:{device_id}`
- ingestao de `device_status`, `telemetry_logs`, `events` e `alerts` passou a gravar tambem `organization_id`, `patient_id` e `device_assignment_history_id`
- `database/schema.sql` foi migrado para o novo modelo e nesta versao recria as tabelas do ambiente
- `README.md`, `backend/README.md`, `frontend/README.md`, `docs/integration.md`, `docs/firmware-hardware.md` e `docs/quickstart-windows.md` foram atualizados para o fluxo multi-tenant atual

### Corrigido
- usuarios autenticados comuns deixaram de depender apenas de filtros do frontend e passaram a ter filtro real de escopo no backend
- auto-provisionamento de devices ficou mais seguro: discovery tecnico nao implica ownership definitivo
- concorrencia nas acoes de alerta passou a responder conflito coerente quando o estado ja mudou
- concorrencia no claim de device passou a ser tratada de forma transacional, evitando dupla reivindicacao e reuse de codigo
- mock publisher foi alinhado para publicar `device_uid = legacy:{deviceId}` e encaixar melhor no modelo novo

### Pendente / Faltando
- fluxo explicito de unpair ou transferencia de device entre organizacoes pela interface
- UI dedicada para `platform_admin`
- detalhe de paciente em pagina propria, alem da listagem e edicao atual
- controle mais fino de quais operadores sem caregiver assignment devem ver toda a organizacao ou nenhum paciente
- migracao incremental de bases antigas sem depender de reset total do schema

### Limitacoes conhecidas
- a versao atual de `database/schema.sql` recria o schema inteiro; `init-db` funciona como reset do ambiente nesta migracao
- o claim do device depende de o backend estar acessivel ao ESP32 pela rede e por HTTP
- o firmware ainda usa MQTT sem `TLS`
- o broker MQTT embutido continua sendo apenas para desenvolvimento e demonstracao local
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware nao persiste apos reboot do ESP32
- o mock publisher ainda difere do firmware real em alguns campos auxiliares
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite

### Divida tecnica / Pontos fracos
- o fluxo de pairing ainda nao implementa comprovacao criptografica forte alem de `device_uid + pairing_code`
- o portal do ESP32 salva `BACKEND_API_BASE_URL`, mas nao possui autenticacao local propria
- ainda nao existe workflow administrativo para revogar claim ou reatribuir device entre tenants sem operacao manual de banco ou codigo futuro
- a restricao por caregiver assignment hoje so estreita o escopo quando existem assignments explicitos; sem eles, o membro continua vendo a organizacao ativa inteira
- o projeto ainda nao tem migracoes versionadas separadas de `schema.sql`

### Proximos passos sugeridos
- criar fluxo de unpair e transferencia cross-tenant com auditoria
- adicionar UI e rotas para revogacao ou desativacao administrativa de devices
- avaliar `TLS` ou outra camada mais forte para pairing e comunicacao dispositivo -> backend
- separar migracoes incrementais do reset completo do schema
- adicionar testes automatizados de autorizacao por tenant e concorrencia de alertas/claim

## [v0.6.1] - 2026-04-07
### Adicionado
- modo opcional de teste de bancada `MPU6050 + buzzer` no firmware para validar leitura do sensor, resposta local a movimento brusco e funcionamento do buzzer
- novos parametros em `include/app_config.h`: `MOTION_TEST_MODE_ENABLED`, `MOTION_TEST_SERIAL_DEBUG_ENABLED`, `MOTION_TEST_ACCEL_THRESHOLD_G`, `MOTION_TEST_GYRO_THRESHOLD_DPS`, `MOTION_TEST_BUZZER_DURATION_MS` e `MOTION_TEST_COOLDOWN_MS`
- documentacao operacional e embarcada com passo a passo de bancada, sensibilidade e observacoes sobre o que esse teste nao cobre

### Alterado
- `src/main.cpp` passou a observar `accel_magnitude` e `gyro_magnitude` ja calculados pelo firmware para disparar um beep curto em modo de teste, sem alterar o contrato MQTT
- `include/buzzer_led.h` e `src/buzzer_led.cpp` ganharam suporte a pulso curto nao bloqueante para o buzzer, reaproveitando o modulo existente
- `README.md`, `docs/firmware-hardware.md`, `docs/integration.md`, `backend/README.md`, `frontend/README.md` e `docs/quickstart-windows.md` foram alinhados ao novo modo de teste de bancada

### Corrigido
- faltava um caminho simples para validar rapidamente `MPU6050 + buzzer` sem depender de uma queda completa ou do fluxo fim a fim com backend e dashboard
- o firmware agora consegue dar feedback local imediato em bancada quando ocorre movimento brusco acima do limiar configurado

### Pendente / Faltando
- expor esse modo de teste tambem pelo portal local do ESP32 em iteracao futura, para evitar recompilar ate mesmo para bancada
- criar presets documentados de sensibilidade para montagem muito rigida, montagem solta e simulacao manual
- avaliar se vale adicionar um padrao visual no LED de status especificamente para o modo de teste

### Limitacoes conhecidas
- o modo de teste detecta apenas movimento brusco por limiar e nao classifica queda real
- ele nao substitui a logica final do `fall_detector`
- como o modo convive com a logica principal, um movimento muito forte ainda pode satisfazer o detector real e gerar evento normal do sistema
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware nao persiste apos reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstracao local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida tecnica / Pontos fracos
- o modo de teste ainda depende de alteracao em `include/app_config.h` e recompilacao do firmware
- o firmware ainda usa MQTT sem `TLS`
- o portal nao implementa autenticacao local nem reset de fabrica protegido
- a leitura de bateria real via `ADC` ainda nao existe
- o smoke test do projeto continua focado no backend/frontend e nao valida o modo de teste embarcado

### Proximos passos sugeridos
- permitir habilitar temporariamente o modo de teste pelo portal local do ESP32
- registrar presets de sensibilidade para diferentes cenarios de bancada
- adicionar um pequeno autoteste guiado de hardware no portal para buzzer e conectividade
- estudar um caminho de reset de fabrica seguro sem depender de nova gravacao do firmware

## [v0.6.0] - 2026-04-07
### Adicionado
- portal local de configuracao no firmware com `AP`, `WebServer`, `DNSServer` catch-all e captive portal basico
- persistencia em `Preferences` / `NVS` para redes Wi-Fi, broker MQTT, porta, usuario, senha, `DEVICE_ID` e `MQTT_CLIENT_ID`
- suporte a multiplas redes Wi-Fi com ordem de prioridade e atualizacao por `SSID`
- novos modulos de firmware `device_config`, `config_store`, `setup_portal` e `connectivity_manager`
- fallback automatico para `SETUP_MODE` quando nenhuma rede conhecida conecta
- fallback automatico para `SETUP_MODE` quando o Wi-Fi conecta, mas o MQTT falha por tempo ou tentativas suficientes

### Alterado
- `include/app_config.h` passou a ser fonte de defaults de fabrica e constantes do portal, em vez de configuracao unica fixa do dispositivo
- `wifi_manager` agora tenta multiplas redes em sequencia e trata timeout por perfil
- `mqtt_client` passou a usar configuracao dinamica e contagem de falhas de reconexao
- `main.cpp` passou a montar `device_id` e topicos MQTT em runtime, preservando o contrato `queda/devices/{deviceId}/{canal}`
- `README.md`, `docs/firmware-hardware.md`, `docs/integration.md`, `backend/README.md`, `frontend/README.md` e `docs/quickstart-windows.md` foram atualizados para o novo fluxo oficial do ESP32

### Corrigido
- necessidade de recompilar o firmware a cada troca simples de Wi-Fi ou broker MQTT
- situacao em que o ESP32 conectava ao Wi-Fi, mas ficava preso com MQTT quebrado sem abrir caminho claro para reconfiguracao
- configuracao de topicos MQTT ficou consistente com `deviceId` persistido sem depender de strings fixas em `app_config`

### Pendente / Faltando
- fluxo de reset de fabrica pelo proprio portal ou por rota fisica/logica dedicada
- protecao opcional por senha no AP de setup para ambientes mais sensiveis
- validacao mais rica de DNS e reachability do broker antes do restart
- possibilidade de editar prioridade fina das redes sem depender apenas da ordem da lista

### Limitacoes conhecidas
- o captive portal tende a funcionar melhor em Android e Windows; no iOS pode ser necessario abrir manualmente `http://setup.queda` ou `http://192.168.4.1`
- o portal de setup e simples e nao substitui o dashboard principal do projeto
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware nao persiste apos reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstracao local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida tecnica / Pontos fracos
- o firmware ainda usa MQTT sem `TLS`
- o portal nao implementa autenticacao local nem reset de fabrica protegido
- a lista de redes Wi-Fi e persistida em `NVS`, mas ainda sem criptografia adicional alem do que o ESP32 oferece no armazenamento padrao
- a leitura de bateria real via `ADC` ainda nao existe
- o smoke test do projeto continua focado no backend/frontend e nao valida o portal do ESP32
- ainda nao existe UI de monitoramento da saude de configuracao do firmware dentro do dashboard

### Proximos passos sugeridos
- adicionar reset de fabrica seguro pelo portal e opcionalmente por acionamento fisico futuro
- considerar `mDNS` ou identificador amigavel adicional para acesso ao portal em redes `STA`
- incluir teste guiado de configuracao do ESP32 na documentacao de demonstracao
- estudar `TLS` e autenticacao mais forte para cenarios externos

## [v0.5.3] - 2026-04-07
### Adicionado
- botao visivel `Sair` no card de sessao da sidebar do frontend
- atalho `Trocar usuario` na sidebar e suporte a `/login?force=1` para voltar ao formulario de autenticacao mesmo com sessao ativa

### Alterado
- fluxo de autenticacao do frontend atualizado para redirecionar explicitamente ao `/login` depois do logout
- documentacao principal, quickstart e README do frontend alinhados ao novo fluxo de sessao

### Corrigido
- UX de sessao em que o usuario ficava preso autenticado sem caminho claro para sair
- logout agora limpa token e usuario do `localStorage`, derruba a sessao em tempo real e permite entrar com outra conta sem gambiarra manual

### Pendente / Faltando
- avaliar se vale adicionar expiracao visivel de sessao ou refresh token em futuras iteracoes
- considerar um indicador mais explicito de qual perfil esta ativo quando houver varios operadores testando no mesmo navegador

### Limitacoes conhecidas
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware nao persiste apos reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstracao local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida tecnica / Pontos fracos
- o firmware ainda usa MQTT sem `TLS`
- `MQTT_TOPIC_*` no firmware continuam fixos em `include/app_config.h`, exigindo alinhamento manual quando `DEVICE_ID` muda
- a leitura de bateria real via `ADC` ainda nao existe
- o smoke test valida o fluxo principal, mas ainda depende de observabilidade indireta para confirmar a ingestao MQTT do mock
- o broker dev nao valida autenticacao nem persiste mensagens

### Proximos passos sugeridos
- adicionar um aviso visual de sessao expirada quando o backend passar a rejeitar tokens invalidos em tempo real
- considerar um menu de conta com detalhes de perfil e auditoria de login para demonstracoes mais completas

## [v0.5.2] - 2026-04-07
### Adicionado
- observacao explicita na documentacao de backend e quickstart sobre o ambiente local atual usar `MYSQL_PASSWORD=` vazio

### Alterado
- links documentais que ainda apontavam para caminhos absolutos do Windows foram convertidos para links relativos
- `backend/.env.example` foi alinhado ao ambiente local atual para evitar divergir da configuracao documentada

### Corrigido
- exemplos de configuracao do MySQL em `backend/README.md` e `docs/quickstart-windows.md` deixaram de indicar `MYSQL_PASSWORD=root`
- referencias cruzadas entre `README.md`, `backend/README.md` e `frontend/README.md` agora funcionam sem depender do caminho `C:/Queda/...`

### Pendente / Faltando
- revisar se existem copias antigas de documentacao fora da estrutura principal do projeto que ainda merecam limpeza manual
- manter essa checagem de consistencia sempre que houver nova reorganizacao de arquivos

### Limitacoes conhecidas
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware nao persiste apos reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstracao local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida tecnica / Pontos fracos
- o firmware ainda usa MQTT sem `TLS`
- `MQTT_TOPIC_*` no firmware continuam fixos em `include/app_config.h`, exigindo alinhamento manual quando `DEVICE_ID` muda
- a leitura de bateria real via `ADC` ainda nao existe
- o smoke test valida o fluxo principal, mas ainda depende de observabilidade indireta para confirmar a ingestao MQTT do mock
- o broker dev nao valida autenticacao nem persiste mensagens

### Proximos passos sugeridos
- revisar periodicamente se `README`, `.env.example` e scripts continuam descrevendo exatamente o ambiente padrao
- considerar um checklist automatizado para detectar links absolutos e exemplos de `.env` divergentes

## [v0.5.1] - 2026-04-07
### Adicionado
- estrategia de logs temporarios por execucao no `smoke-test.ps1`, usando subpastas unicas em `scripts/.runtime`

### Alterado
- ambiente local padronizado em `localhost` para backend, frontend e broker MQTT de desenvolvimento
- `backend/.env`, `backend/.env.example`, defaults do backend e documentacao operacional alinhados ao host local oficial
- `README.md`, `backend/README.md`, `docs/integration.md` e `docs/quickstart-windows.md` atualizados para refletir o fluxo local real

### Corrigido
- `smoke-test.ps1` agora valida o frontend no host correto e deixa de falhar por causa de `127.0.0.1` versus `localhost`
- limpeza e leitura de logs temporarios do mock publisher ficaram tolerantes a arquivo bloqueado no Windows
- a validacao do mock publisher passou a ser auxiliar, sem mascarar o fato de que backend, login e dashboard ja estao saudaveis
- checagens TCP dos scripts passaram a tratar corretamente `localhost` no Windows, inclusive quando o listener sobe em `::1`

### Pendente / Faltando
- confirmar o fluxo completo com MySQL ativo no ambiente final sempre que houver nova mudanca em scripts
- ampliar o smoke test para cobrir tambem transicoes de alerta em tempo real sem perder a execucao rapida
- revisar se vale expor o host local padrao tambem em telas de ajuda dentro do frontend

### Limitacoes conhecidas
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware nao persiste apos reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstracao local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida tecnica / Pontos fracos
- o firmware ainda usa MQTT sem `TLS`
- `MQTT_TOPIC_*` no firmware continuam fixos em `include/app_config.h`, exigindo alinhamento manual quando `DEVICE_ID` muda
- a leitura de bateria real via `ADC` ainda nao existe
- o smoke test valida o fluxo principal, mas ainda depende de observabilidade indireta para confirmar a ingestao MQTT do mock
- o broker dev nao valida autenticacao nem persiste mensagens

### Proximos passos sugeridos
- adicionar um endpoint ou utilitario leve para confirmar ingestao MQTT de teste sem depender de busca textual em `/api/devices`
- incluir uma verificacao opcional de `Socket.IO` no smoke test
- reduzir o tamanho do bundle do frontend
- considerar persistencia local para eventos do firmware em `NVS` ou `SPIFFS`

## [v0.5.0] - 2026-04-06
### Adicionado
- pasta `scripts/` com automacoes PowerShell para `check-env`, `setup-dev`, `init-db`, `start-all`, `start-backend`, `start-frontend`, `start-mock`, `open-site`, `stop-all` e `smoke-test`
- helper compartilhado em `scripts/_common.ps1` para leitura de `.env`, teste de portas, rastreamento de processos e mensagens amigaveis
- broker MQTT local leve em `backend/scripts/devBroker.js`, baseado em `Aedes`, para desenvolvimento e demonstracao local
- inicializacao automatica do banco em `backend/scripts/initDb.js`, reaproveitando `mysql2` do backend
- `package.json` na raiz com atalhos `dev:check`, `dev:setup`, `dev:init-db`, `dev:start`, `dev:stop` e `dev:smoke`
- guia operacional em PT-BR em `docs/quickstart-windows.md`
- `CHANGELOG.md` na raiz para registrar evolucao, limitacoes e proximos passos

### Alterado
- `README.md` reorganizado para servir como entrada principal, com links claros para `docs/quickstart-windows.md`, `docs/firmware-hardware.md` e `docs/integration.md`
- `backend/README.md` atualizado para refletir scripts reais, broker dev, seed demo e fluxo operacional atual
- `frontend/README.md` atualizado com fluxo de login/cadastro e referencia ao quickstart Windows
- `docs/integration.md` ampliado com broker local de desenvolvimento e observacoes do fluxo operacional real
- `docs/firmware-hardware.md` reforcado como referencia do ponto principal de configuracao do ESP32
- `include/app_config.h` reorganizado com comentarios mais didaticos para Wi-Fi, MQTT, `DEVICE_ID`, intervalos e flags
- tela de login do frontend ajustada para explicar quando usar seed demo e quando usar cadastro

### Corrigido
- `database/seed.sql` agora cria um hash compativel com a senha demo documentada `Admin@123`
- alinhamento entre seed, frontend, quickstart e smoke test para o fluxo real de login
- `.gitignore` atualizado para ignorar `scripts/.runtime`

### Pendente / Faltando
- testes automatizados de API mais completos alem do smoke test atual
- setup realmente zero-config para MySQL em todos os ambientes Windows, sem depender de servidor externo ja instalado
- estrategia de deploy ou empacotamento para apresentacao fora do ambiente de desenvolvimento
- validacao automatica de credenciais do firmware a partir do estado do backend

### Limitacoes conhecidas
- `battery_level` do firmware real ainda e placeholder fixo em `100`
- `EventBuffer` do firmware nao persiste apos reboot do ESP32
- o mock publisher difere do firmware real em alguns campos, como `temperature`, `firmware_version` e `message`
- o broker MQTT embutido e voltado apenas a desenvolvimento e demonstracao local
- o build do frontend ainda gera um chunk grande e exibe aviso do Vite
- a inicializacao do banco depende de um servidor MySQL existente e acessivel pelas credenciais do `backend/.env`

### Divida tecnica / Pontos fracos
- o firmware ainda usa MQTT sem `TLS`
- `MQTT_TOPIC_*` no firmware continuam fixos em `include/app_config.h`, exigindo alinhamento manual quando `DEVICE_ID` muda
- a leitura de bateria real via `ADC` ainda nao existe
- o smoke test valida o fluxo principal, mas nao cobre todas as transicoes operacionais de alertas
- o broker dev nao valida autenticacao nem persiste mensagens

### Proximos passos sugeridos
- adicionar testes HTTP automatizados para rotas de autenticacao, dispositivos e alertas
- criar opcao de seed resetavel para facilitar demonstracoes repetidas
- adicionar leitura real de bateria no firmware
- evoluir o frontend para reduzir o tamanho do bundle
- considerar persistencia local para eventos do firmware em `NVS` ou `SPIFFS`
