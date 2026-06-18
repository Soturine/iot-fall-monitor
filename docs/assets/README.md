# Assets do Projeto

Esta pasta reúne os arquivos visuais utilizados na documentação do projeto **IoT Fall Monitor**.

O objetivo é manter em um único local as imagens, diagramas, mockups, prints e fotos reais do protótipo, facilitando a organização da documentação técnica, apresentações e entregas acadêmicas.

## Sobre o projeto

O **IoT Fall Monitor** é um sistema IoT voltado ao monitoramento de quedas e imobilidade de idosos.

A proposta do sistema é utilizar um dispositivo embarcado com sensor inercial para identificar movimentos compatíveis com queda, validar períodos de imobilidade e enviar alertas para uma aplicação de monitoramento acessada por cuidadores ou familiares.

A arquitetura do projeto segue o modelo de **5 camadas IoT**:

1. **Camada Física**: ESP32, sensor inercial, botão SOS, buzzer/LED e alimentação.
2. **Camada de Conexão**: Wi-Fi, MQTT e HTTP/REST.
3. **Camada de Edge**: filtragem, análise local, regras de limiar e validação por imobilidade.
4. **Camada de Armazenamento**: API, banco de dados, logs e histórico de eventos.
5. **Camada de Aplicação**: dashboard, alertas, relatórios e visualização dos dados.

## Tipos de arquivos nesta pasta

Os arquivos desta pasta podem representar:

- diagramas da arquitetura;
- fluxo de dados do sistema;
- mockups da interface;
- prints do dashboard;
- fotos do protótipo físico;
- imagens dos componentes eletrônicos;
- registros de testes;
- materiais usados na apresentação do projeto.

## Imagens atuais

As imagens existentes nesta pasta representam materiais visuais de apoio ao desenvolvimento e documentação do projeto.

Quando forem adicionadas fotos reais do protótipo, elas devem ser separadas dos mockups e diagramas para deixar claro o que é representação conceitual e o que é evidência prática do desenvolvimento.

## Sugestão de organização

Para manter a pasta organizada, recomenda-se usar nomes descritivos nos arquivos:

```text
docs/assets/
├── arquitetura-5-camadas.png
├── fluxo-dados-alerta.png
├── dashboard-mockup.png
├── dashboard-print-real.png
├── prototipo-esp32-mpu6050.jpg
├── montagem-prototipo-01.jpg
├── montagem-prototipo-02.jpg
├── teste-sensor-queda.jpg
└── componentes-hardware.jpg
