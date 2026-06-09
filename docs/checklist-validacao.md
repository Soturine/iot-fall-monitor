# Checklist de Validação

Este checklist separa validação automatizada, integração local e testes manuais com hardware. Marque cada item antes de uma entrega ou demonstração acadêmica.

## Regras de segurança

- [ ] Não executar queda real com uma pessoa.
- [ ] Usar apenas movimentos controlados do hardware em bancada.
- [ ] Não commitar `.env`, tokens, credenciais, dumps, logs ou artefatos gerados.
- [ ] Não executar `dev:init-db` sem confirmar que o reset do banco local é desejado.
- [ ] Não alterar o fluxo de pareamento durante uma rodada de validação.
- [ ] Não tratar heurística experimental como diagnóstico clínico.

## Matriz dos comandos automatizados

| Comando | O que valida | Pré-requisitos | O que não valida |
| --- | --- | --- | --- |
| `npm test --prefix backend` | Suíte Node completa: alertas, eventos, comportamento, MQTT, Socket.IO escopado e logger de stress | Node e dependências | Broker, MySQL e servidor reais |
| `npm run test:integration --prefix backend` | Integração leve entre serviços de alertas e ingestão MQTT com mocks controlados | Node e dependências | Rede, broker e banco reais |
| `npm run stress:dry --prefix backend` | Rajadas, payloads ruins, concorrência por device, alertas e telemetria em processo local | Node e dependências | Throughput real de broker/MySQL/backend |
| `npm run build --prefix frontend` | TypeScript e build de produção Vite | Dependências frontend | Fluxos manuais no navegador |
| `npm run lint --prefix frontend` | Regras estáticas do frontend | Dependências frontend | Comportamento em runtime |
| `npm run dev:smoke` | Backend/frontend reais, login JWT, tenant ativo e endpoints principais; mock MQTT opcional | MySQL, broker, backend e frontend ativos; seed/login válido | ESP32/IMU reais e precisão de queda |

## Resultado auditado em 9 de junho de 2026

- [x] `npm test --prefix backend`: passou, `64/64`.
- [x] `npm run test:integration --prefix backend`: passou, `42/42`.
- [x] `npm run test:mqtt --prefix backend`: passou, `16/16`.
- [x] `npm run stress:dry --prefix backend`: passou após alinhar o harness à validação real de telemetria; `225/225` mensagens processadas e `0` falhas.
- [x] `npm run build --prefix frontend`: passou.
- [x] `npm run lint --prefix frontend`: passou.
- [x] `npm run dev:smoke`: passou após subir broker/backend/frontend com `powershell -ExecutionPolicy Bypass -File .\scripts\start-all.ps1 -UseDevBroker -NoBrowser`; nenhum processo `mockPublisher` ficou órfão.
- [x] `GET /api/alerts/export` sem token retornou `401`.
- [x] `GET /api/alerts/export?status=open&severity=critical` com login demo e organização ativa retornou relatório da `Familia Demo`, filtros esperados e `19` campos por item.

O primeiro `dev:smoke` sem serviços ativos falhou corretamente em `/health`. Durante a investigação, publishers mock órfãos foram identificados como causa de saturação MQTT e login lento; o script agora encerra toda a árvore do processo auxiliar.

## Pré-validação do ambiente

```powershell
cd C:\Queda
npm run dev:check
```

- [ ] Node.js `20+` disponível.
- [ ] Dependências de backend e frontend instaladas.
- [ ] `backend/.env` e `frontend/.env` existem localmente e não estão versionados.
- [ ] MySQL acessível.
- [ ] Portas `4000`, `5173` e `1883` disponíveis ou ocupadas pelos serviços esperados.
- [ ] `database/schema.sql` e `database/seed.sql` presentes.

## Login JWT e controle de acesso

- [ ] Login válido retorna token JWT.
- [ ] JWT expira em `7d`.
- [ ] Rota protegida sem `Authorization: Bearer <token>` retorna `401`.
- [ ] Token inválido retorna `401`.
- [ ] Conta desabilitada não acessa o sistema.
- [ ] `X-Organization-Id` seleciona somente organização permitida.
- [ ] Usuário sem vínculo com o tenant recebe `403`.
- [ ] `platform_admin` consegue operar globalmente ou selecionar organização.
- [ ] `organization_admin` acessa toda a organização ativa.
- [ ] `caregiver`, `operator` e `viewer` não acessam outra organização.
- [ ] Quando existem assignments, usuário restrito vê somente pacientes atribuídos.
- [ ] Após F5, o frontend reidrata sessão via `GET /api/me`.
- [ ] `GET /api/alerts/export` sem Bearer Token retorna `401`.
- [ ] `GET /api/alerts/export` envia e respeita `X-Organization-Id`.

