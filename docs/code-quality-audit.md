# Auditoria de Qualidade de Código - v0.8.27

Data da auditoria: 2026-06-03.

Escopo: firmware ESP32, backend Node/Express/MySQL/MQTT/Socket.IO, frontend React/Vite/TypeScript, banco, scripts e documentação operacional. Esta auditoria não alterou lógica de alerta, telemetria, MQTT, buzzer, firmware, backend funcional, frontend funcional, API, Socket.IO ou schema.

## Nota geral

**Nota geral: 7.3 / 10**

O projeto está funcional, observável e já possui uma base real de testes backend, contratos MQTT claros, multi-tenant preservado e documentação operacional acima da média para uma baseline acadêmica/IoT. O ponto fraco principal é que a implementação cresceu rápido: vários arquivos concentram muitas responsabilidades, especialmente `src/main.cpp`, `src/setup_portal.cpp`, `backend/src/services/deviceService.js`, `backend/src/services/eventService.js`, `frontend/src/pages/DevicesPage.tsx` e `frontend/src/pages/DeviceDetailPage.tsx`.

O risco atual não é uma falha única óbvia, mas acoplamento: cada nova melhoria de calibração, FFT, retenção de telemetria ou notificação externa tende a atravessar muitos arquivos grandes. A recomendação central é evoluir com extrações pequenas e testadas, sem reescrever o fluxo de alerta/telemetria.

## Notas por área

| Área | Nota | Pontos fortes | Problemas | Risco atual | Recomendação prática |
|---|---:|---|---|---|---|
| Firmware | 7.0 | Separação parcial em sensor, MQTT, portal, buffer, detector e feature extractor; `EventBuffer` é simples; `FallFeatureExtractor` é encapsulado. | `src/main.cpp` tem 1371 linhas e orquestra sensor, payloads, alertas, buzzer, buffer, status e loop; `src/setup_portal.cpp` tem 1152 linhas e monta HTML por concatenação de `String`. | Fragmentação de heap por `String`, dificuldade de revisar payload MQTT e risco de regressão ao mexer em alerta. | Extrair `event_payload_builder`, `telemetry_payload_builder`, `sensor_health_reporter` e `alert_decision_runner` em v0.8.x. |
| Backend | 7.2 | Escopo multi-tenant consistente; locks por device; testes `node:test` cobrem eventos, alertas e MQTT; logs com `correlationId`. | `deviceService.js` tem 1867 linhas; `eventService.js` tem 961; duplicação de normalização e mapeamento; `event_uuid` é deduplicado via JSON em vez de coluna indexada. | Crescimento de custo por mensagem MQTT e manutenção difícil quando adicionar retenção, calibração e notificações. | Centralizar helpers de mapeamento/normalização e planejar coluna/index para `event_uuid`. |
| Frontend | 7.1 | UX rica, tipos centralizados em `types/api.ts`, helpers de realtime em `deviceRealtime.ts`, gráfico funcional. | `DevicesPage.tsx` tem 1174 linhas; `DeviceDetailPage.tsx` tem 993; lógica de domínio e JSX misturadas; ausência de testes frontend. | Rerender/refetch excessivo com mais devices e telemetria; manutenção visual difícil. | Extrair hooks (`useDeviceDetailRealtime`, `usePairingSession`) e componentes de diagnóstico/evidência. |
| Banco de dados | 7.5 | Índices importantes já existem para `telemetry_logs`, `events`, `alerts` e `device_status`; schema cobre multi-tenant. | Sem política de retenção/particionamento para `telemetry_logs`; dedupe por `event_uuid` depende de `JSON_EXTRACT`; migrations são scripts pontuais. | Crescimento de telemetria pode degradar backup, queries e storage. | Criar plano de retenção e migração idempotente para colunas críticas de evento. |
| Testes | 6.8 | Backend tem testes de alertas, MQTT, evidência, device behavior e stress logger; scripts de stress dry-run existem. | Firmware sem testes automatizados; frontend sem testes; pouca cobertura de componentes grandes. | Refatorações futuras ficam mais arriscadas fora do backend. | Criar testes frontend mínimos e testes unitários C++ possíveis para detector/feature extractor. |
| Observabilidade/logs | 8.0 | Logs de MQTT, sensor, alerta, I2C, buffer, escopo e realtime estão ricos; `mqtt:watch` ajuda bancada. | Risco de logs excessivos em alta frequência; várias mensagens similares em serviços distintos. | Ruído e custo de log em stress real com muitos devices. | Definir níveis por canal e métricas agregadas para ingestão. |
| Segurança básica | 6.7 | JWT, `X-Organization-Id`, rooms Socket.IO por escopo e multi-tenant estão presentes; `.env` fora do Git. | Portal ESP32 em AP local ainda é operacionalmente sensível; MQTT dev sem TLS por padrão; sem hardening de rate limit. | Em produção, portal e MQTT precisam de política clara de autenticação/TLS. | Tratar portal/MQTT externo como trilha de v0.9.x antes de uso fora de bancada. |
| Escalabilidade | 6.6 | Índices e locks locais ajudam; telemetry inválida é rejeitada; realtime é emitido por rooms. | Lock por device é local ao processo; pool MySQL é 10; telemetria é insert por amostra; sem retenção. | Vários devices em alta frequência pressionam banco e logs. | Considerar broker Mosquitto/Aedes dedicado, batch/filas e retenção por janela. |
| Manutenibilidade | 6.6 | Nomes geralmente claros e documentação boa. | Arquivos grandes, helpers repetidos, HTML C++ em string longa, services com muitas responsabilidades. | A próxima feature grande pode duplicar ainda mais regras. | Refatorar por extração, não por reescrita. |
| Clareza da arquitetura | 7.4 | Camadas firmware/backend/frontend/banco estão compreensíveis; contratos MQTT documentados. | Decisão local, decisão experimental e auditoria backend ainda dividem payloads e evidências em muitos pontos. | Confusão entre estado heurístico, evento experimental e queda confirmada se crescer sem módulos. | Documentar e codificar boundaries: firmware decide local, backend audita/deduplica, frontend exibe. |
| Preparação para futuras expansões | 7.2 | FFT/calibração já tem placeholders e tipos; `FallFeatureExtractor` existe. | A infraestrutura de calibração ainda é documental; não há schema real nem coleta supervisionada. | Tentar IA/FFT sem retenção/dataset pode gerar falsa confiança. | Implementar sessões de coleta antes de mudar algoritmo principal. |

