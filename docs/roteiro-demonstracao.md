# Roteiro de Demonstração

Este roteiro organiza uma apresentação curta e tecnicamente defensável do projeto `iot-fall-monitor`. O foco é demonstrar integração, rastreabilidade, segurança de acesso e limitações conhecidas sem afirmar precisão clínica.

## Objetivo da apresentação

Demonstrar o fluxo:

```text
ESP32 + IMU
-> MQTT
-> backend Node.js
-> MySQL
-> Socket.IO
-> dashboard multi-tenant
-> evento e alerta interno
```

O projeto separa responsabilidades:

- firmware: lê a IMU, publica telemetria/status/eventos e aciona o buzzer para decisões locais
- MQTT: transporta mensagens do dispositivo para o backend
- backend: valida, persiste, relaciona evidências, cria alertas e aplica escopo de acesso
- MySQL: mantém histórico de dispositivos, telemetria, eventos, evidências, alertas e ações
- Socket.IO: atualiza o navegador em tempo real no escopo autorizado
- frontend: apresenta dados e diagnósticos; não decide uma queda real

## Preparação antes da banca

Não rode `dev:init-db` no dia da apresentação sem ter confirmado que o reset do banco é desejado. O script recria o schema local.

Execute:

```powershell
cd C:\Queda
npm run dev:check
npm test --prefix backend
npm run test:integration --prefix backend
npm run stress:dry --prefix backend
npm run lint --prefix frontend
npm run build --prefix frontend
powershell -ExecutionPolicy Bypass -File .\scripts\start-all.ps1 -NoBrowser
npm run dev:smoke
```

Confirme:

- backend em `http://localhost:4000/health`
- frontend em `http://localhost:5173`
- broker MQTT local na porta `1883`
- login demo disponível, quando o seed existir: `admin@queda.local`
- ESP32 usando o IP LAN do notebook, nunca `localhost`
- Serial Monitor mostrando `sensor_ready=1`, `sensor_valid=1`, `sensor_read_ok=1`
- `mqtt:watch` recebendo status e telemetria

Ao terminar:

```powershell
npm run dev:stop
```

## Roteiro curto de 8 a 10 minutos

### 1. Problema e proposta

Explique em aproximadamente um minuto:

- quedas podem exigir resposta rápida e histórico auditável
- o protótipo combina sensor inercial, comunicação IoT e painel web
- o sistema é experimental e não representa dispositivo médico validado

### 2. Arquitetura ponta a ponta

Mostre o diagrama do README ou de `docs/alerting-architecture.md`.

Destaque:

- tópicos MQTT: `queda/devices/{deviceId}/status`, `telemetry` e `events`
- telemetria periódica pode tolerar perda eventual
- eventos críticos possuem `event_uuid`, fila local e deduplicação
- `fall_detected` local pode acionar o buzzer sem depender do navegador

### 3. Login JWT e perfis de acesso

Faça login no frontend e explique:

- o backend emite JWT com validade de `7d`
- chamadas protegidas enviam `Authorization: Bearer <token>`
- o tenant ativo é informado por `X-Organization-Id`
- o backend valida o escopo; a segurança não depende apenas de esconder telas

Perfis atuais:

- `platform_admin`: acesso global ou a uma organização selecionada
- `organization_admin`: gestão da organização ativa
- `caregiver`, `operator` e `viewer`: acesso restrito à organização e, quando configurado, aos pacientes atribuídos

Não exiba segredos JWT ou arquivos `.env`.

### 4. Dashboard e telemetria em tempo real

Abra o detalhe de um dispositivo e mostre:

- status online/offline
- diagnóstico do sensor e I2C
- gráfico com telemetria recente
- diferença entre dispositivo online e telemetria válida/recente
- bateria manual ou `--%` quando não informada

Explique que:

- os cards do dashboard usam dados reais retornados pelo backend, não valores fixos do frontend
- MQTT entrega dados do ESP32 ao backend
- o backend persiste telemetria válida em `telemetry_logs`
- `telemetry:new` atualiza o frontend por Socket.IO
- a janela visual mantém 60 amostras recentes

### 5. Persistência e rastreabilidade

Apresente as tabelas principais:

- `organizations`, `organization_members`, `patients`
- `devices`, `device_status`, `device_assignment_history`
- `telemetry_logs`, `events`, `event_telemetry_evidence`
- `alerts`, `alert_actions`, `audit_logs`

Explique que o histórico guarda `organization_id`, `patient_id` e vínculo do dispositivo no momento da ingestão.

### 6. Fluxo de alerta

Use movimento controlado de bancada ou um publisher de teste. Nunca simule queda com uma pessoa.

