# Estimativa experimental de bateria

A bateria exibida no dashboard é uma estimativa por tempo, recalibrada manualmente pelo portal ESP32. Ela não é uma medição elétrica real e não substitui ADC calibrado ou fuel gauge.

## Cálculo inicial

A taxa inicial é `33.5 min/%`, obtida da observação aproximada:

- `100%` às `01:37`
- `96%` às `03:51`
- queda de `4%` em aproximadamente `134 min`
- autonomia projetada nesse cenário: cerca de `56 h`

O backend calcula:

```text
estimatedBattery = manualBatteryPercent - elapsedMinutes / batteryMinutesPerPercent
```

O resultado visual usa piso inteiro e é limitado entre `0%` e `100%`.

## Recalibração manual

Ao preencher `Bateria atual (%)` no portal, o firmware persiste percentual, horário e sequência em NVS. O backend registra uma calibração nova de forma idempotente, reinicia o ponto temporal da estimativa e atualiza o snapshot do device.

Sem calibração manual, o frontend deve mostrar `--%` ou `não informado`.

## Aprendizado gradual

Quando uma nova calibração plausível reduz o percentual após tempo suficiente:

```text
observedMinutesPerPercent = elapsedMinutes / percentDrop
newRate = oldRate * 0.7 + observedMinutesPerPercent * 0.3
```

O sistema ignora aumento de percentual, queda zero, intervalo menor que `10 min`, timestamp inválido e taxa observada fora de `5..120 min/%`.

## Persistência segura

A migração é incremental e idempotente:

```powershell
npm run db:migrate:battery-estimation --prefix backend
```

Ela não executa reset do banco. Payloads MQTT antigos ou sem campos de bateria continuam aceitos; `battery_calibration_count` ausente é normalizado para `0`.

## Limitações

- anotações manuais imprecisas afetam a estimativa
- consumo varia com Wi-Fi, MQTT, sensor, buzzer e qualidade do sinal
- reinícios e mudanças de alimentação podem alterar o cenário
- somente medição elétrica dedicada pode representar carga real com maior confiança