## Dead code encontrado

### Removido agora

Nenhum. A auditoria foi propositalmente documental e não removeu código, para não tocar no fluxo de alerta/telemetria.

### Mantido por segurança

- `MOTION_TEST_MODE_ENABLED`, `MOTION_TEST_*` e `BUZZER_ENABLED` em [include/app_config.h](../include/app_config.h): são legados de bancada, mas ainda documentados e usados por `handleMotionTest` em [src/main.cpp](../src/main.cpp).
- Fallback `legacy:{device_id}` em `deviceService.js`, seeds e scripts: continua necessário para compatibilidade com banco/demo e reconciliação de devices antigos.
- `FallCalibrationProfile`, `MovementLabel` e estados futuros em [include/models.h](../include/models.h): ainda são base futura para calibração e não devem ser removidos.
- `docs/motion-test-bench-report.md`: histórico antigo, mas útil para hardware/CH9102 e bancada.
- `test/README`, `lib/README` e `include/README`: placeholders padrão do PlatformIO, sem custo real.

### Candidato futuro

- Motion test compile-time pode virar apenas modo configurável pelo portal, removendo duplicação com `fall_suspected`/`movement_detected`.
- `FallCalibrationProfile` pode ser movido para um módulo de calibração quando houver schema real.
- `wifi_manager` está em uso por `ConnectivityManager`, mas as responsabilidades de reconexão e setup podem ser reavaliadas quando o portal ficar mais modular.
- Scripts de migration pontuais (`migrateEvidenceSchema.js`, `migrateSensorDiagnosticsSchema.js`) podem ser substituídos por um runner de migrations versionadas.

