# Demo acadêmica v0.9.0

Este roteiro curto demonstra a integração real do `iot-fall-monitor` sem tratar o protótipo como dispositivo clínico.

## Preparação

1. Suba broker, backend e frontend sem resetar o banco.
2. Confirme login JWT, organização ativa e device vinculado.
3. Reinicie o ESP32 e acompanhe Serial Monitor e `mqtt:watch`.
4. Confirme `sensor_ready=1`, `sensor_valid=1`, MQTT conectado e telemetria recente.
5. Abra o portal ESP32 e confira o modo de operação.

A configuração nova/factory inicia em **Demo apresentação**. Se o dispositivo já possui NVS salva como Normal, ele continua em Normal até a troca explícita no portal.

## Perfil Demo apresentação

| Parâmetro | Demo | Normal |
| --- | ---: | ---: |
| Leitura interna | `25 ms` | `50 ms` |
| Telemetria MQTT | `500 ms` | `2000 ms` |
| Impacto | `1.70 g` | `2.20 g` |
| Giroscópio | `100 dps` | `120 dps` |
| Orientação | `30°` | `45°` |
| Imobilidade | `1000 ms` | `2000 ms` |

Demo facilita a apresentação acadêmica, mas não representa calibração clínica.

## Evidências visuais reais

- [Device online e diagnóstico MQTT](assets/screenshots/device-detail-online-v0.9.0.png)
- [Gráfico com 120 amostras](assets/screenshots/device-detail-telemetry-v0.9.0.png)
- [Modo Demo, leitura 25 ms e MQTT 500 ms](assets/screenshots/demo-mode-v0.9.0.png)
- [Portal ESP32 online](assets/screenshots/esp32-maintenance-overview-v0.9.0.png)
- [Saúde operacional do ESP32](assets/screenshots/esp32-maintenance-health-v0.9.0.png)
- [Configuração MQTT e identidade](assets/screenshots/esp32-maintenance-mqtt-config-v0.9.0.png)
- [Energia e modo Demo](assets/screenshots/esp32-maintenance-battery-demo-v0.9.0.png)
- [Queda confirmada real](assets/screenshots/alerts-fall-confirmed-v0.9.0.png)

A captura de bateria estimada e o GIF realtime continuam pendentes até existirem dados e gravação reais adequados.

## Sequência sugerida

1. Mostre login JWT e o escopo da organização.
2. Mostre o device online, o badge **Modo Demo**, telemetria recente e diagnóstico do sensor.
3. Explique a diferença entre leitura interna rápida, publicação MQTT moderada e evento crítico imediato.
4. Em cama, almofada ou superfície macia, deixe apenas a caixinha parada.
5. Aplique impacto controlado, vire/deite a caixinha e deixe imóvel por pelo menos `1 s`.
6. Mostre a evidência: impacto, orientação, imobilidade e motivo final.
7. Mostre evento, alerta, atualização Socket.IO e histórico.
8. Confirme que o buzzer fica reservado a queda confirmada e SOS.
9. Exporte JSON/PDF e apresente a bateria estimada.

Nunca teste queda com pessoa e não jogue o sensor com força.

## Plano B

Se o hardware ou a rede falhar, use testes automatizados e publisher de desenvolvimento, identificando claramente dados simulados. Capturas reais versionadas ficam inventariadas em [assets/README.md](assets/README.md).
