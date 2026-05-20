# Assets visuais reais

Esta pasta guarda capturas reais do projeto Queda rodando localmente ou em hardware real. Não versionar mockups, imagens simuladas ou screenshots editados como se fossem capturas reais.

## Estrutura

- `screenshots/`: imagens estáticas reais da interface web e do portal do ESP32.
- `gifs/`: GIFs reais de fluxos em tempo real, quando capturados.

## Screenshots esperados

Use estes nomes quando as telas forem capturadas:

- `screenshots/dashboard-v0.8.25.png`: dashboard multi-tenant com status geral.
- `screenshots/device-detail-telemetry-v0.8.25.png`: detalhe do dispositivo com telemetria real ou diagnóstico real.
- `screenshots/alerts-v0.8.25.png`: tela de alertas e histórico.
- `screenshots/login-v0.8.25.png`: login/cadastro.
- `screenshots/patients-v0.8.25.png`: pacientes e vínculo com dispositivo.
- `screenshots/esp32-portal-v0.8.25.png`: portal local real do ESP32.

## GIF esperado

- `gifs/realtime-alert-flow-v0.8.25.gif`: fluxo real ESP32/evento -> MQTT -> backend -> dashboard atualizando.

## Checklist para capturar

1. Subir broker, backend e frontend.
2. Abrir o frontend em uma base local real, com usuário e organização de teste.
3. Usar dados reais do ESP32 ou dados de desenvolvimento claramente identificados como ambiente local.
4. Remover qualquer dado sensível visível antes de versionar a imagem.
5. Conferir que o arquivo está em `docs/assets/screenshots/` ou `docs/assets/gifs/`.
6. Atualizar o README para referenciar apenas arquivos que realmente existam no repositório.

## Estado atual

Nesta rodada, a estrutura foi criada sem screenshots ou GIFs, porque não havia capturas reais disponíveis no repositório e nenhuma captura automática confiável foi executada.
