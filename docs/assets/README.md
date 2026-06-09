# Assets visuais reais

Esta pasta guarda somente capturas reais do projeto rodando localmente ou no hardware. Não versionar mockups, imagens simuladas ou screenshots antigas renomeadas como se fossem atuais.

## Estado da v0.9.0

Durante esta rodada, frontend, backend e portal ESP32 não estavam acessíveis simultaneamente para captura verificável. Portanto, nenhum screenshot ou GIF `v0.9.0` foi criado.

Capturas pendentes:

- `screenshots/devices-v0.9.0.png`
- `screenshots/device-detail-telemetry-v0.9.0.png`
- `screenshots/battery-estimation-v0.9.0.png`
- `screenshots/demo-mode-v0.9.0.png`
- `screenshots/esp32-portal-v0.9.0.png`
- `screenshots/esp32-maintenance-overview-v0.9.0.png`
- `screenshots/esp32-maintenance-health-v0.9.0.png`
- `screenshots/esp32-maintenance-mqtt-config-v0.9.0.png`
- `screenshots/esp32-maintenance-battery-demo-v0.9.0.png`
- `screenshots/device-detail-online-v0.9.0.png`
- `screenshots/devices-list-v0.9.0.png`
- `gifs/realtime-fall-demo-v0.9.0.gif`

Não referencie esses arquivos no README principal antes de eles existirem.

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
5. Para o GIF, registre apenas um fluxo real curto de evento até atualização do dashboard.
6. Salve o arquivo com um dos nomes esperados acima.
7. Confira visualmente que não há dados sensíveis.
8. Atualize README e docs para referenciar somente arquivos existentes.