## MQTT e ingestão

- [ ] Backend assina `queda/devices/+/status`.
- [ ] Backend assina `queda/devices/+/telemetry`.
- [ ] Backend assina `queda/devices/+/events`.
- [ ] Status atualiza `device_status`.
- [ ] Telemetria válida grava `telemetry_logs`.
- [ ] Telemetria sem eixos ou com `sensor_valid=false` não grava amostra falsa.
- [ ] JSON inválido é descartado sem derrubar o backend.
- [ ] Divergência entre device do tópico e payload gera diagnóstico.
- [ ] Timestamp inválido/stale usa hora de recebimento quando necessário.
- [ ] Evento crítico reenviado com mesmo `event_uuid` não cria duplicata.
- [ ] MQTT reconecta e reassina tópicos após desconexão.

Comandos úteis:

```powershell
npm run mqtt:test --prefix backend -- 127.0.0.1 1883
npm run mqtt:watch --prefix backend
npm run mqtt:publish:test --prefix backend -- --device esp32_01 --count 10
```

## Socket.IO e multi-tenant

- [ ] Socket sem token é rejeitado.
- [ ] Socket com token inválido é rejeitado.
- [ ] Socket recebe `organizationId` ativo.
- [ ] `platform_admin` global entra na room de plataforma.
- [ ] Tenant entra na room `scope:org:{organizationId}`.
- [ ] Usuário restrito entra apenas nas rooms de pacientes atribuídos.
- [ ] `telemetry:new` atualiza o detalhe do dispositivo sem F5.
- [ ] `device:status` atualiza presença/diagnóstico.
- [ ] `alert:new` aparece somente no escopo autorizado.
- [ ] `alert:updated` reflete acknowledge/resolve/cancel.

## Banco e rastreabilidade

- [ ] `users` não armazena senha em texto puro.
- [ ] `organizations` e `organization_members` representam tenant e papel.
- [ ] `devices` possui identidade técnica e estado de claim.
- [ ] `device_assignment_history` preserva troca de paciente.
- [ ] `device_status` guarda último estado operacional e diagnóstico.
- [ ] `telemetry_logs` guarda somente telemetria válida.
- [ ] `events` preserva `raw_payload_json` e `evidence_summary_json`.
- [ ] `event_telemetry_evidence` relaciona evento e amostras.
- [ ] `alerts.event_id` impede alerta duplicado para o mesmo evento.
- [ ] `alert_actions` registra ações humanas.
- [ ] `npm run db:migrate:alert-actions --prefix backend` garante a tabela sem resetar o banco.
- [ ] `audit_logs` registra operações administrativas relevantes.

## Histórico e exportação de relatório

- [ ] A tela continua carregando alertas e eventos históricos.
- [ ] Os filtros de status, severidade, dispositivo, data inicial e data final continuam funcionando.
- [ ] **Exportar JSON** baixa apenas os alertas compatíveis com os filtros atuais.
- [ ] O JSON contém `generatedAt`, organização, filtros, total e itens.
- [ ] Cada item exportado contém identidade do alerta, paciente, dispositivo, evento, evidência e ações/status relevantes.
- [ ] A exportação respeita organização ativa e assignments de paciente.
- [ ] O backend limita a exportação a no máximo `500` registros.
- [ ] **Exportar PDF** abre uma visualização imprimível com título, organização, filtros, total, tabela e aviso experimental.
- [ ] O navegador permite salvar a visualização como PDF.
- [ ] Acknowledge, cancelamento e resolução continuam gerando `alert_actions` e `audit_logs` quando aplicável.

## Fluxo de alerta

- [ ] Telemetria real continua chegando antes, durante e depois de evento.
- [ ] `movement_detected`/`fall_suspected` são apresentados como heurística experimental.
- [ ] `movement_detected` é evento informativo e não cria alerta ativo nem buzzer.
- [ ] `fall_detected` sem evidência suficiente é auditado, mas não vira alerta confirmado automático.
- [ ] `fall_detected` com evidência `partial`/`linked` pode criar alerta.
- [ ] SOS manual continua funcionando sem depender da telemetria.
- [ ] Backend persiste evento antes de criar alerta.
- [ ] Frontend apenas exibe a decisão/evidência.
- [ ] Buzzer local não depende do frontend.
- [ ] Buzzer toca apenas para queda confirmada/SOS e ignora eventos experimentais não críticos.
- [ ] Cooldown/deduplicação evitam spam de alerta.