Opção sem hardware:

```powershell
npm run mqtt:watch --prefix backend
npm run mqtt:publish:test --prefix backend -- --device esp32_01 --count 10
```

Fluxo explicado:

1. firmware publica evento no canal `events`
2. backend resolve dispositivo e escopo
3. evento é salvo em `events`
4. queda procura telemetria recente como evidência
5. alerta interno é criado quando a regra permite
6. `alert:new` atualiza o painel autorizado
7. reenvio com o mesmo `event_uuid` não cria duplicata

### 7. Histórico, exportação e auditoria parcial

Abra **Alertas e Histórico** e demonstre:

1. aplique filtros de status, severidade, dispositivo e período
2. clique em **Exportar JSON** e mostre `generatedAt`, organização, filtros, total e itens
3. clique em **Exportar PDF** e mostre a visualização imprimível do navegador
4. abra os detalhes de um alerta e mostre as ações registradas
5. demonstre **Confirmar atendimento**, resolver ou cancelar sem observação obrigatória

Explique que a exportação usa a rota protegida `GET /api/alerts/export`, respeita JWT, `X-Organization-Id` e o mesmo escopo multi-tenant da tela. O backend limita o relatório a `500` registros. Acknowledge, cancelamento e resolução geram rastreabilidade em `alert_actions` e `audit_logs` quando aplicável.

### 8. Gestão segura para repetir a demo

1. no detalhe do device, desvincule o paciente e mostre que o assignment antigo recebeu fim
2. arquive um paciente sem device e mostre que ele some da lista padrão
3. ative **Mostrar arquivados** para comprovar que o paciente não foi apagado
4. use **Desparear para demo** somente após confirmação forte
5. volte ao fluxo de pairing existente e faça novo claim

Explique que reset de claim e arquivamento são ações auditadas e não apagam telemetria, eventos, alertas ou histórico.

### 9. Evidências de qualidade

Mostre os resultados dos comandos:

- `npm test --prefix backend`: suíte completa Node
- `npm run test:integration --prefix backend`: alertas + MQTT com dependências mockadas
- `npm run stress:dry --prefix backend`: carga em processo local, sem broker/MySQL reais
- `npm run dev:smoke`: login e endpoints reais com serviços locais ativos
- `npm run lint --prefix frontend`
- `npm run build --prefix frontend`

Se precisar demonstrar carga real, use `stress:real` somente em ambiente local/dev preparado. Ele não deve ser executado em produção.

### 10. Limitações e próximos passos

Feche com transparência:

- não há validação clínica
- FFT continua experimental e não decide quedas reais
- bateria automática ainda depende de ADC calibrado ou fuel gauge
- fila principal de eventos críticos é limitada; persistência durável pode evoluir
- testes ponta a ponta com hardware, rede e movimentos controlados precisam ser repetidos em mais cenários
- o PDF depende da caixa de impressão do navegador e pode variar visualmente entre navegadores
- QR Code e alterações no pareamento não fazem parte desta rodada

## Plano B para falhas durante a apresentação

Se o ESP32 ou a rede falhar:

1. mostre os testes automatizados já executados
2. use `mqtt:publish:test` para demonstrar backend, banco e frontend
3. diferencie claramente dado simulado de dado real
4. mostre `docs/assets/screenshots` apenas como capturas reais anteriores

Se o smoke falhar:

```powershell
npm run dev:check
powershell -ExecutionPolicy Bypass -File .\scripts\start-all.ps1 -NoBrowser
npm run dev:smoke
```

Se o dashboard não atualizar:

- confirme `mqtt:watch`
- confirme logs do backend
- confirme Socket.IO conectado
- confirme organização ativa e vínculo do dispositivo

## Roteiro v0.9.0

1. Entre com JWT e mostre o device vinculado sem alterar pareamento.
2. Abra o portal ESP32 e compare os modos Normal e Demo apresentação.
3. Ative Demo e mostre no detalhe `25 ms` de leitura, `500 ms` de MQTT e gráfico mais fluido.
4. Em cama, almofada ou superfície macia, deixe a caixinha parada, aplique impacto controlado, vire/deite e aguarde ao menos `1 s`.
5. Mostre a diferença entre Movimento intenso, Queda suspeita e Queda confirmada.
6. Explique que o buzzer só toca para queda confirmada/SOS.
7. Confirme/resolva um alerta e exporte JSON/PDF.
8. Informe uma bateria manual no portal e mostre percentual estimado, autonomia, última calibração e taxa aprendida.
9. Reforce: não testar queda com pessoa, não jogar o sensor com força, bateria não é medição elétrica real e FFT continua experimental.