## Duplicações encontradas

### Firmware

- [src/main.cpp](../src/main.cpp): `buildEventPayload`, `buildStatusPayload` e `buildTelemetryPayload` repetem campos de device, timestamp, `device_uid`, `device_id`, diagnóstico de sensor e tópicos.
- [src/main.cpp](../src/main.cpp): `addSensorContextToEventPayload` centraliza parte do diagnóstico, mas status/telemetry ainda remontam campos semelhantes manualmente.
- [src/setup_portal.cpp](../src/setup_portal.cpp): `append*Card`, `render*Summary` e `handle*` misturam HTML, validação, persistência e chamadas HTTP/MQTT.
- [src/config_store.cpp](../src/config_store.cpp): chaves de `Preferences` para Wi-Fi e snapshot de eventos são bem encapsuladas, mas a persistência de config e buffer vivem no mesmo arquivo.

### Backend

- `toIso`, `toNullableNumber`, `toNullableBoolean` aparecem em `eventService.js`, `alertService.js`, `deviceService.js`, `mqttIngestionService.js`, `dashboardService.js`, `patientService.js`, `scopeService.js`, `pairingService.js` e `organizationService.js`.
- Mapeamentos de `event`, `alert`, `telemetry` e `device` são repetidos em `eventService.js`, `alertService.js`, `deviceService.js` e `dashboardService.js`.
- Joins de `events`, `alerts`, `devices` e `patients` aparecem em múltiplas listagens com pequenas variações.
- A lista de eventos de comportamento (`fall_detected`, `fall_suspected`, `movement_detected`, SOS e calibração) aparece em consultas de `deviceService.js` e regra de `deviceBehaviorService.js`.

### Frontend

- `DeviceDetailPage.tsx` possui helpers locais (`formatBooleanDiagnostic`, `formatNumberDiagnostic`, `expectedTopic`, extração de evidência) que poderiam ir para `lib/deviceDiagnostics.ts`.
- `DevicesPage.tsx`, `PatientsPage.tsx`, `AlertsPage.tsx` e `OrganizationPage.tsx` repetem padrões de modal, formulário, cards de métrica, empty/loading state e tratamento de erro.
- Filtros e contadores usam múltiplos `.filter()` no render (`AlertsPage`, `DevicesPage`, `DashboardPage`), aceitável com poucos itens, mas repetitivo.

## Funções grandes demais