## Hardware ESP32, IMU e buzzer

- [ ] Upload na porta correta conclui.
- [ ] Serial Monitor mostra endereço I2C e `WHO_AM_I`.
- [ ] `sensor_ready=1`, `sensor_valid=1` e `sensor_read_ok=1`.
- [ ] Em repouso, magnitude corrigida fica próxima de `1 g`.
- [ ] `sample_age_ms` permanece baixo.
- [ ] `i2c_error_count` não cresce continuamente.
- [ ] Recovery aparece quando falhas consecutivas atingem o limite.
- [ ] Raw totalmente zerado é descartado.
- [ ] Portal mostra configuração atual sem interromper MQTT.
- [ ] Botão `Testar buzzer` gera pulso curto não bloqueante.
- [ ] Evento local permitido gera log de buzzer.
- [ ] Bateria manual aparece como `manual`; sem valor, dashboard mostra `--%`.

## Pareamento: regressão não invasiva

O pareamento não deve ser alterado nesta rodada. Para validar sem refatorar:

- [ ] Device já claimed continua associado à organização correta.
- [ ] Reiniciar ESP32 não cria device duplicado.
- [ ] Device MQTT desconhecido permanece `unclaimed`.
- [ ] Não gerar novo código nem executar claim durante a apresentação se o vínculo atual já está correto.
- [ ] Não rodar reset do banco antes de validar o vínculo atual.
- [ ] Confirmar que nenhum arquivo de pareamento foi alterado nesta rodada.
- [ ] Desvincular paciente encerra o assignment sem apagar histórico.
- [ ] Resetar claim exige JWT + `organization_admin` e preserva telemetria/eventos/alertas.
- [ ] Arquivar paciente sem device muda status para `archived`; com device vinculado, a ação é bloqueada.

## Riscos e lacunas atuais

- [ ] Executar `stress:real` em ambiente local/dev preparado para medir broker, backend e MySQL reais.
- [ ] Repetir teste ponta a ponta com ESP32 real, evento controlado e dashboard.
- [ ] Validar buzzer físico para todos os eventos configurados.
- [ ] Coletar dataset maior para calibrar thresholds e estados.
- [ ] Validar FFT somente como experimento até existir calibração.
- [ ] Medir retenção/crescimento de `telemetry_logs`.
- [ ] Avaliar TLS MQTT e persistência durável de eventos críticos.
- [ ] Validar visualmente a impressão PDF nos navegadores usados na apresentação.
- [ ] QR Code permanece fora do escopo.

## Checklist v0.9.0

- [ ] Device sem configuração NVS inicia em Demo apresentação.
- [ ] Device com configuração NVS salva como Normal continua em Normal.
- [ ] Portal alterna entre Demo e Normal e persiste a escolha.
- [x] Modo Demo observado no device real com leitura a `25 ms`, telemetria a `500 ms` e gráfico de `120` amostras.
- [x] Status/telemetria MQTT sem campos de bateria possui regressão automatizada para `battery_calibration_count=0`.
- [ ] Giro isolado gera no máximo movimento; impacto sem imobilidade não vira queda confirmada.
- [x] Queda controlada da caixinha em superfície macia foi registrada com impacto, orientação e imobilidade.
- [ ] `movement_detected` e `fall_suspected` não acionam buzzer.
- [ ] `fall_detected` confirmado e SOS acionam buzzer quando habilitado.
- [x] Nova bateria manual aparece no device real como estimativa com uma calibração registrada.
- [x] Cálculo automatizado da estimativa limita o valor entre `0%` e `100%`.
- [ ] Executar `npm run db:migrate:battery-estimation --prefix backend` duas vezes sem perda de dados.
- [ ] Título da aba é `Monitor de Quedas | HealthTech IoT` e favicon não é o padrão Vite.

## Evidências visuais v0.9.0

- [x] Capturas reais do device online, Modo Demo, telemetria com `120` amostras, portal ESP32 e queda confirmada.
- [x] Captura real da bateria estimada após calibração manual válida.
- [x] Tour visual lento da interface capturado com o sensor em repouso.
- [ ] GIF real de uma nova queda controlada percorrendo ESP32, MQTT, backend, Socket.IO e dashboard.

O tour visual comprova as telas e a operação real do ambiente, mas não substitui o GIF realtime de uma nova queda.
