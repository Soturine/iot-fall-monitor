# Assets visuais reais

Esta pasta guarda capturas reais do projeto Queda rodando localmente ou em hardware real. Não versionar mockups, imagens simuladas ou screenshots editados como se fossem capturas reais.

## Estrutura

- `screenshots/`: imagens estáticas reais da interface web e do portal do ESP32.
- `gifs/`: GIFs reais de fluxos em tempo real, quando capturados.

## Screenshots capturados na v0.8.26

Os arquivos abaixo foram capturados do projeto rodando localmente:

- `screenshots/login-v0.8.26.png`: login/cadastro.
- `screenshots/dashboard-v0.8.26.png`: dashboard multi-tenant em estado real do backend local.
- `screenshots/patients-v0.8.26.png`: pacientes e vínculo com dispositivo.
- `screenshots/devices-v0.8.26.png`: inventário de dispositivos e estado vazio real do escopo atual.
- `screenshots/alerts-v0.8.26.png`: tela de alertas e histórico.
- `screenshots/organization-v0.8.26.png`: organização ativa, membros e permissões.

## Screenshots pendentes

Use estes nomes quando as telas forem capturadas:

- `screenshots/device-detail-telemetry-v0.8.26.png`: detalhe do dispositivo com telemetria real ou diagnóstico real.
- `screenshots/esp32-portal-v0.8.26.png`: portal local real do ESP32.

## GIF esperado

- `gifs/realtime-alert-flow-v0.8.26.gif`: fluxo real ESP32/evento -> MQTT -> backend -> dashboard atualizando.

## Checklist para capturar

1. Subir broker, backend e frontend.
2. Abrir o frontend em uma base local real, com usuário e organização de teste.
3. Usar dados reais do ESP32 ou dados de desenvolvimento claramente identificados como ambiente local.
4. Remover qualquer dado sensível visível antes de versionar a imagem.
5. Conferir que o arquivo está em `docs/assets/screenshots/` ou `docs/assets/gifs/`.
6. Atualizar o README para referenciar apenas arquivos que realmente existam no repositório.

## Estado atual

Na `v0.8.26`, foram adicionados screenshots reais da interface web. O GIF realtime, o detalhe do dispositivo com telemetria e o portal ESP32 continuam pendentes porque exigem execução local com device visível, hardware ou evento real.