| Arquivo | Função/trecho | Tamanho aproximado | Observação |
|---|---|---:|---|
| [src/main.cpp](../src/main.cpp) | `buildEventPayload` | 100 linhas | Monta evento, features, thresholds, sensor e payload completo. Bom candidato a `event_payload_builder`. |
| [src/main.cpp](../src/main.cpp) | `loop` | 70 linhas | Orquestra portal, conectividade, sensor, detector, buzzer, MQTT, buffer e telemetria. |
| [src/main.cpp](../src/main.cpp) | `handleExperimentalAlertDetection` | 49 linhas | Regra experimental está clara, mas deveria virar runner separado. |
| [src/setup_portal.cpp](../src/setup_portal.cpp) | `handleSaveSettings` | 118 linhas | Validação, presets, persistência, mensagens e restart juntos. |
| [src/setup_portal.cpp](../src/setup_portal.cpp) | `handlePairDevice` | 90 linhas | Monta HTTP, payload, trata resposta e persiste perfil. |
| [src/setup_portal.cpp](../src/setup_portal.cpp) | `renderOperationalHealthSummary` | 72 linhas | HTML + regra operacional misturados. |
| [src/sensor_mpu6050.cpp](../src/sensor_mpu6050.cpp) | `calibrateAccelerometer` | 178 linhas | Complexa, mas local ao sensor; dividir em coleta, validação e aplicação ajudaria. |
| [src/sensor_mpu6050.cpp](../src/sensor_mpu6050.cpp) | `begin` | 106 linhas | Scan, probe, logs e configuração juntos. |
| [backend/src/services/deviceService.js](../backend/src/services/deviceService.js) | arquivo inteiro | 1867 linhas | Mistura identidade, status, assignment, listagem, reconciliação, CRUD e snapshots. |
| [backend/src/services/eventService.js](../backend/src/services/eventService.js) | arquivo inteiro | 961 linhas | Validação MQTT, evidência, persistência, listagem e mapeamento. |
| [backend/src/services/mqttIngestionService.js](../backend/src/services/mqttIngestionService.js) | `handleMqttMessage` | 430 linhas | Parse, lock, transação, status, telemetry, event, logs e realtime. |
| [frontend/src/pages/DevicesPage.tsx](../frontend/src/pages/DevicesPage.tsx) | `DevicesPage` | 1077 linhas | Lista, pairing, assignment, modal, network info e realtime no mesmo componente. |
| [frontend/src/pages/DeviceDetailPage.tsx](../frontend/src/pages/DeviceDetailPage.tsx) | `DeviceDetailPage` | 593 linhas de componente + helpers | Diagnóstico, evidência, estado, gráfico, eventos e assignment juntos. |
| [frontend/src/pages/AlertsPage.tsx](../frontend/src/pages/AlertsPage.tsx) | `AlertsPage` | 479 linhas | Filtros, listagem, eventos, modal e ações no mesmo componente. |

## Análise de complexidade

### Firmware

| Operação | Tempo | Espaço | Gargalo | Melhoria recomendada |
|---|---|---|---|---|
| Loop principal | O(1) por iteração, com tarefas condicionais por intervalo | O(1) | Muitas responsabilidades em uma função; risco de jitter se portal/MQTT crescer. | Extrair scheduler simples de tarefas periódicas. |
| Leitura do MPU6050 | O(1), 14 bytes por amostra, com retry O(r) | O(1) | `delay()` curto em retry/recovery/calibração; aceitável, mas bloqueante. | Manter delays só em boot/recovery; monitorar tempo real do loop. |
| Recovery I2C | O(1) para reconfiguração; scan de boot O(128) endereços | O(1) | Recovery reinicia barramento e reconfigura sensor, podendo bloquear momentaneamente. | Registrar duração e limitar frequência. |
| Montagem de JSON | O(f), f = campos do payload | `StaticJsonDocument` de 768, 896 e 3072 bytes | `buildEventPayload` é o payload mais pesado; stack/heap de `String` importa no ESP32. | Builder separado e testes de tamanho de payload. |
| Buffer de eventos | O(1) push/peek/pop; O(capacidade) snapshot/restore | O(capacidade * payload) | `String` nos eventos pode fragmentar heap; NVS snapshot pequeno ajuda, mas não é journal. | Avaliar payload fixo/arena ou persistência futura em LittleFS. |
| FallFeatureExtractor | O(1) add; O(w) snapshot, w=64 | O(w) leituras | Seguro para ESP32; FFT ainda placeholder. | Manter w baixo e calcular FFT só por flag. |
| FallDetector | O(1) por amostra | O(1) | Estado simples e claro. | Preservar como decisão local principal até validação. |
| Portal de configuração | O(tamanho do HTML) | Vários `String` acumulados | Concatenação repetida pode virar O(n²) por realocação e fragmentar heap. | Dividir em templates menores ou streaming `server_.sendContent`. |

### Backend

