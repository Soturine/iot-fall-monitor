# Assets visuais reais

Esta pasta guarda somente capturas reais do projeto rodando localmente ou no hardware. Não versionar mockups, imagens simuladas ou screenshots antigas renomeadas como se fossem atuais.

## Estado da v0.9.0

Em 9 de junho de 2026, as capturas abaixo foram registradas diretamente do projeto rodando com ESP32 real online, MQTT ativo, backend, Socket.IO e frontend. Nenhum mockup foi usado.

## Capturas reais adicionadas

- `screenshots/devices-list-v0.9.0.png`: lista de devices com `esp32_01` online, claimed e em Demo.
- `screenshots/device-detail-online-v0.9.0.png`: detalhe do device online e diagnóstico MQTT.
- `screenshots/device-detail-telemetry-v0.9.0.png`: gráfico isolado com `120` amostras reais.
- `screenshots/demo-mode-v0.9.0.png`: telemetria e snapshot mostrando Demo, `25 ms` e MQTT `500 ms`.
- `screenshots/alerts-fall-confirmed-v0.9.0.png`: alerta real de queda com imobilidade confirmada.
- `screenshots/esp32-maintenance-overview-v0.9.0.png`: portal real com estado ONLINE e AP de manutenção.
- `screenshots/esp32-maintenance-health-v0.9.0.png`: Wi-Fi, MQTT, backend API e pronto para operar.
- `screenshots/esp32-maintenance-mqtt-config-v0.9.0.png`: identidade e configuração MQTT sem credenciais preenchidas.
- `screenshots/esp32-maintenance-battery-demo-v0.9.0.png`: bateria não informada e modo Demo recomendado.
- `screenshots/esp32-portal-v0.9.0.png`: pré-calibração real com thresholds Demo e buzzer habilitado.
- `screenshots/battery-estimation-v0.9.0.png`: device online com bateria estimada em `95%`, calibração manual, autonomia e Modo Demo.
- `gifs/ui-tour-v0.9.0.gif`: tour lento de oito telas reais, capturado com o sensor em repouso.

## Capturas pendentes

- `gifs/realtime-fall-demo-v0.9.0.gif`

A bateria foi capturada somente após uma calibração manual válida aparecer no device real. O tour da interface não simula movimento nem queda; o GIF realtime de uma nova queda controlada permanece pendente até ser possível registrar o fluxo completo em velocidade legível.

## Capturas históricas reais

Os arquivos abaixo foram capturados do projeto `v0.8.26` rodando localmente e permanecem como histórico:

- `screenshots/login-v0.8.26.png`
- `screenshots/dashboard-v0.8.26.png`
- `screenshots/patients-v0.8.26.png`
- `screenshots/devices-v0.8.26.png`
- `screenshots/alerts-v0.8.26.png`
- `screenshots/organization-v0.8.26.png`

Eles não devem ser apresentados como documentação visual principal da `v0.9.0`.

## Checklist para captura manual

1. Suba broker, backend e frontend e confirme o ESP32 online.
2. Confirme que a tela mostra dados reais do ambiente atual.
3. No portal ESP32, oculte senhas, tokens, IPs sensíveis e credenciais.
4. Capture modo Demo, bateria estimada, telemetria recente e saúde operacional.
5. Para o GIF de queda, registre apenas um fluxo real curto de evento até atualização do dashboard e preserve tempo suficiente para leitura.
6. Salve o arquivo com um dos nomes esperados acima.
7. Confira visualmente que não há dados sensíveis.
8. Atualize README e docs para referenciar somente arquivos existentes.
