# v0.9.0 - Demo acadêmica integrada

## Resumo

A `v0.9.0` consolida uma demonstração acadêmica ponta a ponta com ESP32 real, MQTT, backend, banco, Socket.IO e frontend. A versão adiciona Modo Demo, telemetria visual mais fluida, evidência explicável da decisão de queda e estimativa experimental de bateria por calibração manual.

## Principais mudanças

- configuração nova/factory inicia em **Demo apresentação**, respeitando escolhas Normal/Demo já salvas em NVS
- Modo Demo usa leitura interna a `25 ms`, publicação MQTT a `500 ms` e thresholds próprios para teste controlado em superfície macia
- buzzer permanece reservado a queda confirmada e SOS
- status e eventos expõem modo, intervalos, thresholds e etapas de impacto/orientação/imobilidade
- bateria estimada usa taxa inicial de `33.5 min/%`, recalibração manual e aprendizado suavizado `70/30`
- ingestão MQTT aceita payloads antigos ou sem bateria e normaliza `battery_calibration_count` ausente para `0`
- frontend possui título/favicon próprios, gráfico com até `120` amostras em Demo e contexto visual da bateria estimada
- README e documentação foram reorganizados, com modelo de dados Mermaid e evidências visuais reais
- fechamento técnico explicita autenticação JWT, papéis, escopo multi-tenant por `X-Organization-Id` e a separação entre sessão web e MQTT do device
- backend documentado como arquitetura em camadas/MVC-like, com routes/controllers, services, middlewares, acesso MySQL, bridge MQTT e Socket.IO separados

## Evidências reais

- device online com MQTT e Modo Demo
- gráfico real com `120` amostras
- portal ESP32 operacional
- queda confirmada com imobilidade registrada
- bateria estimada em `95%`, calibrada manualmente em `96%`, taxa `33.5 min/%` e autonomia aproximada de `53 h`
- tour visual lento da interface capturado com o sensor em repouso

O tour visual não representa uma nova queda em tempo real. Um GIF real de nova queda controlada, do ESP32 até o dashboard, permanece como evolução futura.

## Validação

- `git diff --check`: passou
- `npm run check --prefix backend`: passou, `87` arquivos validados
- `npm test --prefix backend`: passou, `64/64`
- `npm run test:integration --prefix backend`: passou, `42/42`
- `npm run test:mqtt --prefix backend`: passou, `16/16`
- `npm run lint --prefix frontend`: passou
- `npm run build --prefix frontend`: passou

## Limitações conhecidas

- sistema experimental, sem validação clínica
- bateria estimada por tempo, não medição elétrica real
- FFT/Fourier continua experimental e desligada como decisão principal
- demonstrações físicas devem usar somente a caixinha/sensor em cama, almofada ou superfície macia
- mais cenários, repetições e dataset real ainda são necessários