| Operação | Tempo | Espaço | Gargalo | Melhoria recomendada |
|---|---|---|---|---|
| Ingestão MQTT telemetry | O(1) aplicação + DB insert/upsert + snapshot | O(1) por mensagem | Transação por mensagem, logs detalhados, pool 10. | Medir throughput real e considerar fila/batch quando crescer. |
| Ingestão MQTT events | O(1) + busca evidência O(k log k), k<=30 | O(k) | `recordEventFromMqtt` faz dedupe, evidência, insert, links e logs. | Extrair `eventEvidenceService` e `eventDedupeService`. |
| Deduplicação por event_uuid | O(eventos do device) potencial no banco | O(1) | Usa `JSON_EXTRACT(raw_payload_json, '$.event_uuid')`; sem índice dedicado. | Criar coluna `event_uuid` indexada em migration futura. |
| Busca de evidência | DB usa range por `device_id`/tempo e ordena por distância | O(k) no app | `ORDER BY ABS(TIMESTAMPDIFF(...))` não usa índice para ordenação. | Primeiro buscar por range indexado, depois escolher nearest no app, ou manter por k baixo. |
| `insertEvidenceLinks` | O(k), k<=30, inserts sequenciais | O(k) | Pode virar custo visível em queda com muitos links. | Batch insert quando seguro. |
| Listagem de alertas | O(log n + página) + COUNT | O(página) | `COUNT(*)` por request e joins. | Cache leve ou cursor pagination em produção. |
| Listagem de devices | O(log n + página + janelas por devices) | O(devices * amostras) | Usa `ROW_NUMBER()` para janelas recentes, bom mas custa com muitos devices. | Manter limite baixo e medir MySQL real. |
| Realtime Socket.IO | O(r), r = rooms destino | O(r) | Rooms são boas; payloads grandes podem pesar. | Emitir patches mínimos sempre que possível. |
| Stress scripts | O(cenários * mensagens) | logs locais | Dry-run não mede broker/MySQL reais. | Manter `stress:real` para baseline de throughput. |

### Frontend

| Operação | Tempo | Espaço | Gargalo | Melhoria recomendada |
|---|---|---|---|---|
| Render do dashboard | O(d + a + e) | O(d + a + e) | Várias contagens por `.filter`; aceitável com limites atuais. | Memoizar métricas se listas crescerem. |
| Detalhe do device | O(t log t) no patch/chart, t<=30 | O(t) | Poll de 10s + realtime; muitos blocos no mesmo componente. | Extrair hook e componentes. |
| `applyTelemetryPatchToDetail` | O(t log t) por amostra | O(t) | Sort a cada `telemetry:new`; ok com 30, ruim com 3000. | Inserção ordenada ou ring buffer se aumentar janela. |
| Gráfico de telemetria | O(n log n) por sort + O(n) domínio | O(n) | Recharts renderiza todos os pontos. 30 é ok; 300/3000 exigem downsample. | Limite, downsampling ou virtualização futura. |
| Tela de alertas | O(a + e + d) | O(a + e + d) | Refetch em `alert:new`/`alert:updated`; ok para volume baixo. | Patch incremental para alerts. |
| Tela de devices | O(d + p) render, várias passagens | O(d + p) | Componente muito grande; pairing e assignment aumentam estado local. | Separar modais/hooks. |

## Pontos O(n²)

Não encontrei um ponto crítico O(n²) evidente em hot paths de telemetry/events com os limites atuais.

Riscos futuros:

- `src/setup_portal.cpp` usa concatenação repetida de `String` para HTML. Em C++/Arduino, o custo prático pode se aproximar de O(n²) por realocação e fragmentação conforme a página cresce.
- `computeDeviceBehavior` chama `findRecentEvent` várias vezes, e cada chamada normaliza/ordena eventos. Com poucos eventos é aceitável, mas poderia normalizar uma vez.
- `TelemetryChart` e `applyTelemetryPatchToDetail` ordenam a janela a cada atualização. Com 30 amostras é seguro; com 3000 passa a ser gargalo.
- Loops de inserts sequenciais (`insertEvidenceLinks`, caregivers) são O(n), não O(n²), mas podem ser otimizados por batch.

## Refatorações seguras aplicadas

Nenhuma. A rodada foi limitada à auditoria técnica para respeitar a restrição de não mexer na lógica de alerta/telemetria.

## Refatorações recomendadas para próximas versões

### v0.8.x

- Extrair `event_payload_builder` no firmware sem mudar o JSON final.
- Extrair `sensor_health_reporter` para compartilhar status, telemetry e events.
- Extrair `alert_decision_runner` para encapsular `movement_detected`/`fall_suspected`.
- Centralizar `toIso`, `toNullableNumber`, `toNullableBoolean` em helpers backend.
- Extrair `eventEvidenceService` e `eventDedupeService`.
- Criar `useDeviceDetailRealtime` no frontend.
- Extrair blocos `EvidenceSummary`, `TelemetryDiagnosticsPanel` e `CurrentStatePanel` para componentes menores.
- Criar testes frontend mínimos para `deviceRealtime.ts`, `format.ts` e render básico de `TelemetryChart`.

### v0.9.x

- Criar migrations versionadas em vez de scripts pontuais.
- Adicionar coluna/index `event_uuid` em `events` e migrar dedupe para SQL indexado.
- Implementar retenção de `telemetry_logs`, por exemplo 7/30 dias por ambiente.
- Criar schema real para `calibration_sessions`, `calibration_samples`, `calibration_feature_sets` e `calibration_profiles`.
- Introduzir Mosquitto ou broker externo configurável para bancada mais fiel.
- Adicionar CI com backend check/test, frontend lint/build e PlatformIO.
- Adicionar testes C++ para `FallDetector`, `FallFeatureExtractor` e `EventBuffer` quando o ambiente permitir.

### v1.0

- Separar ingestão MQTT em worker/fila/event bus.
- Implementar armazenamento durável de eventos críticos no ESP32 (`LittleFS`/`SPIFFS`) ou protocolo de ACK.
- Implementar calibração por botão/SOS com coleta supervisionada.
- Construir dataset local de repouso, sentado, deitado, andando, correndo, movimento brusco, queda simulada em bancada e SOS manual.
- Evoluir classificador de atividade sem vender precisão clínica.
- Hardening de segurança do portal ESP32, MQTT TLS, rate limit e autenticação operacional.
- Notificações externas reais (WhatsApp, SMS, e-mail, webhook) com idempotência e auditoria.

## Plano de evolução

1. **Calibração por botão/SOS:** iniciar sessão, escolher label, coletar runs curtas e salvar features. Não usar como decisão principal antes de validação.
2. **Sessões de coleta de movimento:** registrar amostras brutas e features por run, com metadados de paciente/dispositivo e ambiente.
3. **Dataset local:** começar com bancada controlada e atividades simples; separar treino/validação; documentar limites.
4. **Retenção de telemetry_logs:** definir janela por ambiente, rotina de purge e possível particionamento por data.
5. **Segurança do portal ESP32:** revisar exposição do AP, senha, tempo de manutenção e endpoints de teste.
6. **Testes frontend:** cobrir helpers e páginas críticas com smoke render.
7. **CI/CD:** rodar checks de backend/frontend/firmware em PR ou push.
8. **Broker MQTT externo/Mosquitto:** usar Aedes apenas como devBroker; validar Mosquitto para cenário mais real.
9. **Melhoria do algoritmo de queda:** manter FSM local como decisão crítica, adicionar FFT/calibração como evidência experimental até validar.

## Validações executadas nesta auditoria

- `npm run dev:check`: passou; avisos não bloqueantes para `mysql` CLI fora do PATH e portas `4000`/`5173` já ocupadas.
- `git diff --check`: passou.
- `npm run check --prefix backend`: passou, 75 arquivos JavaScript validados.
- `npm test --prefix backend`: passou, 40 testes.
- `npm run test:mqtt --prefix backend`: passou, 15 testes.
- `npm run test:alerts --prefix backend`: passou, 18 testes.
- `npm run lint --prefix frontend`: passou.
- `npm run build --prefix frontend`: passou.
- `pio run`: não executou porque `pio` não está no PATH.
- `platformio run`: não executou porque `platformio` não está no PATH.
- `& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run`: passou.
- Build firmware: RAM 16.6% (`54332` de `327680` bytes), Flash 84.6% (`1108405` de `1310720` bytes).
